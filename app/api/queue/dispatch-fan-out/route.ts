import { NextRequest, NextResponse } from 'next/server'
import { verifyQStashSignature, parseQStashBody } from '@/lib/queue/verify'
import { db } from '@/lib/db'
import { publishToQueue } from '@/lib/qstash'

export const maxDuration = 60

type DispatchFanOutPayload = {
  dispatchId: string
}

export async function POST(req: NextRequest) {
  const authError = await verifyQStashSignature(req)
  if (authError) return authError

  const { dispatchId } = await parseQStashBody<DispatchFanOutPayload>(req)

  console.log(`[QUEUE/DISPATCH-FAN-OUT] dispatchId=${dispatchId}`)

  const dispatch = await db.templateDispatch.findUnique({
    where: { id: dispatchId },
    include: {
      wabaChannel: true,
      dispatchList: { include: { contacts: true } },
    },
  })

  // Guard: only process PENDING dispatches (idempotent)
  if (!dispatch || dispatch.status !== 'PENDING') {
    console.log(`[QUEUE/DISPATCH-FAN-OUT] dispatch not found or not PENDING, skipping dispatchId=${dispatchId}`)
    return NextResponse.json({ skipped: true, reason: 'not-pending' })
  }

  const contacts = dispatch.dispatchList.contacts

  await db.templateDispatch.update({
    where: { id: dispatchId },
    data: { status: 'SENDING', startedAt: new Date(), totalRecipients: contacts.length },
  })

  const baseUrl = (process.env.NEXTAUTH_URL ?? '').replace(/\/$/, '')

  // Publish one job per contact with staggered delay (50/sec)
  let published = 0
  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i]
    const delaySeconds = Math.floor(i / 50)

    try {
      await publishToQueue(
        '/api/queue/dispatch-send',
        {
          dispatchId,
          contactPhone: contact.phone,
          contactName: contact.name ?? null,
          contactId: contact.id,
          templateName: dispatch.templateName,
          phoneNumberId: dispatch.wabaChannel.phoneNumberId,
          accessToken: dispatch.wabaChannel.accessToken,
          workspaceId: dispatch.workspaceId,
          channelId: dispatch.wabaChannelId,
          dispatchListId: dispatch.dispatchListId,
          totalRecipients: contacts.length,
        },
        {
          delay: delaySeconds,
          retries: 3,
          deduplicationId: `dispatch-send-${dispatchId}-${contact.id}`,
          failureCallback: `${baseUrl}/api/queue/dispatch-send-failed`,
        }
      )
      published++
    } catch (err) {
      console.error(`[QUEUE/DISPATCH-FAN-OUT] failed to publish job for contact ${contact.id}:`, err)
      // Increment failedCount for contacts we couldn't even schedule
      await db.templateDispatch.update({
        where: { id: dispatchId },
        data: { failedCount: { increment: 1 } },
      }).catch(() => {})
    }
  }

  console.log(`[QUEUE/DISPATCH-FAN-OUT] published ${published}/${contacts.length} jobs`)
  return NextResponse.json({ success: true, total: contacts.length, published })
}
