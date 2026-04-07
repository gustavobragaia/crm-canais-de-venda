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

    // Store bound handler references so we only unbind these on cleanup
    const boundHandlers: Array<{ event: string; handler: (data: unknown) => void }> = []

    for (const [event] of Object.entries(eventsRef.current)) {
      const handler = (data: unknown) => {
        eventsRef.current[event]?.(data)
      }
      channel.bind(event, handler)
      boundHandlers.push({ event, handler })
    }

    return () => {
      // Unbind only the specific handlers this hook instance created
      for (const { event, handler } of boundHandlers) {
        channel.unbind(event, handler)
      }

      // Only unsubscribe when no component uses this channel
      const count = (channelRefCounts.get(channelName) ?? 1) - 1
      channelRefCounts.set(channelName, count)
      if (count <= 0) {
        channelRefCounts.delete(channelName)
        pusher.unsubscribe(channelName)
      }
    }
  }, [channelName])
}
