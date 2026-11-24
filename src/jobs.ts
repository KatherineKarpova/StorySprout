/**
 * Background jobs, run by AppJobRoom (worker.ts).
 *
 * `generate-story` is the whole paid pipeline for one story:
 *
 *   1. Claude writes the story + quiz as JSON  → record shows text   (status: illustrating)
 *   2. Gemini paints two pictures → R2         → record shows images (status: recording)
 *   3. ElevenLabs says the practice words → R2 → record shows audio  (status: ready)
 *
 * Each stage patches the story record, and RecordRoom pushes the patch to the
 * reader's open page over its WebSocket, so the child starts reading after
 * step 1 instead of waiting for the slowest call. Only step 1 is fatal: a
 * story with a missing picture or sound is still a story.
 */

import { appFiles } from 'deepspace/worker'
import type { ActionTools, Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { GENERATE_STORY_JOB, type GenerateStoryPayload } from './actions/index'
import { createActionTools } from './server/action-routes'
import type { Question, SoundWord, StoryRecord } from './story/catalog'
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  countWords,
  decodeDataUrl,
  extractJson,
  illustrationPrompt,
  parseStoryDraft,
  type StoryDraft,
} from './story/prompts'

export const STORY_MODEL = 'claude-sonnet-5-5'
export const IMAGE_MODEL = 'gemini-2.5-flash-image'
/** ElevenLabs premade voice; clear, warm narration. */
export const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'

const JOB_DEADLINE_MS = 8 * 60 * 1000

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  if (job.type === GENERATE_STORY_JOB) {
    return generateStory(job.payload as GenerateStoryPayload, ctx, env)
  }
  throw new Error(`Unknown job type: ${job.type}`)
}

async function generateStory(p: GenerateStoryPayload, ctx: JobContext, env: Env) {
  const tools = createActionTools(env, p.userId, '')
  const files = appFiles(env, { scope: 'self', userId: p.userId })
  const deadline = Date.now() + JOB_DEADLINE_MS
  const patch = async (data: Partial<StoryRecord>) => {
    const r = await tools.update('stories', p.storyId, data)
    if (!r.success) console.error(`[story ${p.storyId}] record update failed: ${r.error}`)
  }
  const checkAlive = () => {
    if (ctx.signal.aborted) throw new Error('Canceled')
    if (Date.now() > deadline) throw new Error('Took too long')
  }

  // ── 1. Words ────────────────────────────────────────────────────────────
  let draft: StoryDraft
  try {
    ctx.progress(0.05, 'writing')
    await patch({ status: 'writing', progressMessage: 'Writing your story…' })
    draft = await writeStory(tools, p)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[story ${p.storyId}] writing failed: ${message}`)
    await patch({
      status: 'failed',
      progressMessage: '',
      error: 'The story writer got stuck. Please try a new story.',
    })
    throw err
  }
  checkAlive()
  const questions: Question[] = draft.questions
  const soundWords: SoundWord[] = draft.soundWords
  await patch({
    title: draft.title,
    paragraphs: draft.paragraphs,
    questions,
    soundWords,
    imageAlts: draft.illustrations.map((i) => i.alt),
    imageSlots: draft.illustrations.map((i) => i.afterParagraph),
    wordCount: countWords(draft.paragraphs),
    status: 'illustrating',
    progressMessage: 'Painting the pictures…',
  })
  ctx.progress(0.4, 'illustrating')

  // ── 2. Pictures (in parallel; a failed one leaves a gap, not an error) ──
  const imagePaths = await Promise.all(
    draft.illustrations.map(async (ill, i) => {
      try {
        const r = await tools.integration<{ base64Images: string[] }>('gemini/generate-image', {
          model: IMAGE_MODEL,
          prompt: illustrationPrompt(ill.prompt),
          aspectRatio: '4:3',
        })
        if (!r.success) throw new Error(r.error)
        const first = r.data.base64Images?.[0]
        if (!first) throw new Error('no image returned')
        const { bytes, type } = decodeDataUrl(first, 'image/png')
        const ext = type.includes('jpeg') ? 'jpg' : type.split('/')[1] || 'png'
        const stored = await files.upload(new Blob([bytes], { type }), {
          key: `stories/${p.storyId}/picture-${i + 1}.${ext}`,
          name: `picture-${i + 1}.${ext}`,
        })
        return stored.path
      } catch (err) {
        console.error(`[story ${p.storyId}] picture ${i + 1} failed: ${String(err)}`)
        return ''
      }
    }),
  )
  checkAlive()
  await patch({ imagePaths, status: 'recording', progressMessage: 'Recording the practice words…' })
  ctx.progress(0.75, 'recording')

  // ── 3. Voices for the phonics word and the sound-it-out words ───────────
  const say = async (word: string, slot: string): Promise<string | undefined> => {
    try {
      const r = await tools.integration<{ audioUrl: string }>('elevenlabs/generate-speech', {
        // Said twice with a pause: once to hear it, once to say it along.
        text: `${word}. ... ${word}.`,
        voice_id: VOICE_ID,
        model_id: 'eleven_multilingual_v2',
        output_format: 'mp3_44100_64',
        voice_settings: { stability: 0.7, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
      })
      if (!r.success) throw new Error(r.error)
      const { bytes, type } = decodeDataUrl(r.data.audioUrl, 'audio/mpeg')
      const stored = await files.upload(new Blob([bytes], { type }), {
        key: `stories/${p.storyId}/${slot}.mp3`,
        name: `${slot}.mp3`,
      })
      return stored.path
    } catch (err) {
      console.error(`[story ${p.storyId}] audio ${slot} failed: ${String(err)}`)
      return undefined
    }
  }
  const [withAudio, wordsWithAudio] = await Promise.all([
    Promise.all(
      questions.map(async (q, i) =>
        q.kind === 'phonics' ? { ...q, audioPath: await say(q.word, `phonics-${i}`) } : q,
      ),
    ),
    Promise.all(soundWords.map(async (w, i) => ({ ...w, audioPath: await say(w.word, `word-${i}`) }))),
  ])

  await patch({
    questions: withAudio,
    soundWords: wordsWithAudio,
    status: 'ready',
    progressMessage: '',
  })
  ctx.progress(1, 'ready')
  return { storyId: p.storyId, pictures: imagePaths.filter(Boolean).length }
}

/** Ask Claude for the story; one retry when the JSON does not validate. */
async function writeStory(tools: ActionTools, p: GenerateStoryPayload): Promise<StoryDraft> {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: buildUserPrompt(p) },
  ]
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await tools.integration<unknown>('anthropic/chat-completion', {
      model: STORY_MODEL,
      // The model reasons before it answers, and reasoning tokens count
      // against this budget. 4096 was used up entirely by reasoning in the
      // first local test; the story JSON itself is ~1.5k tokens.
      max_tokens: 16000,
      temperature: 0.9,
      system: SYSTEM_PROMPT,
      messages,
    })
    if (!r.success) throw new Error(`Claude call failed: ${r.error}`)
    const text = replyText(r.data)
    try {
      return parseStoryDraft(extractJson(text))
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      messages.push(
        { role: 'assistant', content: text },
        {
          role: 'user',
          content: `That JSON was not usable (${lastError}). Reply again with only the corrected JSON object.`,
        },
      )
    }
  }
  throw new Error(`Story JSON invalid after retry: ${lastError}`)
}

/** Text out of an Anthropic Messages reply (or an OpenAI-shaped one, defensively). */
export function replyText(data: unknown): string {
  const d = (data ?? {}) as Record<string, unknown>
  if (Array.isArray(d.content)) {
    return d.content
      .map((b) => ((b as { type?: string }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : ''))
      .join('')
  }
  if (typeof d.content === 'string') return d.content
  const choice = (d.choices as { message?: { content?: string } }[] | undefined)?.[0]
  if (choice?.message?.content) return choice.message.content
  if (typeof d.text === 'string') return d.text
  throw new Error('Unrecognized reply shape from the story writer.')
}
