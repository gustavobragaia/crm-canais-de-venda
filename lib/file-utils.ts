export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024 // 10 MB

export const ALLOWED_MIMES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
}

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_MIMES).join(',')

export function getFileType(mimeType: string): string | null {
  return ALLOWED_MIMES[mimeType] ?? null
}

export function validateDocument(file: { type: string; size: number }) {
  const fileType = getFileType(file.type)
  if (!fileType) {
    throw new Error('Tipo de arquivo não permitido. Aceitos: PDF, Word, Excel, PowerPoint, imagens.')
  }
  if (file.size > MAX_DOCUMENT_SIZE) {
    throw new Error(`Arquivo excede ${MAX_DOCUMENT_SIZE / (1024 * 1024)} MB`)
  }
  return fileType
}

export function sanitizeFilename(name: string) {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  return trimmed.slice(0, 120) || 'arquivo'
}

export function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  }
  return map[mimeType] ?? 'bin'
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
