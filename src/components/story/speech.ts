/**
 * Two ways the app speaks:
 *
 * - `playClip(path)`: a recorded ElevenLabs clip stored in R2. Used for the
 *   phonics answer and the sound-it-out words, where a clear, natural voice is
 *   the point of the exercise.
 * - `speak(text)`: the browser's built-in speech synthesis. Free and instant,
 *   so any word in the story can be tapped to hear it. Quality varies by
 *   device, which is why the quiz words get recorded audio instead.
 */

let current: HTMLAudioElement | null = null

export function playClip(path: string): Promise<void> {
  stopAll()
  const audio = new Audio(path)
  current = audio
  return audio.play().catch(() => undefined)
}

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function speak(text: string, opts: { rate?: number; onEnd?: () => void } = {}): void {
  if (!canSpeak()) return
  stopAll()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = opts.rate ?? 0.85
  u.lang = 'en-US'
  if (opts.onEnd) {
    u.onend = opts.onEnd
    u.onerror = opts.onEnd
  }
  window.speechSynthesis.speak(u)
}

export function stopAll(): void {
  current?.pause()
  current = null
  if (canSpeak()) window.speechSynthesis.cancel()
}
