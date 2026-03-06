'use client'

import { useEffect, useRef } from 'react'
import { getPusherClient } from '@/lib/pusher'

type PusherEventCallback = (data: unknown) => void

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

    for (const [event, _] of Object.entries(eventsRef.current)) {
      channel.bind(event, (data: unknown) => {
        eventsRef.current[event]?.(data)
      })
    }

    return () => {
      channel.unbind_all()
      pusher.unsubscribe(channelName)
    }
  }, [channelName])
}
