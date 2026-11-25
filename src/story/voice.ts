/**
 * Hope's voice: the one ElevenLabs configuration shared by the story job
 * (practice words) and the `sayWord` action (any tapped word), so every
 * recording in the app sounds the same. Server-only: it spends owner credits.
 */

import type { ActionTools } from 'deepspace/worker'
import { decodeDataUrl } from './prompts'

/**
 * Hope ("Vibrant, Warm and Innocent") from the ElevenLabs voice library,
 * chosen by ear from four childlike "fairy princess" candidates sampled side
 * by side. Swap the id to change it
 * (voice list: `npx deepspace integrations invoke elevenlabs/list-voices`).
 * Changing it also changes the tapped-word cache key, so old clips are not
 * mixed with the new voice.
 */
export const VOICE_ID = 'cVd39cx0VtXNC13y5Y7z'

/**
 * English-only model. The multilingual model guesses the language from the
 * text, and a lone word is ambiguous: "Sage" came out German/Arabic-sounding.
 * Checked by transcribing a recording of "sage." with Whisper: multilingual
 * → "ساقة", turbo_v2 / flash_v2 → "Sage.". Part of the word-cache key, so
 * changing it re-records words instead of serving old clips.
 */
export const VOICE_MODEL = 'eleven_turbo_v2'

/** Speak `text` in Hope's voice; returns the mp3 as a Blob ready to store. */
export async function recordSpeech(tools: ActionTools, text: string): Promise<Blob> {
  const r = await tools.integration<{ audioUrl: string }>('elevenlabs/generate-speech', {
    text,
    voice_id: VOICE_ID,
    model_id: VOICE_MODEL,
    output_format: 'mp3_44100_64',
    // A little style for a lively, storybook delivery; stability stays high
    // enough that the word itself is pronounced plainly.
    voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true },
  })
  if (!r.success) {
    const code = (r as { code?: string }).code ?? 'error'
    throw new Error(`speech failed [${code}]: ${r.error}`)
  }
  const { bytes, type } = decodeDataUrl(r.data.audioUrl, 'audio/mpeg')
  return new Blob([bytes], { type })
}
