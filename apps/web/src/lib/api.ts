export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, body: unknown) {
    super(`API request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const body = res.headers.get('content-type')?.includes('application/json')
    ? await res.json()
    : await res.text()
  if (!res.ok) throw new ApiError(res.status, body)
  return body as T
}

export type Health = { status: 'ok'; version: string }
