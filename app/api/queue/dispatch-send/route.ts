import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { db } from '@/lib/db'
import { pusherServer } from '@/lib/pusher'
import { decrypt } from '@/lib/crypto'
import { sendTemplateMessage } from '@/lib/integrations/waba'
import { consumeTokens } from '@/lib/billing/tokenService'

export const maxDuration = 30

type DispatchSendPayload = {
  dispatchId: string
  contactPhone: string
  contactName: string | null
  contactId: string
  templateName: string
  phoneNumberId: string
  accessToken: string
  workspaceId: string
  channelId: string
  dispatchListId: string
  totalRecipients: number
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const {
    dispatchId, contactPhone, contactName, templateName, phoneNumberId,
    accessToken, workspaceId, channelId, dispatchListId, totalRecipients,
  } = await parseQStashBody<DispatchSendPayload>(req)

  console.log(`[QUEUE/DISPATCH-SEND] dispatchId=${dispatchId} phone=${contactPhone}`)

  // Send template message via WABA
  try {
    await sendTemplateMessage(decrypt(accessToken), phoneNumberId, contactPhone, templateName)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    // Permanent errors (invalid number, template not found, etc.) — don't retry via QStash
    // Return 200 and increment failedCount directly
    if (msg.includes('131030') || msg.includes('invalid') || msg.includes('131047')) {
      console.warn(`[QUEUE/DISPATCH-SEND] permanent error for ${contactPhone}: ${msg}`)
      await incrementFailed(dispatchId, workspaceId, totalRecipients)
      return NextResponse.json({ skipped: true, reason: 'permanent-error', error: msg })
    }
    // Transient error — let QStash retry
    throw err
  }

  // Consume 1 token
  await consumeTokens(workspaceId, 1, 'disparador', dispatchId).catch(() => {})

  // Upsert conversation
  const externalId = contactPhone.replace(/\D/g, '') + '@s.whatsapp.net'
  await db.conversation.upsert({
    where: { workspaceId_channelId_externalId: { workspaceId, channelId, externalId } },
    create: {
      workspaceId, channelId,
      contactName: contactName ?? contactPhone,
      contactPhone, externalId,
      source: 'dispatch',
      pipelineStage: 'Disparo Enviado',
      dispatchListId, templateDispatchId: dispatchId,
      status: 'UNASSIGNED',
    },
    update: {
      pipelineStage: 'Disparo Enviado',
      templateDispatchId: dispatchId,
      source: 'dispatch',
    },
  })

  // Increment sentCount and check auto-complete
  const updated = await db.templateDispatch.update({
    where: { id: dispatchId },
    data: { sentCount: { increment: 1 } },
    select: { sentCount: true, failedCount: true, totalRecipients: true, workspaceId: true },
  })

  await pusherServer.trigger(`workspace-${workspaceId}`, 'dispatch-progress', {
    dispatchId,
    sentCount: updated.sentCount,
    failedCount: updated.failedCount,
    total: updated.totalRecipients,
  }).catch(() => {})

  if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
    // Use updateMany with status condition to avoid race conditions
    await db.templateDispatch.updateMany({
      where: { id: dispatchId, status: 'SENDING' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    await pusherServer.trigger(`workspace-${workspaceId}`, 'dispatch-completed', {
      dispatchId,
    }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}

async function incrementFailed(dispatchId: string, workspaceId: string, totalRecipients: number) {
  const updated = await db.templateDispatch.update({
    where: { id: dispatchId },
    data: { failedCount: { increment: 1 } },
    select: { sentCount: true, failedCount: true, totalRecipients: true },
  })

  if (updated.sentCount + updated.failedCount >= updated.totalRecipients) {
    await db.templateDispatch.updateMany({
      where: { id: dispatchId, status: 'SENDING' },
      data: { status: 'COMPLETED', completedAt: new Date() },
    })
    await pusherServer.trigger(`workspace-${workspaceId}`, 'dispatch-completed', {
      dispatchId,
    }).catch(() => {})
  }
}
