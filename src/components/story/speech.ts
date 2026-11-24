/**
 * Every sound in StorySprout is Hope's recorded voice (ElevenLabs, stored in
 * R2). There is deliberately no browser speech-synthesis fallback: a
 * different, robotic voice would undercut the one the child knows.
 *
 * - Practice words arrive with a clip the story job recorded.
 * - Any other tapped word goes through the `sayWord` action, which serves the
 *   app-wide cache or records it once. Paths are memoized here, so a word is
 *   fetched at most once per page load.
 */

import { runAction } from '@/lib/actions'

let current: HTMLAudioElement | null = null
const known = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

/** Play a clip; resolves when it finishes (or fails to play). */
export function playClip(path: string): Promise<void> {
  stopAll()
  const audio = new Audio(path)
  current = audio
  return new Promise((resolve) => {
    audio.onended = () => resolve()
    audio.onerror = () => resolve()
    audio.play().catch(() => resolve())
  })
}

export function stopAll(): void {
  current?.pause()
  current = null
}

const keyOf = (word: string) => word.toLowerCase().replace(/[^\p{L}'-]/gu, '')

async function clipFor(word: string): Promise<string> {
  const key = keyOf(word)
  const hit = known.get(key)
  if (hit) return hit
  let p = pending.get(key)
  if (!p) {
    p = runAction<{ path: string }>('sayWord', { word }).then((r) => {
      pending.delete(key)
      if (!r.success) throw new Error(r.error)
      known.set(key, r.data.path)
      return r.data.path
    })
    pending.set(key, p)
  }
  return p
}

/**
 * Say `word` in Hope's voice. `path` is a clip already recorded for it
 * (practice words). Rejects with a child-friendly message on failure.
 */
export async function hearWord(word: string, path?: string): Promise<void> {
  if (path) known.set(keyOf(word), path)
  await playClip(path ?? (await clipFor(word)))
}
