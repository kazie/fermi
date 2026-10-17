export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`)
  return body as T
}

export const createRoom = (opts: { screen?: boolean } = {}) =>
  api<{ code: string }>('/api/rooms', { method: 'POST', body: JSON.stringify(opts) })
export const roomExists = (code: string) =>
  api<{ exists: boolean }>(`/api/rooms/${code}`)
    .then((r) => r.exists)
    .catch(() => false)
export const sendDispute = (questionId: string, message: string, key?: string) =>
  api(`/api/questions/${questionId}/dispute`, { method: 'POST', body: JSON.stringify({ message, key }) })
