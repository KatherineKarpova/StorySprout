/**
 * Background jobs, run by AppJobRoom (worker.ts).
 *
 * `generate-story` is the whole paid pipeline for one story:
 *
 *   1. Claude writes the story + quiz as JSON  → record shows text   (status: illustrating)
 *   2. Gemini paints 9 page pictures as one grid → R2 → panels  (status: recording)
 *   3. Hope (ElevenLabs) says each phonics word → R2 → audio  (status: ready)
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
import type { StoryRecord } from './story/catalog'
import { recordSpeech } from './story/voice'
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  countWords,
  decodeDataUrl,
  extractJson,
  panelGridPrompt,
  parseStoryDraft,
  type StoryDraft,
} from './story/prompts'

/**
 * Haiku, not Sonnet: Claude was ~60% of a story's cost on Sonnet (~$0.19 of
 * ~$0.33). Stories for ages 6-8 are short and simple, and the strict JSON
 * validation in parseStoryDraft catches a weaker draft either way.
 */
export const STORY_MODEL = 'claude-haiku-5-5'
export const IMAGE_MODEL = 'gemini-2.5-flash-image'

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
    const outOfCredits = /insufficient_credits|credits/i.test(message)
    await patch({
      status: 'failed',
      progressMessage: '',
      error: outOfCredits
        ? 'StorySprout is out of story magic for now. Please come back another day!'
        : 'The story writer got stuck. Please try a new story.',
    })
    throw err
  }
  checkAlive()
  await patch({
    title: draft.title,
    paragraphs: draft.paragraphs,
    questions: draft.questions,
    checkpoints: draft.checkpoints,
    soundWords: [],
    imageAlts: draft.panels.map((pn) => pn.alt),
    imageSlots: [],
    imageLayout: 'grid3x3',
    wordCount: countWords(draft.paragraphs),
    status: 'illustrating',
    progressMessage: 'Painting the pictures…',
  })
  ctx.progress(0.4, 'illustrating')

  // ── 2. One grid image of nine page pictures (a failure leaves none) ──────
  const imagePaths: string[] = []
  try {
    const r = await tools.integration<{ base64Images: string[] }>('gemini/generate-image', {
      model: IMAGE_MODEL,
      prompt: panelGridPrompt(draft.characters, draft.panels.map((pn) => pn.scene)),
      // 3 columns x 3 rows of square panels.
      aspectRatio: '1:1',
    })
    if (!r.success) throw new Error(r.error)
    const first = r.data.base64Images?.[0]
    if (!first) throw new Error('no image returned')
    const { bytes, type } = decodeDataUrl(first, 'image/png')
    const ext = type.includes('jpeg') ? 'jpg' : type.split('/')[1] || 'png'
    const stored = await files.upload(new Blob([bytes], { type }), {
      key: `stories/${p.storyId}/panels.${ext}`,
      name: `panels.${ext}`,
    })
    imagePaths.push(stored.path)
  } catch (err) {
    console.error(`[story ${p.storyId}] panel grid failed: ${String(err)}`)
  }
  checkAlive()
  await patch({ imagePaths, status: 'recording', progressMessage: 'Recording the tricky words…' })
  ctx.progress(0.75, 'recording')

  // ── 3. Hope says each in-book phonics word ──────────────────────────────
  const checkpoints = await Promise.all(
    draft.checkpoints.map(async (q, i) => {
      try {
        // Said twice with a pause: once to hear it, once to say it along.
        const clip = await recordSpeech(tools, `${q.word}. ... ${q.word}.`)
        const stored = await files.upload(clip, { key: `stories/${p.storyId}/phonics-${i + 1}.mp3`, name: `phonics-${i + 1}.mp3` })
        return { ...q, audioPath: stored.path }
      } catch (err) {
        // The reader falls back to the shared tapped-word cache (sayWord).
        console.error(`[story ${p.storyId}] phonics audio ${i + 1} failed: ${String(err)}`)
        return q
      }
    }),
  )

  await patch({ checkpoints, status: 'ready', progressMessage: '' })
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
    if (!r.success) {
      const code = (r as { code?: string }).code ?? 'error'
      throw new Error(`Claude call failed [${code}]: ${r.error}`)
    }
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
