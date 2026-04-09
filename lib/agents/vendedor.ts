import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { sendUazapiMessage } from '@/lib/integrations/uazapi'
import { sendInstagramMessage } from '@/lib/integrations/instagram'
import { sendFacebookMessage } from '@/lib/integrations/facebook'
import { decrypt } from '@/lib/crypto'
import { consumeSoraAttendance } from '@/lib/billing/soraService'
import { buildSystemPrompt } from './vendedor-prompt'
import {
  isBlocked,
  addToDebounceBuffer,
  getDebounceBuffer,
  clearDebounceBuffer,
  setLastAiMessage,
} from './vendedor-redis'

// ─── Types ───

export interface QualificationResult {
  score: number
  notes: string
  needCategory: string
  urgency: 'low' | 'medium' | 'high'
  briefing: string
}

// ─── Multimedia ───

/**
 * Process multimedia message content into text for the AI.
 */
export async function processMessageContent(
  message: { content: string | null; mediaType: string | null; mediaUrl: string | null; transcription: string | null },
): Promise<string> {
  if (message.transcription) return message.transcription

  if (message.mediaType === 'image' && message.mediaUrl) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return message.content || '[Imagem recebida]'
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Descreva essa imagem de forma breve e objetiva em português.' },
              { type: 'image_url', image_url: { url: message.mediaUrl } },
            ],
          }],
        }),
      })
      if (!res.ok) return message.content || '[Imagem recebida]'
      const data = await res.json()
      const description = data.choices?.[0]?.message?.content?.trim()
      return description ? `[Imagem: ${description}]` : message.content || '[Imagem recebida]'
    } catch {
      return message.content || '[Imagem recebida]'
    }
  }

  if (message.mediaType === 'audio') return message.content || '[Áudio recebido - aguardando transcrição]'
  if (message.mediaType === 'document') return message.content || '[Documento recebido]'
  return message.content || ''
}

// ─── Debounce ───

/**
 * Handle inbound message with debounce.
 */
export async function handleInboundWithDebounce(
  conversationId: string,
  message: string,
  workspaceId: string,
  debounceSeconds = 15,
): Promise<void> {
  await addToDebounceBuffer(conversationId, message)
  await new Promise(resolve => setTimeout(resolve, debounceSeconds * 1000))

  const buffer = await getDebounceBuffer(conversationId)
  if (!buffer.length) return

  const lastMsg = buffer[buffer.length - 1]
  if (lastMsg !== message) return

  await clearDebounceBuffer(conversationId)
  const concatenated = buffer.join(' ')
  await processAiResponse(workspaceId, conversationId, concatenated)
}

// ─── Qualification Extraction ───

export async function extractQualification(
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  apiKey: string,
): Promise<QualificationResult | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analise a conversa de vendas e retorne um JSON com:
- score: número 1-10 representando a qualificação BANT (1-3 frio, 4-6 morno, 7-10 quente)
- notes: resumo de 2-3 frases sobre o lead
- needCategory: categoria principal da necessidade (ex: "marketing digital", "direito trabalhista", "contabilidade")
- urgency: "low" | "medium" | "high"
- briefing: resumo de 3-5 frases para o atendente humano que vai assumir a conversa

Responda SOMENTE com o JSON, sem texto adicional.`,
          },
          ...chatHistory,
        ],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) return null
    return JSON.parse(content) as QualificationResult
  } catch {
    return null
  }
}

// ─── Smart Routing ───

async function findBestAgent(
  workspaceId: string,
  needCategory: string,
): Promise<{ id: string; name: string; calendarUrl: string | null } | null> {
  const users = await db.user.findMany({
    where: { workspaceId, isActive: true },
    select: {
      id: true,
      name: true,
      calendarUrl: true,
      role: true,
      specializations: true,
      assignedConversations: {
        where: { status: 'IN_PROGRESS' },
        select: { id: true },
      },
    },
  })

  if (!users.length) return null

  const needle = needCategory.toLowerCase()

  // Filter users with matching specialization
  const matches = users.filter(u =>
    u.specializations.some(s => s.toLowerCase().includes(needle) || needle.includes(s.toLowerCase()))
  )

  const pool = matches.length > 0 ? matches : users.filter(u => u.role === 'ADMIN')
  const finalPool = pool.length > 0 ? pool : users

  // Pick the one with least active conversations (round-robin by load)
  finalPool.sort((a, b) => a.assignedConversations.length - b.assignedConversations.length)
  const best = finalPool[0]

  return { id: best.id, name: best.name, calendarUrl: best.calendarUrl ?? null }
}

// ─── Handoff ───

async function handleHandoff(
  conversationId: string,
  workspaceId: string,
  reason: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  apiKey: string,
): Promise<void> {
  // 1. Extract qualification
  const qualification = await extractQualification(chatHistory, apiKey)

  // 2. Find best agent
  const bestAgent = qualification?.needCategory
    ? await findBestAgent(workspaceId, qualification.needCategory)
    : null

  // 3. Build system message content
  const briefingData = {
    score: qualification?.score ?? null,
    notes: qualification?.notes ?? null,
    needCategory: qualification?.needCategory ?? null,
    urgency: qualification?.urgency ?? null,
    briefing: qualification?.briefing ?? null,
    assignedTo: bestAgent?.name ?? null,
    reason,
  }

  // 4. Update conversation
  const newStage = bestAgent ? 'Em Atendimento' : 'Não Atribuído'
  await db.conversation.update({
    where: { id: conversationId },
    data: {
      aiSalesEnabled: false,
      pipelineStage: newStage,
      qualificationScore: qualification?.score ?? undefined,
      qualificationNotes: qualification?.notes ?? undefined,
      handoffBriefing: qualification?.briefing ?? undefined,
      ...(bestAgent && {
        assignedToId: bestAgent.id,
        status: 'IN_PROGRESS',
        assignedAt: new Date(),
      }),
      ...(!bestAgent && { status: 'UNASSIGNED' }),
    },
  })

  // 5. Save briefing as system message
  const systemMsg = await db.message.create({
    data: {
      conversationId,
      workspaceId,
      direction: 'OUTBOUND',
      content: `[BRIEFING_JSON]${JSON.stringify(briefingData)}`,
      status: 'SENT',
      aiGenerated: true,
      senderName: 'Sistema',
      sentAt: new Date(),
    },
  })

  // 6. Pusher events
  await pusherServer.trigger(`workspace-${workspaceId}`, 'vendedor-handoff', {
    conversationId,
    reason,
    score: qualification?.score,
    assignedTo: bestAgent?.name,
  }).catch(() => {})

  await pusherServer.trigger(`workspace-${workspaceId}`, 'new-message', {
    conversationId,
    message: systemMsg,
  }).catch(() => {})

  if (bestAgent) {
    await pusherServer.trigger(`workspace-${workspaceId}`, 'conversation-assigned', {
      conversationId,
      assignedToId: bestAgent.id,
      assignedToName: bestAgent.name,
    }).catch(() => {})
  }

  console.log(`[VENDEDOR] handoff | conversation=${conversationId} | reason=${reason} | assignedTo=${bestAgent?.name ?? 'none'} | score=${qualification?.score ?? '?'}`)
}

// ─── Send Helper ───

async function sendMessageToChannel(
  channel: { instanceToken: string | null; type: string | null; provider: string | null; accessToken: string | null },
  conversation: { externalId: string; contactPhone: string | null },
  text: string,
): Promise<string> {
  const sendTo = conversation.contactPhone
    ?? conversation.externalId.replace('@s.whatsapp.net', '').replace('@g.us', '')

  if (channel.type === 'WHATSAPP' && channel.provider === 'UAZAPI' && channel.instanceToken) {
    return sendUazapiMessage(channel.instanceToken, sendTo, text)
  } else if (channel.type === 'INSTAGRAM' && channel.accessToken) {
    return sendInstagramMessage(conversation.externalId, text, decrypt(channel.accessToken))
  } else if (channel.type === 'FACEBOOK' && channel.accessToken) {
    return sendFacebookMessage(conversation.externalId, text, decrypt(channel.accessToken))
  }
  throw new Error(`Unsupported channel type=${channel.type} provider=${channel.provider}`)
}

// ─── Core AI Response ───

export async function processAiResponse(
  workspaceId: string,
  conversationId: string,
  userMessage: string,
): Promise<void> {
  // 1. Check if blocked
  if (await isBlocked(conversationId)) {
    console.log(`[VENDEDOR] blocked, skipping | conversation=${conversationId}`)
    return
  }

  // 2. Load config
  const config = await db.aiSalesConfig.findUnique({ where: { workspaceId } })
  if (!config) {
    console.log(`[VENDEDOR] no config found | workspace=${workspaceId}`)
    return
  }

  // 3. Load conversation
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      aiSalesEnabled: true,
      aiSalesMessageCount: true,
      qualificationScore: true,
      aiContextSummary: true,
      contactName: true,
      contactPhone: true,
      channelId: true,
      externalId: true,
      dispatchListId: true,
      assignedToId: true,
    },
  })
  if (!conversation?.aiSalesEnabled) return

  // 4. Check max messages
  if (conversation.aiSalesMessageCount >= config.maxMessagesPerConversation) {
    console.log(`[VENDEDOR] max messages reached | conversation=${conversationId}`)
    const apiKey = process.env.OPENAI_API_KEY ?? ''
    const recentForHandoff = await loadChatHistory(conversationId)
    await handleHandoff(conversationId, workspaceId, 'Limite de mensagens atingido', recentForHandoff, apiKey)
    return
  }

  // 5. Billing — consume 1 atendimento on the first AI message of the conversation
  if (conversation.aiSalesMessageCount === 0) {
    const billing = await consumeSoraAttendance(workspaceId, conversationId)
    if (billing.source === 'blocked') {
      console.log(`[SORA] no attendances left | workspace=${workspaceId}`)
      return
    }
    console.log(`[SORA] attendance consumed source=${billing.source} | workspace=${workspaceId}`)
  }

  // 6. Get channel
  if (!conversation.channelId) return
  const channel = await db.channel.findUnique({
    where: { id: conversation.channelId },
    select: { instanceToken: true, type: true, provider: true, accessToken: true },
  })
  if (!channel) return
  if (!channel.instanceToken && !channel.accessToken) {
    console.log(`[SORA] channel has no credentials | conversation=${conversationId}`)
    return
  }

  // 7. Load lead context from dispatch list
  let leadContext: { name?: string; businessType?: string; reviewSummary?: string } | undefined
  if (conversation.dispatchListId) {
    const contact = await db.dispatchListContact.findFirst({
      where: { listId: conversation.dispatchListId, phone: conversation.contactPhone ?? undefined },
      select: { name: true, businessType: true, reviewSummary: true },
    })
    if (contact) {
      leadContext = {
        name: contact.name ?? undefined,
        businessType: contact.businessType ?? undefined,
        reviewSummary: contact.reviewSummary ?? undefined,
      }
    }
  }

  // 7B. Fallback: use contact name when no dispatch context
  if (!leadContext && conversation.contactName) {
    leadContext = { name: conversation.contactName }
  }

  // 8. Build system prompt
  const { inferStage } = await import('./vendedor-prompt')
  const stage = inferStage(conversation.aiSalesMessageCount, conversation.qualificationScore)
  const mode = conversation.dispatchListId ? 'campaign_followup' : 'inbound_sales'
  const channelType = (channel.type ?? 'WHATSAPP') as 'WHATSAPP' | 'INSTAGRAM' | 'FACEBOOK'

  const systemPrompt = buildSystemPrompt(config, leadContext, {
    mode,
    channelType,
    stage,
    contextSummary: conversation.aiContextSummary ?? undefined,
  })

  // 9. Load chat history
  const chatHistory = await loadChatHistory(conversationId)
  chatHistory.push({ role: 'user', content: userMessage })

  // 10. Call OpenAI
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.error('[VENDEDOR] OPENAI_API_KEY not set')
    return
  }

  const handoffMinScore = config.handoffMinScore ?? 7

  // 10A. Early qualification for long messages (high intent signal)
  if (userMessage.length > 200 && conversation.aiSalesMessageCount >= 1) {
    const earlyQual = await extractQualification(chatHistory, apiKey)
    if (earlyQual && earlyQual.score >= handoffMinScore) {
      // Send a natural handoff message before transferring
      const handoffMsg = 'Entendi seu caso! Vou encaminhar para um especialista que vai poder te ajudar melhor com isso.'
      const earlyExternalId = await sendMessageToChannel(channel, conversation, handoffMsg).catch(() => '')
      await db.message.create({
        data: {
          conversationId, workspaceId, direction: 'OUTBOUND',
          content: handoffMsg, externalId: earlyExternalId || undefined,
          status: earlyExternalId ? 'SENT' : 'FAILED',
          aiGenerated: true, senderName: config.agentName ?? 'Sora', sentAt: new Date(),
        },
      })
      await pusherServer.trigger(`workspace-${workspaceId}`, 'new-message', { conversationId }).catch(() => {})
      await generateContextSummary(conversationId, chatHistory, apiKey).catch(() => {})
      await handleHandoff(conversationId, workspaceId, `Qualificação antecipada (score ${earlyQual.score})`, chatHistory, apiKey)
      console.log(`[SORA] early handoff | conversation=${conversationId} | score=${earlyQual.score}`)
      return
    }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: config.model || 'gpt-4.1-mini',
      temperature: 0.7,
      max_tokens: 500,
      messages: [{ role: 'system', content: systemPrompt }, ...chatHistory],
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[VENDEDOR] OpenAI error: ${res.status} ${body.slice(0, 200)}`)
    return
  }

  const data = await res.json()
  const aiContent = data.choices?.[0]?.message?.content?.trim()
  if (!aiContent) return

  // 11. Detect actions
  const hasHandoff = aiContent.includes('[HANDOFF]')

  let cleanContent = aiContent.replace(/\[HANDOFF\]/g, '').trim()

  // 13. Split into lines and send
  const lines = cleanContent
    .replace(/"/g, '')
    .replace(/\*\*/g, '*')
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0)

  const allSentLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const externalId = await sendMessageToChannel(channel, conversation, line).catch((err) => {
      console.error(`[SORA] send failed | conversation=${conversationId}`, err)
      return ''
    })
    const savedMsg = await db.message.create({
      data: {
        conversationId,
        workspaceId,
        direction: 'OUTBOUND',
        content: line,
        externalId: externalId || undefined,
        status: externalId ? 'SENT' : 'FAILED',
        aiGenerated: true,
        senderName: config.agentName ?? 'Sora',
        sentAt: new Date(),
      },
    })
    await pusherServer.trigger(`workspace-${workspaceId}`, 'new-message', {
      conversationId, message: savedMsg,
    })
    allSentLines.push(line)
    if (i < lines.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000))
    }
  }

  // 14. Update conversation metadata
  const newMsgCount = conversation.aiSalesMessageCount + 1
  await db.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: allSentLines[allSentLines.length - 1]?.slice(0, 100) ?? '',
      aiSalesMessageCount: newMsgCount,
    },
  })

  // 16. Store last AI message for human takeover detection
  await setLastAiMessage(conversationId, allSentLines.join('\n'))

  console.log(`[SORA] response sent | conversation=${conversationId} | lines=${lines.length} | totalMsgs=${newMsgCount}`)

  // 17. Rule-based qualification + auto handoff (every 3 AI messages, or at message 2)
  if (newMsgCount >= 2 && (newMsgCount % 3 === 0 || newMsgCount === 2)) {
    const qualification = await extractQualification(chatHistory, apiKey)
    if (qualification) {
      await db.conversation.update({
        where: { id: conversationId },
        data: { qualificationScore: qualification.score, qualificationNotes: qualification.notes },
      })

      // High-intent keyword fallback
      const HIGH_INTENT_KEYWORDS = [
        'quero contratar', 'preciso de', 'quero fechar', 'pode me ajudar com',
        'quanto custa', 'como funciona para contratar', 'quero saber mais sobre',
        'tenho interesse', 'gostaria de contratar', 'quero uma proposta',
      ]
      const lowerMsg = userMessage.toLowerCase()
      const hasHighIntent = HIGH_INTENT_KEYWORDS.some(k => lowerMsg.includes(k))

      // Auto handoff: score >= threshold OR high-intent keywords detected
      if (qualification.score >= handoffMinScore || hasHighIntent) {
        const reason = hasHighIntent && qualification.score < handoffMinScore
          ? `Intenção alta detectada (score ${qualification.score}, keywords)`
          : `Lead qualificado (score ${qualification.score}/${handoffMinScore})`
        await generateContextSummary(conversationId, chatHistory, apiKey).catch(() => {})
        await handleHandoff(conversationId, workspaceId, reason, chatHistory, apiKey)
        console.log(`[SORA] auto handoff | conversation=${conversationId} | reason=${reason}`)
        return
      }
    }
  }

  // 18. Generate cumulative summary every 10 AI messages
  if (newMsgCount % 10 === 0) {
    generateContextSummary(conversationId, chatHistory, apiKey).catch(
      (err) => console.error('[SORA] summary generation error:', err),
    )
  }

  // 19. Handle handoff if AI explicitly requested it
  if (hasHandoff) {
    await generateContextSummary(conversationId, chatHistory, apiKey).catch(() => {})
    await handleHandoff(conversationId, workspaceId, 'AI solicitou handoff', chatHistory, apiKey)
  }
}

// ─── Context Summary ───

async function generateContextSummary(
  conversationId: string,
  chatHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
  apiKey: string,
): Promise<void> {
  const summaryPrompt = `Você é um assistente que cria resumos estruturados de conversas de vendas.

Analise a conversa abaixo e crie um resumo ESTRUTURADO com:
- **Perfil do lead**: nome, empresa, cargo (se mencionado)
- **Necessidade identificada**: o que o lead está buscando
- **BANT coletado**: Budget, Authority, Need, Timeline (apenas o que foi mencionado)
- **Objeções levantadas**: se houver
- **Estágio**: NEW / DISCOVERY / QUALIFYING / PROPOSAL
- **Próximos passos**: o que foi combinado ou deve acontecer

Seja conciso. Use bullet points. Português brasileiro.`

  const summaryMessages = [
    { role: 'system' as const, content: summaryPrompt },
    ...chatHistory.slice(-20),
    { role: 'user' as const, content: 'Gere o resumo estruturado da conversa acima.' },
  ]

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      max_tokens: 400,
      messages: summaryMessages,
    }),
  })

  if (!res.ok) return

  const data = await res.json()
  const summary = data.choices?.[0]?.message?.content?.trim()
  if (!summary) return

  await db.conversation.update({
    where: { id: conversationId },
    data: { aiContextSummary: summary },
  })

  console.log(`[SORA] context summary updated | conversation=${conversationId}`)
}

// ─── Helpers ───

async function loadChatHistory(
  conversationId: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const recentMessages = await db.message.findMany({
    where: { conversationId, isSystem: false },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { direction: true, content: true, transcription: true },
  })
  return recentMessages
    .reverse()
    .filter(m => m.content || m.transcription)
    .map(m => ({
      role: m.direction === 'INBOUND' ? 'user' as const : 'assistant' as const,
      content: m.transcription || m.content || '',
    }))
}
