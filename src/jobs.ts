/**
 * Background jobs, run by AppJobRoom (worker.ts).
 *
 * `generate-story` is the whole paid pipeline for one choose-your-own-
 * adventure story:
 *
 *   0. Picture library: a saved sheet with the same tree size and interests
 *      that this reader has not seen? Then reuse it and skip step 2.
 *   1. Claude writes the story tree + questions as JSON (fitting the reused
 *      pictures when there are some)           → record shows text (illustrating)
 *   2. Gemini paints every panel as one grid → R2 (and into the library
 *      when the topics are all catalog interests) → panels           (recording)
 *   3. Hope (ElevenLabs) says each node's phonics word → R2 → audio  (ready)
 *
 * Each stage patches the story record, and RecordRoom pushes the patch to the
 * reader's open page over its WebSocket. Only step 1 is fatal: a story with
 * a missing picture or sound is still a story.
 */

import { appFiles } from 'deepspace/worker'
import type { ActionTools, Job, JobContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { GENERATE_STORY_JOB, type GenerateStoryPayload } from './actions/index'
import { createActionTools } from './server/action-routes'
import type { ImageLayout, StoryNode, StoryRecord } from './story/catalog'
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  decodeDataUrl,
  extractJson,
  panelGridPrompt,
  parseStory,
  type ExistingPictures,
  type PanelScene,
  type StoryDraft,
} from './story/prompts'
import { recordSpeech } from './story/voice'

/**
 * Haiku, not Sonnet: Claude was ~60% of a story's cost on Sonnet. Stories for
 * young readers are simple, and parseStory's strict validation (one retry)
 * catches a weaker draft either way.
 */
export const STORY_MODEL = 'claude-haiku-5-5'

/**
 * Sheet settings per layout, both at 1K with the standard-priced model.
 * Measured: a 4×4 sheet at 2K (gemini-3.1-flash-image-preview) cost $0.72,
 * ~11× the 1K sheet's ~$0.065, which on the free tier's 500 credits meant
 * only a handful of grade 2-3 stories. At 1K the 4×4 panels are ~256px and
 * a little softer on half a page; a side-by-side check judged that
 * acceptable for the watercolor style.
 */
const SHEETS: Record<Exclude<ImageLayout, ''>, { model: string; aspectRatio: string; imageSize?: string }> = {
  grid3x2: { model: 'gemini-2.5-flash-image', aspectRatio: '3:2' },
  grid4x4: { model: 'gemini-2.5-flash-image', aspectRatio: '1:1' },
}

const JOB_DEADLINE_MS = 8 * 60 * 1000

export async function runJob(job: Job, ctx: JobContext, env: Env): Promise<unknown> {
  if (job.type === GENERATE_STORY_JOB) {
    return generateStory(job.payload as GenerateStoryPayload, ctx, env)
  }
  throw new Error(`Unknown job type: ${job.type}`)
}

interface LibraryRow {
  recordId: string
  data: {
    band: string
    interestsKey: string
    layout: string
    characters: string
    panels: PanelScene[]
    sheetPath: string
    uses?: number
  }
}

const bandFor = (grade: number) => (grade === 1 ? 'tree3' : 'tree7')
/** Only stories made purely from catalog interests share pictures. */
const shareable = (p: GenerateStoryPayload) => p.custom.length === 0 && p.interests.length > 0
const interestsKey = (ids: string[]) => [...ids].sort().join('+')

/** A saved sheet for the same tree and interests that this reader has not seen. */
async function findLibrarySheet(tools: ActionTools, p: GenerateStoryPayload): Promise<LibraryRow | null> {
  if (!shareable(p)) return null
  const [lib, mine] = await Promise.all([
    tools.query('picture_library', {
      where: { band: bandFor(p.grade), interestsKey: interestsKey(p.interests) },
      limit: 50,
    }),
    tools.query('stories', { where: { createdBy: p.userId }, limit: 200 }),
  ])
  if (!lib.success || !mine.success) return null
  const seen = new Set(
    (mine.data as { records: { data: { libraryId?: string } }[] }).records
      .map((r) => r.data.libraryId)
      .filter(Boolean),
  )
  const fresh = (lib.data as unknown as { records: LibraryRow[] }).records.filter(
    (r) => r.data.sheetPath && !seen.has(r.recordId),
  )
  return fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : null
}

async function generateStory(p: GenerateStoryPayload, ctx: JobContext, env: Env) {
  const tools = createActionTools(env, p.userId, '')
  const privateFiles = appFiles(env, { scope: 'self', userId: p.userId })
  const deadline = Date.now() + JOB_DEADLINE_MS
  const patch = async (data: Partial<StoryRecord>) => {
    const r = await tools.update('stories', p.storyId, data)
    if (!r.success) console.error(`[story ${p.storyId}] record update failed: ${r.error}`)
  }
  const checkAlive = () => {
    if (ctx.signal.aborted) throw new Error('Canceled')
    if (Date.now() > deadline) throw new Error('Took too long')
  }

  // ── 0 + 1. Library lookup, then the words ─────────────────────────────────
  let draft: StoryDraft
  let reused: LibraryRow | null = null
  try {
    ctx.progress(0.05, 'writing')
    await patch({ status: 'writing', progressMessage: 'Writing your adventure…' })
    reused = await findLibrarySheet(tools, p)
    const existing: ExistingPictures | undefined = reused
      ? { characters: reused.data.characters, panels: reused.data.panels }
      : undefined
    draft = await writeStory(tools, p, existing)
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
  if (reused) {
    console.info(`[story ${p.storyId}] reusing library sheet ${reused.recordId}`)
    await tools.update('picture_library', reused.recordId, { uses: (reused.data.uses ?? 0) + 1 })
  }
  await patch({
    title: draft.title,
    nodes: draft.nodes,
    imageLayout: draft.layout,
    imageAlts: draft.panels.map((pn) => pn.alt),
    imagePaths: reused ? [reused.data.sheetPath] : [],
    libraryId: reused?.recordId ?? '',
    wordCount: draft.wordCount,
    status: reused ? 'recording' : 'illustrating',
    progressMessage: reused ? 'Recording the tricky words…' : 'Painting the pictures…',
  })
  ctx.progress(0.4, reused ? 'recording' : 'illustrating')

  // ── 2. One grid image of every panel (a failure leaves none) ─────────────
  if (!reused) {
    try {
      const sheet = SHEETS[draft.layout]
      const r = await tools.integration<{ base64Images: string[] }>('gemini/generate-image', {
        ...sheet,
        prompt: panelGridPrompt(
          draft.characters,
          draft.panels.map((pn) => pn.scene),
          draft.layout,
        ),
      })
      if (!r.success) throw new Error(r.error)
      const first = r.data.base64Images?.[0]
      if (!first) throw new Error('no image returned')
      const { bytes, type } = decodeDataUrl(first, 'image/png')
      const ext = type.includes('jpeg') ? 'jpg' : type.split('/')[1] || 'png'
      const blob = new Blob([bytes], { type })
      if (shareable(p)) {
        // Library sheets live in the app's public files so any reader's story
        // can reuse them; they show catalog topics only, nothing personal.
        const stored = await appFiles(env, { scope: 'app', userId: p.userId }).upload(blob, {
          key: `library/${p.storyId}.${ext}`,
          name: `pictures.${ext}`,
        })
        const entry = await tools.create('picture_library', {
          band: bandFor(p.grade),
          interestsKey: interestsKey(p.interests),
          layout: draft.layout,
          characters: draft.characters,
          panels: draft.panels,
          sheetPath: stored.path,
          sourceStoryId: p.storyId,
          uses: 1,
        })
        await patch({
          imagePaths: [stored.path],
          libraryId: entry.success ? (entry.data as { recordId: string }).recordId : '',
        })
      } else {
        const stored = await privateFiles.upload(blob, {
          key: `stories/${p.storyId}/pictures.${ext}`,
          name: `pictures.${ext}`,
        })
        await patch({ imagePaths: [stored.path] })
      }
    } catch (err) {
      console.error(`[story ${p.storyId}] picture sheet failed: ${String(err)}`)
    }
    checkAlive()
    await patch({ status: 'recording', progressMessage: 'Recording the tricky words…' })
    ctx.progress(0.75, 'recording')
  }

  // ── 3. Hope says each node's phonics word ────────────────────────────────
  const nodes: StoryNode[] = await Promise.all(
    draft.nodes.map(async (node, i) => {
      const word = node.phonics.word
      try {
        // Said twice with a pause: once to hear it, once to say it along.
        const clip = await recordSpeech(tools, `${word}. ... ${word}.`)
        const stored = await privateFiles.upload(clip, {
          key: `stories/${p.storyId}/phonics-${i}.mp3`,
          name: `${word}.mp3`,
        })
        return { ...node, phonics: { ...node.phonics, audioPath: stored.path } }
      } catch (err) {
        // The quiz falls back to the shared tapped-word cache (sayWord).
        console.error(`[story ${p.storyId}] phonics audio ${i} failed: ${String(err)}`)
        return node
      }
    }),
  )

  await patch({ nodes, status: 'ready', progressMessage: '' })
  ctx.progress(1, 'ready')
  return { storyId: p.storyId, reusedPictures: !!reused }
}

/** Ask Claude for the story; one retry when the JSON does not validate. */
async function writeStory(
  tools: ActionTools,
  p: GenerateStoryPayload,
  existing?: ExistingPictures,
): Promise<StoryDraft> {
  const messages: { role: 'user' | 'assistant'; content: string }[] = [
    { role: 'user', content: buildUserPrompt(p, existing) },
  ]
  let lastError = ''
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await tools.integration<unknown>('anthropic/chat-completion', {
      model: STORY_MODEL,
      // The model reasons before it answers, and reasoning tokens count
      // against this budget (4096 was used up by reasoning alone once). A
      // 7-node tree is ~3-4k tokens of JSON.
      max_tokens: 20000,
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
      return parseStory(extractJson(text), p.grade, existing)
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      // Logged so a recurring validation failure (each retry is a paid call)
      // shows up in `deepspace logs`, not only when both attempts fail.
      console.warn(`[story ${p.storyId}] draft ${attempt + 1} rejected: ${lastError}`)
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
