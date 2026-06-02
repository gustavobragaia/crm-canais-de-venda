'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { Upload, Download, Trash2, FileText, Image as ImageIcon, FileSpreadsheet, Presentation, Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { compressImageIfNeeded } from '@/lib/client-file-utils'
import { ACCEPT_ATTRIBUTE, MAX_DOCUMENT_SIZE, ALLOWED_MIMES, formatBytes } from '@/lib/file-utils'

interface DocumentItem {
  id: string
  name: string
  fileType: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  uploadedBy: { id: string; name: string } | null
}

interface ConversationDocumentsProps {
  conversationId: string
}

const TYPE_STYLES: Record<string, { icon: typeof FileText; color: string; bg: string }> = {
  pdf: { icon: FileText, color: 'text-red-600', bg: 'bg-red-50' },
  doc: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
  docx: { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-50' },
  xls: { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50' },
  xlsx: { icon: FileSpreadsheet, color: 'text-green-600', bg: 'bg-green-50' },
  ppt: { icon: Presentation, color: 'text-orange-600', bg: 'bg-orange-50' },
  pptx: { icon: Presentation, color: 'text-orange-600', bg: 'bg-orange-50' },
  image: { icon: ImageIcon, color: 'text-violet-600', bg: 'bg-violet-50' },
}

export function ConversationDocuments({ conversationId }: ConversationDocumentsProps) {
  const [documents, setDocuments] = useState<DocumentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/conversations/${conversationId}/documents`)
      .then(r => r.ok ? r.json() : { documents: [] })
      .then(data => setDocuments(data.documents ?? []))
      .finally(() => setLoading(false))
  }, [conversationId])

  const handleFile = useCallback(async (rawFile: File) => {
    if (!ALLOWED_MIMES[rawFile.type]) {
      toast.error('Tipo de arquivo não permitido. Aceitos: PDF, Word, Excel, PowerPoint, imagens.')
      return
    }
    if (rawFile.size > MAX_DOCUMENT_SIZE) {
      toast.error(`Arquivo excede ${MAX_DOCUMENT_SIZE / (1024 * 1024)} MB.`)
      return
    }

    setUploading(true)
    try {
      const file = await compressImageIfNeeded(rawFile)
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/conversations/${conversationId}/documents`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Falha no upload' }))
        toast.error(err.error ?? 'Falha no upload')
        return
      }

      const { document } = await res.json()
      setDocuments(docs => [document, ...docs])
      toast.success('Documento enviado')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setUploading(false)
    }
  }, [conversationId])

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function handleDownload(docId: string) {
    try {
      const res = await fetch(`/api/conversations/${conversationId}/documents/${docId}`)
      if (!res.ok) {
        toast.error('Falha ao gerar link')
        return
      }
      const { signedUrl } = await res.json()
      window.open(signedUrl, '_blank')
    } catch {
      toast.error('Falha ao baixar')
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm('Remover este documento?')) return
    setDeletingId(docId)
    try {
      const res = await fetch(`/api/conversations/${conversationId}/documents/${docId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        toast.error('Falha ao remover')
        return
      }
      setDocuments(docs => docs.filter(d => d.id !== docId))
      toast.success('Documento removido')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-5 space-y-4">
      {/* Dropzone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-300 hover:bg-gray-50'
        } ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={ACCEPT_ATTRIBUTE}
          onChange={onInputChange}
          disabled={uploading}
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-violet-600">
            <Loader2 size={16} className="animate-spin" />
            Enviando...
          </div>
        ) : (
          <>
            <Upload size={20} className="mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-700 font-medium">Arraste ou clique para enviar</p>
            <p className="text-xs text-gray-400 mt-1">PDF, Word, Excel, PowerPoint, imagens · até 10 MB</p>
          </>
        )}
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        ) : documents.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">Nenhum documento ainda</p>
        ) : (
          documents.map(doc => {
            const style = TYPE_STYLES[doc.fileType] ?? TYPE_STYLES.pdf
            const Icon = style.icon
            return (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-gray-200 hover:shadow-sm transition-all group"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${style.bg}`}>
                  <Icon size={16} className={style.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate" title={doc.name}>
                    {doc.name}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {formatBytes(doc.sizeBytes)} · {format(new Date(doc.createdAt), 'dd/MM HH:mm', { locale: ptBR })}
                    {doc.uploadedBy && ` · ${doc.uploadedBy.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleDownload(doc.id)}
                    className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                    title="Baixar"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    disabled={deletingId === doc.id}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                    title="Remover"
                  >
                    {deletingId === doc.id
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Trash2 size={14} />}
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
