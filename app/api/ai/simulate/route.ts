import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

function buildSimulatePrompt(config: {
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

  let pronounLine = ''
  if (config.gender === 'masculino') {
    pronounLine = 'Use linguagem masculina (ele/seu) ao se referir a si mesmo.'
  } else if (config.gender === 'feminino') {
    pronounLine = 'Use linguagem feminina (ela/sua) ao se referir a si mesma.'
  }

  const personalityLine = config.personality
    ? `PERSONALIDADE: ${config.personality}\n`
    : ''

  let agentsSection = ''
  if (config.autoAssign && config.agents.length > 0) {
    const agentList = config.agents
      .map((a) => `- ${a.name}${a.agentRole ? `: ${a.agentRole}` : ''}`)
      .join('\n')
    agentsSection = `\nAGENTES DISPONÍVEIS PARA ENCAMINHAMENTO:\n${agentList}\n`
  }

  const assignToAgentField = config.autoAssign ? `\n  "assignToAgent": null` : ''
  const assignToAgentInstruction = config.autoAssign
    ? '\nQuando qualified=true e autoAssign=true, retorne no assignToAgent o nome exato do agente mais adequado baseado nos papéis listados.'
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

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json() as {
      message: string
      history: Array<{ role: 'user' | 'assistant'; content: string }>
    }

    if (!body.message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Load agent config
    const agentConfig = await db.agentConfig.findUnique({
      where: { workspaceId: session.user.workspaceId },
    })

    if (!agentConfig) {
      return NextResponse.json({ error: 'Agente não configurado' }, { status: 404 })
    }

    // Load agents for context
    const agents = await db.user.findMany({
      where: { workspaceId: session.user.workspaceId, isActive: true },
      select: { id: true, name: true, agentRole: true },
    })

    const systemPrompt = buildSimulatePrompt({
      name: agentConfig.name,
      objective: agentConfig.objective,
      tone: agentConfig.tone,
      knowledgeAreas: agentConfig.knowledgeAreas,
      gender: agentConfig.gender,
      personality: agentConfig.personality,
      autoAssign: agentConfig.autoAssign,
      agents,
    })

    const aiResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...(body.history ?? []),
        { role: 'user', content: body.message },
      ],
    })

    const rawText = aiResponse.choices[0].message.content ?? ''

    // Parse JSON response
    let responseText = rawText
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        responseText = parsed.response ?? rawText
      }
    } catch {
      // use raw text as fallback
    }

    return NextResponse.json({ response: responseText })
  } catch (error) {
    console.error('[AI SIMULATE]', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
