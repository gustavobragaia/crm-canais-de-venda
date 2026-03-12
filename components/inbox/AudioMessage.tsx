'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'

interface AudioMessageProps {
  messageId: string
  mediaUrl: string | null
  transcription: string | null
}

export function AudioMessage({ messageId, mediaUrl: initialMediaUrl, transcription: initialTranscription }: AudioMessageProps) {
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [transcription, setTranscription] = useState(initialTranscription)
  const [transcribing, setTranscribing] = useState(false)
  const [mediaUrl, setMediaUrl] = useState(initialMediaUrl)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Sync transcription and mediaUrl from Pusher message-updated event
  useEffect(() => {
    const handler = (e: Event) => {
      const { messageId: mid, transcription: t, mediaUrl: url } = (e as CustomEvent<{ messageId: string; transcription?: string; mediaUrl?: string }>).detail
      if (mid !== messageId) return
      if (t) setTranscription(t)
      if (url) setMediaUrl(url)
    }
    window.addEventListener('message-updated', handler)
    return () => window.removeEventListener('message-updated', handler)
  }, [messageId])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const updateTime = () => setCurrentTime(audio.currentTime)
    const updateDuration = () => setDuration(audio.duration)
    const onEnded = () => setPlaying(false)
    audio.addEventListener('timeupdate', updateTime)
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('ended', onEnded)
    return () => {
      audio.removeEventListener('timeupdate', updateTime)
      audio.removeEventListener('loadedmetadata', updateDuration)
      audio.removeEventListener('ended', onEnded)
    }
  }, [mediaUrl])

  function togglePlay() {
    const audio = audioRef.current
    if (!audio || !mediaUrl) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      void audio.play()
      setPlaying(true)
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Number(e.target.value)
  }

  function fmtTime(s: number) {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  async function requestTranscription() {
    setTranscribing(true)
    try {
      const res = await fetch('/api/transcription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId }),
      })
      if (res.ok) {
        const { transcription: t } = await res.json() as { transcription: string }
        if (t) setTranscription(t)
      }
    } finally {
      setTranscribing(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[200px] max-w-[260px]">
      {/* Player row */}
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          disabled={!mediaUrl}
          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 disabled:opacity-40 flex items-center justify-center flex-shrink-0 transition-colors"
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="translate-x-0.5" />}
        </button>

        {mediaUrl ? (
          <input
            type="range"
            min={0}
            max={duration || 1}
            value={currentTime}
            onChange={seek}
            className="flex-1 h-1 accent-current cursor-pointer"
          />
        ) : (
          <div className="flex-1 flex items-center gap-1.5 text-xs opacity-60">
            <Loader2 size={12} className="animate-spin" />
            <span>Carregando áudio...</span>
          </div>
        )}

        <span className="text-[10px] opacity-70 flex-shrink-0">
          {duration ? fmtTime(currentTime) + ' / ' + fmtTime(duration) : fmtTime(currentTime)}
        </span>
      </div>

      {/* Hidden audio element */}
      {mediaUrl && <audio ref={audioRef} src={mediaUrl} preload="metadata" />}

      {/* Transcription */}
      {transcription ? (
        <p className="text-xs opacity-80 leading-relaxed italic border-t border-current/10 pt-1.5 mt-0.5">
          {transcription}
        </p>
      ) : (
        <button
          onClick={requestTranscription}
          disabled={transcribing}
          className="self-start flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100 transition-opacity"
        >
          {transcribing ? (
            <><Loader2 size={10} className="animate-spin" /> Transcrevendo...</>
          ) : (
            'Transcrever'
          )}
        </button>
      )}
    </div>
  )
}
