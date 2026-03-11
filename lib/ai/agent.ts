import OpenAI from 'openai'
import { db } from '@/lib/db'
import { sendUazapiMessage } from '@/lib/integrations/uazapi'
import { pusherServer } from '@/lib/pusher'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface AiAgentResult {
  response: string
  qualified: boolean
  assignToAgent?: string | null
  collectedData: {
    name?: string
    need?: string
    urgency?: string
    bestTime?: string
  }
}

function buildSystemPrompt(config: {
  name: string
  objective: string
  tone: string
  knowledgeAreas: string
  gender: string
  personality: string
  autoAssign: boolean
  agents: Array<{ name: string; agentRole: string | null }>
}): string {
  const toneMap: Record<string, string> = {
    humanizado: 'humanizado, empático e acolhedor — como se fosse uma pessoa real conversando pelo WhatsApp',
    formal: 'formal e profissional, mantendo cordialidade',
    direto: 'direto e objetivo, sem rodeios, mas sempre educado',
  }
  const toneDescription = toneMap[config.tone] ?? toneMap.humanizado

  // Gender pronouns
  let pronounLine = ''
  if (config.gender === 'masculino') {
    pronounLine = 'Use linguagem masculina (ele/seu) ao se referir a si mesmo.'
  } else if (config.gender === 'feminino') {
    pronounLine = 'Use linguagem feminina (ela/sua) ao se referir a si mesma.'
  }

  // Personality
  const personalityLine = config.personality
    ? `PERSONALIDADE: ${config.personality}\n`
    : ''

  // Agents for auto-assign
  let agentsSection = ''
  if (config.autoAssign && config.agents.length > 0) {
    const agentList = config.agents
      .map((a) => `- ${a.name}${a.agentRole ? `: ${a.agentRole}` : ''}`)
      .join('\n')
    agentsSection = `\nAGENTES DISPONÍVEIS PARA ENCAMINHAMENTO:\n${agentList}\n`
  }

  const assignToAgentField = config.autoAssign
    ? `\n  "assignToAgent": null`
    : ''

  const assignToAgentInstruction = config.autoAssign
    ? '\nQuando qualified=true e autoAssign=true, retorne no assignToAgent o nome exato do agente mais adequado para atender esse contato baseado nos papéis listados. Se não houver agente adequado, retorne null.'
    : ''

  return `Você é ${config.name}${config.personality ? '. ' + config.personality : ', assistente virtual'}.

OBJETIVO: ${config.objective || 'Atender, qualificar leads e direcioná-los para a equipe comercial.'}

TOM DE RESPOSTA: ${toneDescription}
${pronounLine ? pronounLine + '\n' : ''}${personalityLine}
${config.knowledgeAreas ? `CONTEXTO DO NEGÓCIO:\n${config.knowledgeAreas}\n` : ''}${agentsSection}
SUAS RESPONSABILIDADES:
1. Recepcionar o contato de forma natural e acolhedora
2. Entender qual é o problema, necessidade ou dúvida da pessoa
3. Qualificar o lead coletando gradualmente (sem interrogatório):
   - Nome completo
   - Problema ou necessidade principal
   - Urgência (se precisa de atendimento urgente ou pode aguardar)
   - Melhor horário para contato de um especialista
4. Quando tiver coletado essas informações → informar que um especialista entrará em contato em breve

REGRAS IMPORTANTES:
- NÃO mencione que você é uma IA ou chatbot, a menos que a pessoa pergunte diretamente
- Responda de forma CURTA, como conversa de WhatsApp — sem blocos longos de texto
- Nunca invente informações sobre o negócio que não foram fornecidas acima
- Se a pessoa perguntar algo fora do escopo, diga que um especialista poderá ajudar melhor
- Colete as informações de forma natural ao longo da conversa, não em lista

FORMATO DE RESPOSTA:
Você DEVE retornar APENAS um JSON válido, sem texto adicional:
{
  "response": "mensagem para enviar ao cliente (texto puro, sem markdown)",
  "qualified": false,${assignToAgentField}
  "collectedData": {
    "name": null,
    "need": null,
    "urgency": null,
    "bestTime": null
  }
}

Defina "qualified": true apenas quando tiver coletado nome, necessidade E urgência/horário.
Preencha "collectedData" com os dados que já foram coletados na conversa (mesmo parcialmente).${assignToAgentInstruction}`
}

async function handleLeadQualification(
  conversationId: string,
  workspaceId: string,
  collectedData: AiAgentResult['collectedData']
) {
  try {
    // Check if lead exists
    const existing = await db.lead.findUnique({ where: { conversationId } })
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: { channel: true },
    })
    if (!conversation) return

    const qualificationNotes = Object.entries(collectedData)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n')

    if (existing) {
      await db.lead.update({
        where: { conversationId },
        data: { qualificationNotes },
      })
    } else {
      await db.lead.create({
        data: {
          conversationId,
          workspaceId,
          sourceChannel: conversation.channel.type,
          qualificationNotes,
        },
      })
    }

    // Update conversation to waiting for agent
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        status: 'WAITING_CLIENT',
        pipelineStage: 'Aguardando',
      },
    })
  } catch (err) {
    console.error('[AI Agent] handleLeadQualification error:', err)
  }
}

export async function processAiResponse(
  conversationId: string,
  workspaceId: string,
  inboundMessage: string
) {
  try {
    // Load agent config
    const agentConfig = await db.agentConfig.findUnique({
      where: { workspaceId },
    })

    if (!agentConfig || !agentConfig.isActive) return

    // Check business hours
    if (agentConfig.businessHoursStart !== null && agentConfig.businessHoursEnd !== null) {
      const hour = new Date().getHours()
      if (hour < agentConfig.businessHoursStart || hour >= agentConfig.businessHoursEnd) {
        // Send off-hours message if configured
        if (agentConfig.offHoursMessage) {
          const conversation = await db.conversation.findUnique({
            where: { id: conversationId },
            include: { channel: true },
          })
          if (conversation?.channel?.provider === 'UAZAPI' && conversation.channel.instanceToken) {
            const phone = conversation.contactPhone ?? conversation.externalId.replace('@s.whatsapp.net', '')
            await sendUazapiMessage(conversation.channel.instanceToken, phone, agentConfig.offHoursMessage)
          }
        }
        return
      }
    }

    // Load conversation with messages
    const conversation = await db.conversation.findUnique({
      where: { id: conversationId },
      include: {
        channel: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
    })

    if (!conversation) return
    if (!conversation.aiEnabled) return

    // Check max AI messages
    if (conversation.aiMessageCount >= agentConfig.maxAiMessages) return

    // Check if already assigned to a human
    if (conversation.assignedToId) return

    // Load workspace agents for auto-assign
    const agents = await db.user.findMany({
      where: { workspaceId, isActive: true },
      select: { id: true, name: true, agentRole: true },
    })

    // Build message history
    const history = conversation.messages
      .filter((m) => !m.isSystem && !m.aiGenerated)
      .map((m) => ({
        role: m.direction === 'INBOUND' ? ('user' as const) : ('assistant' as const),
        content: m.content,
      }))

    // Build system prompt with all new fields
    const systemPrompt = buildSystemPrompt({
      name: agentConfig.name,
      objective: agentConfig.objective,
      tone: agentConfig.tone,
      knowledgeAreas: agentConfig.knowledgeAreas,
      gender: agentConfig.gender,
      personality: agentConfig.personality,
      autoAssign: agentConfig.autoAssign,
      agents,
    })

    // Call OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: inboundMessage },
      ],
    })

    const rawText = aiResponse.choices[0].message.content ?? ''

    // Parse JSON response
    let result: AiAgentResult
    try {
      // Extract JSON from the response (handle cases where model adds text around it)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      result = JSON.parse(jsonMatch[0])
    } catch {
      console.error('[AI Agent] Failed to parse JSON response:', rawText)
      return
    }

    if (!result.response) return

    // Send the response
    if (conversation.channel.provider === 'UAZAPI' && conversation.channel.instanceToken) {
      const phone = conversation.contactPhone ?? conversation.externalId.replace('@s.whatsapp.net', '')
      await sendUazapiMessage(conversation.channel.instanceToken, phone, result.response)
    }

    // Save AI message to DB
    await db.message.create({
      data: {
        conversationId,
        workspaceId,
        direction: 'OUTBOUND',
        content: result.response,
        aiGenerated: true,
        senderName: agentConfig.name,
        status: 'SENT',
      },
    })

    // Update conversation AI message count and preview
    await db.conversation.update({
      where: { id: conversationId },
      data: {
        aiMessageCount: { increment: 1 },
        lastMessagePreview: result.response.slice(0, 100),
        lastMessageAt: new Date(),
      },
    })

    // Pusher: broadcast new message
    await pusherServer.trigger(`workspace-${workspaceId}`, 'new-message', {
      conversationId,
      message: result.response,
      aiGenerated: true,
    })

    // Handle qualification
    if (result.qualified) {
      await handleLeadQualification(conversationId, workspaceId, result.collectedData)

      // Handle auto-assign
      if (result.assignToAgent && agentConfig.autoAssign) {
        const agentName = result.assignToAgent.trim()
        const matchedAgent = agents.find(
          (a) => a.name.toLowerCase() === agentName.toLowerCase()
        )

        if (matchedAgent) {
          await db.conversation.update({
            where: { id: conversationId },
            data: {
              assignedToId: matchedAgent.id,
              assignedById: null,
              assignedAt: new Date(),
              status: 'IN_PROGRESS',
              pipelineStage: 'Em Atendimento',
            },
          })

          // Create activity for the assignment
          await db.conversationActivity.create({
            data: {
              conversationId,
              workspaceId,
              type: 'assigned',
              description: `Agente de IA encaminhou para ${matchedAgent.name}`,
            },
          })

          // Pusher: broadcast assignment
          await pusherServer.trigger(`workspace-${workspaceId}`, 'conversation-assigned', {
            conversationId,
            assignedToId: matchedAgent.id,
            assignedToName: matchedAgent.name,
          })
        }
      }
    }
  } catch (err) {
    console.error('[AI Agent] processAiResponse error:', err)
  }
}

export async function generateConversationSummary(conversationId: string): Promise<string> {
  const messages = await db.message.findMany({
    where: { conversationId, isSystem: false },
    orderBy: { createdAt: 'asc' },
    take: 30,
    include: { sentBy: { select: { name: true } } },
  })

  if (messages.length === 0) return 'Nenhuma mensagem encontrada para resumir.'

  const conversation = messages.map(m => {
    const who = m.direction === 'INBOUND' ? 'Cliente' : (m.sentBy?.name ?? 'Agente/IA')
    return `${who}: ${m.content}`
  }).join('\n')

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Analise essa conversa e crie um resumo executivo em português, em formato de bullet points (usando •). Inclua:
• Identificação do contato (nome se mencionado)
• Problema ou necessidade principal
• Status de qualificação (qualificado / não qualificado / em andamento)
• Dados coletados (urgência, horário preferido, etc.)
• Próximos passos sugeridos

Conversa:
${conversation}`,
    }],
  })

  return response.choices[0].message.content ?? 'Não foi possível gerar o resumo.'
}
