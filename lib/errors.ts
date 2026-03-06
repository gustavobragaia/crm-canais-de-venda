export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function handleApiError(error: unknown) {
  if (error instanceof AppError) {
    return { error: error.message, code: error.code, details: error.details }
  }
  console.error(error)
  return { error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' }
}
