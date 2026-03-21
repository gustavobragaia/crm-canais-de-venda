interface ProductService {
  name: string
  price: string
  description: string
}

interface Objection {
  objection: string
  response: string
}

interface AiSalesConfigInput {
  agentName: string | null
  tone: string
  businessName: string | null
  businessDescription: string | null
  targetAudience: string | null
  differentials: string | null
  productsServices: ProductService[] | unknown
  commonObjections: Objection[] | unknown
  objectives: string[] | unknown
  calendarUrl: string | null
  systemPrompt: string | null
  useCustomPrompt: boolean
}

interface LeadContext {
  name?: string
  businessType?: string
  reviewSummary?: string
}

export function buildSystemPrompt(config: AiSalesConfigInput, leadContext?: LeadContext): string {
  if (config.useCustomPrompt && config.systemPrompt) {
    return config.systemPrompt
  }

  const products = Array.isArray(config.productsServices)
    ? (config.productsServices as ProductService[])
    : []

  const objections = Array.isArray(config.commonObjections)
    ? (config.commonObjections as Objection[])
    : []

  const objectives = Array.isArray(config.objectives)
    ? (config.objectives as string[])
    : ['qualify', 'schedule']

  const toneMap: Record<string, string> = {
    formal: 'Formal e profissional',
    informal: 'Informal e amigável',
    descontraido: 'Descontraído e divertido',
  }

  const sections: string[] = []

  sections.push(
    `Você é ${config.agentName || 'um vendedor SDR'}, vendedor(a) da ${config.businessName || 'empresa'}.`,
    `Tom de voz: ${toneMap[config.tone] || config.tone}.`,
  )

  if (config.businessDescription) {
    sections.push(`\n## Sobre a Empresa\n${config.businessDescription}`)
  }

  if (products.length > 0) {
    const list = products.map(p => `- ${p.name}: R$${p.price} — ${p.description}`).join('\n')
    sections.push(`\n## Produtos/Serviços\n${list}`)
  }

  if (config.targetAudience) {
    sections.push(`\n## Público-Alvo\n${config.targetAudience}`)
  }

  if (config.differentials) {
    sections.push(`\n## Diferenciais\n${config.differentials}`)
  }

  if (leadContext && (leadContext.name || leadContext.businessType || leadContext.reviewSummary)) {
    const parts: string[] = []
    if (leadContext.name) parts.push(`Nome: ${leadContext.name}`)
    if (leadContext.businessType) parts.push(`Tipo de negócio: ${leadContext.businessType}`)
    if (leadContext.reviewSummary) parts.push(`Resumo das avaliações: ${leadContext.reviewSummary}`)
    sections.push(`\n## Informações do Lead\n${parts.join('\n')}`)
  }

  sections.push(`\n## Processo de Qualificação (BANT)
Avalie naturalmente na conversa:
- Budget: Tem capacidade de investir?
- Authority: É o decisor?
- Need: Tem o problema que resolvemos?
- Timeline: Precisa resolver agora?
Score: 1-3 frio, 4-6 morno, 7-10 quente`)

  sections.push(`\n## Regras
1. Mensagens CURTAS (2-3 linhas max)
2. Seja natural como um humano no WhatsApp
3. NUNCA diga que é IA ou robô
4. Use emojis com moderação
5. Português brasileiro
6. Não repita informações já ditas`)

  sections.push(`\n## Fluxo de Venda
1. Apresentação → 2. Descoberta (2-3 perguntas) → 3. Qualificação → 4. Proposta de valor → 5. Quebra de objeções → 6. Ação`)

  if (objections.length > 0) {
    const list = objections.map(o => `- "${o.objection}" → ${o.response}`).join('\n')
    sections.push(`\n## Objeções Comuns\n${list}`)
  }

  const actions: string[] = []
  if (objectives.includes('schedule')) {
    actions.push(`- Para agendar uma reunião: ANTES de enviar [AGENDAR], colete obrigatoriamente: (1) tipo de consulta/serviço desejado e (2) preferência de horário (manhã/tarde/data). Só inclua [AGENDAR] após ter essas informações.`)
  }
  actions.push(`- Quando o lead pedir para falar com um humano, sair do escopo, ou tiver objeção técnica complexa, inclua EXATAMENTE: [HANDOFF]`)

  sections.push(`\n## Ações Especiais\n${actions.join('\n')}`)

  return sections.join('\n')
}
