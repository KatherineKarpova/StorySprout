import { getAuthToken } from 'deepspace'

export type ActionResponse<T> = { success: true; data: T } | { success: false; error: string; code?: string }

/** POST /api/actions/<name> with the signed-in reader's token. */
export async function runAction<T>(name: string, body: object): Promise<ActionResponse<T>> {
  try {
    const token = await getAuthToken()
    if (!token) return { success: false, error: 'Please sign in first.' }
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = (await res.json().catch(() => null)) as ActionResponse<T> | { error?: string } | null
    if (json && 'success' in json) return json
    return { success: false, error: json?.error ?? `Something went wrong (${res.status}).` }
  } catch {
    return { success: false, error: 'Could not reach StorySprout. Check your internet and try again.' }
  }
}
