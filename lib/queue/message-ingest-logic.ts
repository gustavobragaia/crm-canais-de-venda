import type { MessageIngestPayload } from '@/lib/queue/types'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { publishToQueue } from '@/lib/qstash'
import { tryCreateConversationAtomic, incrementConversationCount } from '@/lib/billing/conversationGate'
import { processMessageContent } from '@/lib/agents/vendedor'
import { addToDebounceBuffer, setDebounceTimestamp } from '@/lib/agents/vendedor-redis'

/**
 * Core message ingestion logic — provider-agnostic.
 * Called by the QStash worker AND as a sync fallback when QStash publish fails.
 */
export async function processMessageIngest(payload: MessageIngestPayload): Promise<void> {
  // STEP 1 — Channel lookup (provider-specific)
  let channel: Awaited<ReturnType<typeof db.channel.findFirst>>
  if (payload.provider === 'UAZAPI') {
    channel = await db.channel.findFirst({
      where: { instanceToken: payload.channelIdentifier, provider: 'UAZAPI', type: 'WHATSAPP' },
    })
  } else if (payload.provider === 'FACEBOOK') {
    channel = await db.channel.findFirst({
      where: { pageId: payload.channelIdentifier, type: 'FACEBOOK', isActive: true },
    })
  } else {
    channel = await db.channel.findFirst({
      where: { businessAccountId: payload.channelIdentifier, type: 'INSTAGRAM', isActive: true },
    })
  }

  if (!channel) {
    console.log(`[MESSAGE-INGEST] channel not found for identifier=${payload.channelIdentifier}`)
    return
  }

  // STEP 2 — Message dedup (DB-level)
  if (payload.externalId) {
    const existing = await db.message.findFirst({
      where: { externalId: payload.externalId },
      select: { id: true, conversationId: true },
    })
    if (existing) {
      const fullMessage = await db.message.findUnique({ where: { id: existing.id } })
      if (fullMessage) {
        pusherServer.trigger(
          `workspace-${channel.workspaceId}`,
          payload.isHistory ? 'history-message' : 'new-message',
          { conversationId: existing.conversationId, message: fullMessage }
        ).catch(() => {})
      }
      return
    }
  }

  // STEP 3 — Billing gate (Redis atomic)
  const { allowed, isNew } = await tryCreateConversationAtomic(
    channel.workspaceId, channel.id, payload.contactExternalId,
  )
  if (!allowed) {
    console.log(`[MESSAGE-INGEST] conversation limit reached ws=${channel.workspaceId}`)
    return
  }

  // STEP 4 — Conversation upsert
  const createData = {
    workspaceId: channel.workspaceId,
    channelId: channel.id,
    externalId: payload.contactExternalId,
    contactName: payload.contactName,
    contactPhone: payload.contactPhone,
    contactPhotoUrl: payload.contactPhotoUrl,
    status: 'UNASSIGNED' as const,
    pipelineStage: 'Não Atribuído',
  }

  const updateData = payload.provider === 'UAZAPI'
    ? { contactName: payload.contactName, ...(payload.contactPhotoUrl ? { contactPhotoUrl: payload.contactPhotoUrl } : {}) }
    : { ...(payload.contactPhotoUrl ? { contactPhotoUrl: payload.contactPhotoUrl } : {}) }

  const conversation = await db.conversation.upsert({
    where: {
      workspaceId_channelId_externalId: {
        workspaceId: channel.workspaceId,
        channelId: channel.id,
        externalId: payload.contactExternalId,
      },
    },
    create: createData,
    update: updateData,
  })

  // STEP 5 — Increment conversation count if truly new
  if (isNew) {
    await incrementConversationCount(channel.workspaceId)
  }

  // STEP 6 — Create message
  const savedMessage = await db.message.create({
    data: {
      conversationId: conversation.id,
      workspaceId: channel.workspaceId,
      direction: payload.direction,
      content: payload.content,
      externalId: payload.externalId || undefined,
      status: payload.direction === 'OUTBOUND' ? 'SENT' : 'DELIVERED',
      senderName: payload.senderName ?? null,
      sentAt: new Date(payload.sentAt),
      aiGenerated: payload.aiGenerated ?? false,
      ...(payload.mediaType ? {
        mediaType: payload.mediaType,
        mediaUrl: payload.mediaUrl,
        mediaMime: payload.mediaMime,
        mediaName: payload.mediaName,
      } : {}),
    },
  })

  // STEP 7 — Update conversation metadata
  await db.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: new Date(payload.sentAt),
      lastMessagePreview: payload.content.slice(0, 100),
      ...(payload.direction === 'INBOUND' ? { unreadCount: { increment: 1 } } : {}),
    },
  })

  // STEP 8 — Pusher notification
  pusherServer.trigger(
    `workspace-${channel.workspaceId}`,
    payload.isHistory ? 'history-message' : 'new-message',
    { conversationId: conversation.id, message: savedMessage }
  ).catch(err => console.error('[MESSAGE-INGEST] Pusher failed:', err))

  console.log(`[MESSAGE-INGEST] saved messageId=${savedMessage.id} conversationId=${conversation.id}`)

  // STEP 9 — Queue side-effects (INBOUND + !isHistory only)
  if (payload.direction === 'INBOUND' && !payload.isHistory) {
    const workspaceId = channel.workspaceId
    const conversationId = conversation.id

    const convDetails = await db.conversation.findUnique({
      where: { id: conversationId },
      select: { pipelineStage: true, aiSalesEnabled: true, dispatchListId: true },
    })

    // 9A. Audio transcription (UazAPI only)
    if (payload.mediaType === 'audio' && payload.instanceToken && payload.mediaMessageId) {
      await publishToQueue('/api/queue/transcribe', {
        messageId: savedMessage.id,
        conversationId,
        workspaceId,
        instanceToken: payload.instanceToken,
        mediaMessageId: payload.mediaMessageId,
      }).catch(err => console.error('[MESSAGE-INGEST] transcribe publish error:', err))
    }

    // 9B. Media persist (image/video/document)
    if (payload.mediaType && ['image', 'video', 'document'].includes(payload.mediaType)) {
      if (payload.provider === 'UAZAPI' && payload.instanceToken && payload.mediaMessageId) {
        await publishToQueue('/api/queue/media-persist', {
          messageId: savedMessage.id,
          conversationId,
          workspaceId,
          source: 'uazapi',
          instanceToken: payload.instanceToken,
          mediaMessageId: payload.mediaMessageId,
          mediaMime: payload.mediaMime,
        }).catch(err => console.error('[MESSAGE-INGEST] media-persist publish error:', err))
      } else if (payload.attachmentUrl && channel.accessToken) {
        await publishToQueue('/api/queue/media-persist', {
          messageId: savedMessage.id,
          conversationId,
          workspaceId,
          source: 'meta',
          mediaUrl: payload.attachmentUrl,
          accessToken: channel.accessToken,
          mediaMime: payload.attachmentType ?? 'application/octet-stream',
        }).catch(err => console.error('[MESSAGE-INGEST] media-persist publish error:', err))
      }
    }

    // 9C. Profile fetch (Meta only, new conversations)
    if (isNew && channel.accessToken && payload.provider !== 'UAZAPI') {
      await publishToQueue('/api/queue/profile-fetch', {
        conversationId,
        workspaceId,
        senderId: payload.contactExternalId,
        channelType: payload.provider,
        accessToken: channel.accessToken,
      }).catch(err => console.error('[MESSAGE-INGEST] profile-fetch publish error:', err))
    }

    // 9D. Dispatch response
    if (convDetails?.pipelineStage === 'Disparo Enviado') {
      await publishToQueue('/api/queue/dispatch-response', {
        conversationId,
        workspaceId,
      }).catch(err => console.error('[MESSAGE-INGEST] dispatch-response publish error:', err))
    }

    // 9E. Vendedor SDR
    if (convDetails?.aiSalesEnabled && convDetails?.dispatchListId) {
      const processedContent = await processMessageContent({
        content: payload.content,
        mediaType: payload.mediaType ?? null,
        mediaUrl: payload.mediaUrl ?? null,
        transcription: null,
      }).catch(() => null)

      if (processedContent) {
        const scheduledAt = Date.now()
        await addToDebounceBuffer(conversationId, processedContent)
        await setDebounceTimestamp(conversationId, scheduledAt)
        await publishToQueue('/api/queue/vendedor-check', {
          conversationId,
          workspaceId,
          scheduledAt,
        }, { delay: 15 }).catch(err => console.error('[MESSAGE-INGEST] vendedor publish error:', err))
      }
    }
  }

  // 9F. Human takeover (OUTBOUND only)
  if (payload.direction === 'OUTBOUND' && !payload.aiGenerated) {
    const convDetails = await db.conversation.findUnique({
      where: { id: conversation.id },
      select: { aiSalesEnabled: true, dispatchListId: true },
    })
    if (convDetails?.aiSalesEnabled && convDetails?.dispatchListId) {
      await publishToQueue('/api/queue/human-takeover', {
        conversationId: conversation.id,
        textContent: payload.content,
      }).catch(err => console.error('[MESSAGE-INGEST] human-takeover publish error:', err))
    }
  }
}
