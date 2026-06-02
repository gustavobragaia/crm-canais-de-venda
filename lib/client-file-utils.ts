const MAX_IMAGE_DIMENSION = 1920
const COMPRESS_THRESHOLD = 500 * 1024 // 500 KB
const JPEG_QUALITY = 0.85

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Falha ao ler imagem'))
    img.src = URL.createObjectURL(file)
  })
}

export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size < COMPRESS_THRESHOLD) return file

  try {
    const img = await loadImage(file)
    let { width, height } = img
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      const ratio = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, width, height)

    return await new Promise<File>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file)
          const newName = file.name.replace(/\.[^.]+$/, '.jpg')
          resolve(new File([blob], newName, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
  } catch {
    return file
  }
}
