/**
 * Payload normalizado para o worker message-ingest.
 * Provider-agnostic: UazAPI, Facebook e Instagram produzem o mesmo shape.
 */
export type MessageIngestPayload = {
  // Routing
  provider: 'UAZAPI' | 'FACEBOOK' | 'INSTAGRAM'
  channelIdentifier: string // instanceToken (UazAPI) | pageId (FB) | businessAccountId (IG)

  // Contato
  contactExternalId: string // chatid (UazAPI) | senderId (Meta)
  contactName: string
  contactPhone?: string
  contactPhotoUrl?: string

  // Mensagem
  externalId: string        // msg.messageid (UazAPI) | messaging.message.mid (Meta)
  direction: 'INBOUND' | 'OUTBOUND'
  content: string           // texto ou placeholder ("[Imagem]", "[Áudio]", etc.)
  senderName?: string
  sentAt: string            // ISO string

  // Mídia
  mediaType?: string        // 'image' | 'video' | 'audio' | 'document'
  mediaUrl?: string
  mediaMime?: string
  mediaName?: string

  // Flags
  isHistory?: boolean
  aiGenerated?: boolean

  // UazAPI-specific (downstream: transcription, media-persist)
  instanceToken?: string
  mediaMessageId?: string   // UazAPI msg.messageid para download

  // Meta-specific (downstream: media-persist, profile-fetch)
  attachmentUrl?: string    // URL do CDN Meta (expira ~15min)
  attachmentType?: string   // 'image' | 'video' | 'audio' | 'file'
}

export type MessageStatusUpdatePayload = {
  provider: 'UAZAPI'
  channelIdentifier: string
  externalIds: string[]
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
}

export type ChannelStatusUpdatePayload = {
  provider: 'UAZAPI'
  channelIdentifier: string
  status: 'connected' | 'disconnected' | 'connecting'
}
