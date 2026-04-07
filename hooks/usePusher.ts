'use client'

import { useEffect, useRef } from 'react'
import { getPusherClient } from '@/lib/pusher'

type PusherEventCallback = (data: unknown) => void

const channelRefCounts = new Map<string, number>()

export function usePusherChannel(
  channelName: string,
  events: Record<string, PusherEventCallback>
) {
  const eventsRef = useRef(events)
  eventsRef.current = events

  useEffect(() => {
    if (!channelName) return

    const pusher = getPusherClient()
    const channel = pusher.subscribe(channelName)
    channelRefCounts.set(channelName, (channelRefCounts.get(channelName) ?? 0) + 1)

    console.log(`[PUSHER] Subscribed to "${channelName}" (refCount=${channelRefCounts.get(channelName)})`)

    channel.bind('pusher:subscription_succeeded', () => {
      console.log(`[PUSHER] Subscription confirmed: "${channelName}"`)
    })
    channel.bind('pusher:subscription_error', (err: unknown) => {
      console.error(`[PUSHER] Subscription FAILED for "${channelName}":`, err)
    })

    // Store bound handler references so we only unbind these on cleanup
    const boundHandlers: Array<{ event: string; handler: (data: unknown) => void }> = []

    for (const [event] of Object.entries(eventsRef.current)) {
      const handler = (data: unknown) => {
        console.log(`[PUSHER] Event received: "${event}" on "${channelName}"`, data)
        eventsRef.current[event]?.(data)
      }
      channel.bind(event, handler)
      boundHandlers.push({ event, handler })
    }

    return () => {
      console.log(`[PUSHER] Cleaning up "${channelName}" — unbinding ${boundHandlers.length} handlers`)
      // Unbind only the specific handlers this hook instance created
      for (const { event, handler } of boundHandlers) {
        channel.unbind(event, handler)
      }

      // Unbind subscription status handlers
      channel.unbind('pusher:subscription_succeeded')
      channel.unbind('pusher:subscription_error')

      // Only unsubscribe when no component uses this channel
      const count = (channelRefCounts.get(channelName) ?? 1) - 1
      channelRefCounts.set(channelName, count)
      if (count <= 0) {
        channelRefCounts.delete(channelName)
        pusher.unsubscribe(channelName)
        console.log(`[PUSHER] Unsubscribed from "${channelName}" (no more refs)`)
      } else {
        console.log(`[PUSHER] Kept "${channelName}" alive (refCount=${count})`)
      }
    }
  }, [channelName])
}
