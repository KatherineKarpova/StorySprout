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
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { DAILY_STORY_LIMIT, type StoryRecord } from '../story/catalog'
import { normalizeRequest } from '../story/prompts'

export const GENERATE_STORY_JOB = 'generate-story'

export interface GenerateStoryPayload {
  storyId: string
  /** Verified caller id from the action context, never from request input. */
  userId: string
  grade: 1 | 2 | 3
  interests: string[]
  custom: string
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
    const madeToday = recent.filter((s) => (s.createdAt ?? '').startsWith(today)).length
    if (madeToday >= DAILY_STORY_LIMIT) {
      return {
        success: false,
        error: `That's ${DAILY_STORY_LIMIT} new stories today! Re-read a favorite and come back tomorrow.`,
      }
    }

    const initial: StoryRecord = {
      title: '',
      grade: req.grade,
      interests: [...req.interests, ...(req.custom ? [req.custom] : [])],
      status: 'queued',
      progressMessage: 'Getting the story ready…',
      paragraphs: [],
      imagePaths: [],
      imageAlts: [],
      imageSlots: [],
      questions: [],
      soundWords: [],
      wordCount: 0,
      error: '',
    }
    const created = await tools.create('stories', { ...initial })
    if (!created.success) return { success: false, error: created.error }
    const storyId = (created.data as { recordId: string }).recordId

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

  /** Delete a story and the pictures and audio stored for it. */
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
