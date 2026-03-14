'use client'

import { useState } from 'react'
import { FileText, Download, X, Play } from 'lucide-react'

interface MediaMessageProps {
  mediaType: 'image' | 'video' | 'document'
  mediaUrl: string | null
  mediaName: string | null
  mediaMime: string | null
  caption?: string
  messageId?: string
}

export function MediaMessage({ mediaType, mediaUrl, mediaName, mediaMime, caption, messageId }: MediaMessageProps) {
  const [lightbox, setLightbox] = useState(false)

  if (mediaType === 'image') {
    return (
      <>
        <div className="flex flex-col gap-1">
          {mediaUrl ? (
            <button
              onClick={() => setLightbox(true)}
              className="block rounded-xl overflow-hidden border border-current/10 hover:opacity-90 transition-opacity"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaUrl}
                alt={mediaName ?? 'Imagem'}
                className="max-w-[220px] max-h-[200px] object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </button>
          ) : (
            <div className="w-[220px] h-[140px] rounded-xl bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
              Imagem indisponível
            </div>
          )}
          {caption && <p className="text-xs mt-0.5 opacity-80">{caption}</p>}
        </div>

        {/* Lightbox */}
        {lightbox && mediaUrl && (
          <div
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
            onClick={() => setLightbox(false)}
          >
            <button className="absolute top-4 right-4 text-white/70 hover:text-white">
              <X size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl}
              alt={mediaName ?? 'Imagem'}
              className="max-w-full max-h-full rounded-lg object-contain"
              onClick={e => e.stopPropagation()}
            />
          </div>
        )}
      </>
    )
  }

  if (mediaType === 'video') {
    return (
      <div className="flex flex-col gap-1">
        {mediaUrl ? (
          <div className="relative rounded-xl overflow-hidden border border-current/10 max-w-[220px]">
            <video
              src={mediaUrl}
              controls
              className="w-full max-h-[200px] object-cover"
              preload="metadata"
            />
          </div>
        ) : (
          <div className="w-[220px] h-[120px] rounded-xl bg-gray-200 flex items-center justify-center gap-2 text-gray-400 text-xs">
            <Play size={16} />
            Vídeo indisponível
          </div>
        )}
        {caption && <p className="text-xs mt-0.5 opacity-80">{caption}</p>}
      </div>
    )
  }

  // Document
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-current/15 bg-current/5 min-w-[180px] max-w-[240px]">
        <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <FileText size={16} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate opacity-90">{mediaName ?? 'Documento'}</p>
          {mediaMime && (
            <p className="text-[10px] opacity-50 uppercase">{mediaMime.split('/')[1] ?? mediaMime}</p>
          )}
        </div>
        {messageId && (
          <a
            href={`/api/messages/${messageId}/download`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <Download size={14} />
          </a>
        )}
      </div>
      {caption && <p className="text-xs mt-0.5 opacity-80">{caption}</p>}
    </div>
  )
}
