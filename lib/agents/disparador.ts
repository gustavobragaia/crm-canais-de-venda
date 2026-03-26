import { db } from '@/lib/db'
import { decrypt } from '@/lib/crypto'
import { sendTemplateMessage } from '@/lib/integrations/waba'
import { consumeTokens } from '@/lib/billing/tokenService'
import { pusherServer } from '@/lib/pusher'

const BATCH_SIZE = 50
const BATCH_DELAY_MS = 1000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Process Dispatch ───

export async function processDispatch(dispatchId: string): Promise<void> {
  try {
    // 1. Load dispatch + channel + list contacts
    const dispatch = await db.templateDispatch.findUnique({
      where: { id: dispatchId },
      include: {
        wabaChannel: true,
        dispatchList: {
          include: { contacts: true },
        },
      },
    })

    if (!dispatch) throw new Error('Dispatch not found')

    const accessToken = decrypt(dispatch.wabaChannel.accessToken)
    const contacts = dispatch.dispatchList.contacts

    // Find the UazAPI Channel for this workspace (conversations route through UazAPI, not WABA)
    const uazapiChannel = await db.channel.findFirst({
      where: {
        workspaceId: dispatch.workspaceId,
        type: 'WHATSAPP',
        provider: 'UAZAPI',
        isActive: true,
      },
      select: { id: true },
    })
    if (!uazapiChannel) {
      throw new Error('Nenhum canal UazAPI ativo encontrado. Conecte o WhatsApp (UazAPI) antes de disparar.')
    }

    // 2. Update status
    await db.templateDispatch.update({
      where: { id: dispatchId },
      data: { status: 'SENDING', startedAt: new Date(), totalRecipients: contacts.length },
    })

    let sentCount = 0
    let failedCount = 0
    let tokensConsumed = 0

    // 3. Send in batches
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE)

      for (const contact of batch) {
        try {
          await sendTemplateMessage(
            accessToken,
            dispatch.wabaChannel.phoneNumberId,
            contact.phone,
            dispatch.templateName,
          )

          // Consume 1 token per message
          const result = await consumeTokens(dispatch.workspaceId, 1, 'disparador', dispatchId)
          if (result.success) tokensConsumed++

          // Create conversation linked to UazAPI Channel (responses come via UazAPI webhook)
          const externalId = contact.phone.replace(/\D/g, '') + '@s.whatsapp.net'
          await db.conversation.upsert({
            where: {
              workspaceId_channelId_externalId: {
                workspaceId: dispatch.workspaceId,
                channelId: uazapiChannel.id,
                externalId,
              },
            },
            create: {
              workspaceId: dispatch.workspaceId,
              channelId: uazapiChannel.id,
              contactName: contact.name ?? contact.phone,
              contactPhone: contact.phone,
              externalId,
              source: 'dispatch',
              pipelineStage: 'Disparo Enviado',
              dispatchListId: dispatch.dispatchListId,
              templateDispatchId: dispatchId,
              status: 'UNASSIGNED',
            },
            update: {
              pipelineStage: 'Disparo Enviado',
              templateDispatchId: dispatchId,
              source: 'dispatch',
            },
          })

          sentCount++
        } catch (err) {
          console.error(`[DISPARADOR] Failed to send to ${contact.phone}:`, err)
          failedCount++
        }
      }

      // Update progress after each batch
      await db.templateDispatch.update({
        where: { id: dispatchId },
        data: { sentCount, failedCount, tokensConsumed },
      })

      // Notify UI
      await pusherServer.trigger(
        `workspace-${dispatch.workspaceId}`,
        'dispatch-progress',
        { dispatchId, sentCount, failedCount, total: contacts.length },
      ).catch(() => {})

      // Rate limit between batches
      if (i + BATCH_SIZE < contacts.length) {
        await sleep(BATCH_DELAY_MS)
      }
    }

    // 4. Mark as completed
    await db.templateDispatch.update({
      where: { id: dispatchId },
      data: {
        status: 'COMPLETED',
        sentCount,
        failedCount,
        tokensConsumed,
        completedAt: new Date(),
      },
    })

    await pusherServer.trigger(
      `workspace-${dispatch.workspaceId}`,
      'dispatch-completed',
      { dispatchId, sentCount, failedCount },
    ).catch(() => {})
  } catch (err) {
    console.error('[DISPARADOR] processDispatch error:', err)
    await db.templateDispatch.update({
      where: { id: dispatchId },
      data: { status: 'FAILED', completedAt: new Date() },
    }).catch(() => {})
  }
}

// ─── Handle Dispatch Response ───

export async function handleDispatchResponse(
  conversationId: string,
  workspaceId: string,
): Promise<void> {
  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    select: { templateDispatchId: true, pipelineStage: true },
  })

  if (!conversation || conversation.pipelineStage !== 'Disparo Enviado') return

  // Check if this specific dispatch has SDR enabled
  let enableSdr = false
  if (conversation.templateDispatchId) {
    const dispatch = await db.templateDispatch.findUnique({
      where: { id: conversation.templateDispatchId },
      select: { enableSdr: true },
    })
    enableSdr = dispatch?.enableSdr ?? false
  }

  const newStage = enableSdr ? 'SDR Ativo' : 'Disparo Respondido'

  await db.conversation.update({
    where: { id: conversationId },
    data: {
      pipelineStage: newStage,
      ...(enableSdr && { aiSalesEnabled: true }),
    },
  })

  // Increment responded count on dispatch
  if (conversation.templateDispatchId) {
    await db.templateDispatch.update({
      where: { id: conversation.templateDispatchId },
      data: { respondedCount: { increment: 1 } },
    }).catch(() => {})
  }

  // Notify UI
  await pusherServer.trigger(
    `workspace-${workspaceId}`,
    'dispatch-response',
    { conversationId, stage: newStage },
  ).catch(() => {})
}
