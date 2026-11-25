/**
 * Server actions — the only way a story comes into existence.
 *
 * `startStory` is the trust boundary for the paid pipeline: it validates the
 * request, enforces the per-reader daily cap and one-at-a-time rule, creates
 * the story row, and queues the `generate-story` job. The job (src/jobs.ts)
 * spends owner credits on Claude, Gemini and ElevenLabs, so nothing else may
 * enqueue it: AppJobRoom refuses every socket write (worker.ts).
 */

import { appFiles, enqueueJob } from 'deepspace/worker'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { APP_DAILY_STORY_LIMIT, DAILY_STORY_LIMIT, INTERESTS, OWNER_NOT_PAYING, type StoryRecord } from '../story/catalog'
import { createActionTools } from '../server/action-routes'
import { generateStory, ownerOutKey } from '../jobs'
import { decodeDataUrl, normalizeRequest, normalizeWord, panelGridPrompt, wordClipId } from '../story/prompts'
import { VOICE_ID, recordSpeech } from '../story/voice'

/** New (uncached) word recordings, per UTC day. ~$0.005 each on the free tier. */
const WORDS_PER_READER_PER_DAY = 50
const WORDS_PER_APP_PER_DAY = 150

export const GENERATE_STORY_JOB = 'generate-story'

export interface GenerateStoryPayload {
  storyId: string
  /** Verified caller id from the action context, never from request input. */
  userId: string
  grade: 1 | 2 | 3
  interests: string[]
  custom: string[]
}

interface StoryRow {
  recordId: string
  createdBy?: string
  createdAt?: string
  data: Partial<StoryRecord>
}

async function myRecentStories(tools: ActionTools, userId: string): Promise<StoryRow[]> {
  const r = await tools.query('stories', {
    where: { createdBy: userId },
    orderBy: 'createdAt',
    orderDir: 'desc',
    limit: 50,
  })
  if (!r.success) throw new Error(r.error)
  return (r.data as { records: StoryRow[] }).records
}

async function loadOwnStory(tools: ActionTools, userId: string, storyId: unknown) {
  if (typeof storyId !== 'string' || !storyId) return null
  const r = await tools.get('stories', storyId)
  if (!r.success) return null
  const record = (r.data as { record: StoryRow }).record
  // Actions run RBAC-off: ownership is checked here or not at all.
  return record.createdBy === userId ? record : null
}

/** Stories a reader may make per day with their own credits. */
const READER_PAID_DAILY_LIMIT = 5
const OWNER_PAUSED_ID = 'owner-paused'

/** Owner-typed character description: plain text, one paragraph, ≤400 chars. */
function cleanCustomLong(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[<>{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400) : ''
}

/** False when the owner switched paying off, or ran out of credits today. */
async function ownerPaysNow(tools: ActionTools): Promise<boolean> {
  const day = new Date().toISOString().slice(0, 10)
  const [paused, out] = await Promise.all([tools.get('usage', OWNER_PAUSED_ID), tools.get('usage', ownerOutKey(day))])
  return !paused.success && !out.success
}

const IN_PROGRESS = new Set(['queued', 'writing', 'illustrating', 'recording'])
/** A job that has not finished in this long is treated as abandoned. */
const STALE_MS = 10 * 60 * 1000

export const actions: Record<string, ActionHandler<Env>> = {
  startStory: async ({ userId, params, tools, env }) => {
    if (userId.startsWith('anon-')) return { success: false, error: 'Sign in to make a story.' }

    const req = normalizeRequest(params)
    if ('error' in req) return { success: false, error: req.error }

    const recent = await myRecentStories(tools, userId)
    const now = Date.now()
    const busy = recent.find(
      (s) =>
        IN_PROGRESS.has(String(s.data.status)) &&
        now - Date.parse(s.createdAt ?? '') < STALE_MS,
    )
    if (busy) {
      return {
        success: false,
        error: 'Your last story is still being written. Hang on a moment!',
      }
    }
    const today = new Date().toISOString().slice(0, 10)
    // A story that failed is not the reader's fault, so it does not use up
    // their day; the app-wide cap below still counts it (it may have cost).
    const madeToday = recent.filter(
      (s) => (s.createdAt ?? '').startsWith(today) && s.data.status !== 'failed',
    ).length
    // Who pays? The owner by default. When the owner's credits ran out today
    // (or the owner switched paying off), the reader must agree to use their
    // own DeepSpace credits first: the client asks, then resends with
    // useMyCredits, and the story is written by `writeMyStory`, not the job.
    const readerPays = params.useMyCredits === true
    if (!readerPays && !(await ownerPaysNow(tools))) {
      return {
        success: false,
        code: OWNER_NOT_PAYING,
        error: "StorySprout's free stories are used up for now.",
      } as ActionResult<never>
    }
    // The owner pays for every story and tests the app, so the per-reader cap
    // does not apply to them; the app-wide cap below still does.
    const isOwner = !!env.OWNER_USER_ID && userId === env.OWNER_USER_ID
    if (readerPays) {
      // Their own money, but still a cap, so a stuck button cannot drain it.
      if (madeToday >= READER_PAID_DAILY_LIMIT) {
        return { success: false, error: `That's ${READER_PAID_DAILY_LIMIT} new stories today! Come back tomorrow.` }
      }
    } else {
      if (!isOwner && madeToday >= DAILY_STORY_LIMIT) {
        return {
          success: false,
          error: `That's ${DAILY_STORY_LIMIT} new stories today! Re-read a favorite and come back tomorrow.`,
        }
      }
      // App-wide ceiling: the owner pays for every reader, so the total matters
      // more than any one reader's share. Newest-first, so one page covers today.
      const all = await tools.query('stories', {
        orderBy: 'createdAt',
        orderDir: 'desc',
        limit: APP_DAILY_STORY_LIMIT + 1,
      })
      if (!all.success) return { success: false, error: 'Could not check today’s stories. Please try again.' }
      const appToday = (all.data as { records: StoryRow[] }).records.filter(
        (s) => (s.createdAt ?? '').startsWith(today) && s.data.paidBy !== 'reader',
      ).length
      if (appToday >= APP_DAILY_STORY_LIMIT) {
        console.warn(`[startStory] app daily limit reached (${appToday}/${APP_DAILY_STORY_LIMIT})`)
        return {
          success: false,
          error: 'StorySprout has written all its stories for today. Re-read one on your bookshelf and come back tomorrow!',
        }
      }
    }

    const initial: StoryRecord = {
      title: '',
      grade: req.grade,
      interests: [...req.interests, ...req.custom],
      status: 'queued',
      progressMessage: 'Getting the story ready…',
      nodes: [],
      imagePaths: [],
      imageAlts: [],
      imageLayout: '',
      libraryId: '',
      paidBy: readerPays ? 'reader' : 'owner',
      wordCount: 0,
      error: '',
    }
    const created = await tools.create('stories', { ...initial })
    if (!created.success) return { success: false, error: created.error }
    const storyId = (created.data as { recordId: string }).recordId
    // Reader-paid: the client now calls writeMyStory with its own token.
    if (readerPays) return { success: true, data: { storyId, paidBy: 'reader' } }

    const payload: GenerateStoryPayload = { storyId, userId, ...req }
    try {
      await enqueueJob(env.JOB_ROOMS, `app:${env.DEEPSPACE_APP_ID}`, GENERATE_STORY_JOB, payload, {
        maxAttempts: 1,
        enqueuedBy: userId,
      })
    } catch (err) {
      console.error(`[startStory] enqueue failed story=${storyId}: ${String(err)}`)
      await tools.update('stories', storyId, {
        status: 'failed',
        error: 'Could not start the story writer. Please try again.',
      })
      return { success: false, error: 'Could not start the story writer. Please try again.' }
    }
    return { success: true, data: { storyId } }
  },

  /**
   * Hope says one tapped word. Recorded the first time anyone taps that word,
   * then served from the app-wide cache (word_clips + public R2 file) for
   * free, so the common words of every story are paid for once, ever. New
   * recordings are capped per reader and app-wide per day; a cache hit is
   * never capped.
   */
  sayWord: async ({ userId, params, tools, env }) => {
    if (userId.startsWith('anon-')) return { success: false, error: 'Sign in to hear words.' }
    const word = normalizeWord(params.word)
    if (!word) return { success: false, error: 'That is not a word I can say.' }
    const id = `${VOICE_ID}-${wordClipId(word)}`

    const cached = await tools.get('word_clips', id)
    if (cached.success) {
      const path = (cached.data as { record: { data: { path?: string } } }).record.data.path
      if (path) return { success: true, data: { word, path, cached: true } }
    }

    const day = new Date().toISOString().slice(0, 10)
    const [mine, everyone] = await Promise.all([
      tools.query('usage', { where: { userId, day, kind: 'word' }, limit: WORDS_PER_READER_PER_DAY + 1 }),
      tools.query('usage', { where: { day, kind: 'word' }, limit: WORDS_PER_APP_PER_DAY + 1 }),
    ])
    if (!mine.success || !everyone.success) return { success: false, error: 'Please try that word again.' }
    const count = (r: typeof mine) => (r.success ? (r.data as { records: unknown[] }).records.length : 0)
    if (count(mine) >= WORDS_PER_READER_PER_DAY || count(everyone) >= WORDS_PER_APP_PER_DAY) {
      console.warn(`[sayWord] daily word limit reached caller=${userId}`)
      return { success: false, error: 'Hope needs a rest! Try sounding this one out, and tap again tomorrow.' }
    }
    // Count before spending, so a burst of taps cannot slip past the cap.
    await tools.create('usage', { userId, day, kind: 'word' })

    try {
      const clip = await recordSpeech(tools, `${word}.`)
      // App scope: public, shared by every reader. A pronunciation is not
      // private data, and sharing it is what makes the cache work.
      const stored = await appFiles(env, { scope: 'app', userId }).upload(clip, {
        key: `words/${VOICE_ID}/${wordClipId(word)}.mp3`,
        name: `${word}.mp3`,
      })
      await tools.create('word_clips', { word, voiceId: VOICE_ID, path: stored.path }, id)
      return { success: true, data: { word, path: stored.path, cached: false } }
    } catch (err) {
      console.error(`[sayWord] "${word}" failed: ${String(err)}`)
      return { success: false, error: 'Hope could not say that word right now.' }
    }
  },

  /** Delete a story and the pictures and audio stored for it. */
  /**
   * Write a reader-paid story (made by startStory with useMyCredits) with
   * the reader's own token, so every paid call bills their DeepSpace
   * credits. Runs inside this request (about a minute; the story page fills
   * in live meanwhile) because a background job has no caller token, and the
   * token is never stored. The story is claimed first so it runs once.
   */
  writeMyStory: async ({ userId, params, tools, env, callerJwt }) => {
    if (typeof params.storyId !== 'string' || !params.storyId) return { success: false, error: 'Story not found.' }
    const got = await tools.get('stories', params.storyId)
    if (!got.success) return { success: false, error: 'Story not found.' }
    const story = (got.data as { record: StoryRow }).record
    if (story.createdBy !== userId || story.data.paidBy !== 'reader') return { success: false, error: 'Story not found.' }
    if (story.data.status !== 'queued') return { success: false, error: 'This story is already being written.' }
    await tools.update('stories', story.recordId, { status: 'writing' })

    const known = new Set(INTERESTS.map((i) => i.id))
    const interests = story.data.interests ?? []
    const payload: GenerateStoryPayload = {
      storyId: story.recordId,
      userId,
      grade: (story.data.grade ?? 1) as 1 | 2 | 3,
      interests: interests.filter((i) => known.has(i)),
      custom: interests.filter((i) => !known.has(i)),
    }
    try {
      await generateStory(payload, env, {
        tools: createActionTools(env, userId, callerJwt, { billCaller: true }),
        progress: () => {},
        signal: AbortSignal.timeout(8 * 60 * 1000),
        paidBy: 'reader',
      })
    } catch (err) {
      // generateStory already marked the story failed with a kid-friendly message.
      console.error(`[writeMyStory] story=${story.recordId} failed: ${String(err)}`)
      return { success: false, error: 'The story could not be finished.' }
    }
    return { success: true, data: { storyId: story.recordId } }
  },

  /** Owner only: does the owner pay for new stories right now, and why not. */
  ownerSettings: async ({ userId, tools, env }) => {
    if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) return { success: false, error: 'Owner only.' }
    const day = new Date().toISOString().slice(0, 10)
    const [paused, out] = await Promise.all([tools.get('usage', OWNER_PAUSED_ID), tools.get('usage', ownerOutKey(day))])
    return { success: true, data: { readersPay: paused.success, outOfCreditsToday: out.success } }
  },

  /** Owner only: switch "readers use their own credits" on or off. */
  setReadersPay: async ({ userId, params, tools, env }) => {
    if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) return { success: false, error: 'Owner only.' }
    const day = new Date().toISOString().slice(0, 10)
    if (params.on === true) {
      await tools.create('usage', { userId: 'owner', day, kind: 'owner_paused' }, OWNER_PAUSED_ID)
    } else {
      await tools.remove('usage', OWNER_PAUSED_ID)
      // Turning paying back on also clears today's "ran out" mark (e.g. after a top-up).
      await tools.remove('usage', ownerOutKey(day))
    }
    return { success: true, data: { readersPay: params.on === true } }
  },

  /**
   * Owner only: redraw one story's picture sheet at 2K (~$0.70, about 10×
   * a 1K sheet), for a story worth showing off. Uses the story's saved
   * character sheet and scenes; older stories fall back to the per-panel alt
   * text. The new sheet goes into the story's own private folder (the shared
   * library keeps its 1K sheet), and the open reader updates live.
   */
  redrawPictures: async ({ userId, params, tools, env }) => {
    if (!env.OWNER_USER_ID || userId !== env.OWNER_USER_ID) {
      return { success: false, error: 'Only the app owner can redraw pictures.' }
    }
    if (typeof params.storyId !== 'string' || !params.storyId) return { success: false, error: 'Story not found.' }
    const got = await tools.get('stories', params.storyId)
    if (!got.success) return { success: false, error: 'Story not found.' }
    const story = (got.data as { record: StoryRow }).record
    const s = story.data
    const layout = s.imageLayout
    if (s.status !== 'ready' || (layout !== 'grid3x2' && layout !== 'grid4x4')) {
      return { success: false, error: 'This story has no pictures to redraw yet.' }
    }
    const scenes = s.scenes?.length ? s.scenes : (s.imageAlts ?? [])
    // The owner's description wins (e.g. to fix a hair color the model got
    // wrong); then the saved character sheet. Saved for the next redraw.
    const characters = cleanCustomLong(params.characters) || s.characters || ''
    if (scenes.length < (layout === 'grid4x4' ? 16 : 6)) return { success: false, error: 'This story is missing picture descriptions.' }

    const r = await tools.integration<{ base64Images: string[] }>('gemini/generate-image', {
      model: 'gemini-3.1-flash-image-preview',
      imageSize: '2K',
      aspectRatio: layout === 'grid4x4' ? '1:1' : '3:2',
      prompt: panelGridPrompt(characters, scenes, layout),
    })
    if (!r.success) {
      console.error(`[redrawPictures] story=${story.recordId} failed: ${r.error}`)
      return { success: false, error: 'The pictures could not be redrawn. Nothing was changed.' }
    }
    const first = r.data.base64Images?.[0]
    if (!first) return { success: false, error: 'The pictures could not be redrawn. Nothing was changed.' }
    const { bytes, type } = decodeDataUrl(first, 'image/png')
    const ext = type.includes('jpeg') ? 'jpg' : 'png'
    // The story's creator, from the record (never from input), owns the folder.
    const owner = story.createdBy ?? userId
    const stored = await appFiles(env, { scope: 'self', userId: owner }).upload(new Blob([bytes], { type }), {
      key: `stories/${story.recordId}/pictures-2k.${ext}`,
      name: `pictures-2k.${ext}`,
    })
    const updated = await tools.update('stories', story.recordId, { imagePaths: [stored.path], hiRes: true, characters })
    if (!updated.success) return { success: false, error: updated.error }
    console.info(`[redrawPictures] story=${story.recordId} redrawn at 2K`)
    return { success: true, data: { storyId: story.recordId } }
  },

  deleteStory: async ({ userId, params, tools, env }) => {
    const story = await loadOwnStory(tools, userId, params.storyId)
    if (!story) return { success: false, error: 'Story not found.' }

    const files = appFiles(env, { scope: 'self', userId })
    try {
      const listed = await files.list({ prefix: `stories/${story.recordId}/` })
      await Promise.all(listed.files.map((f) => files.delete(f.key)))
    } catch (err) {
      // Orphaned files only cost storage; never block the delete on them.
      console.error(`[deleteStory] file cleanup failed story=${story.recordId}: ${String(err)}`)
    }
    await tools.deleteWhere('quiz_attempts', { storyId: story.recordId, createdBy: userId })
    const removed = await tools.remove('stories', story.recordId)
    if (!removed.success) return { success: false, error: removed.error }
    return { success: true, data: { storyId: story.recordId } }
  },
}
