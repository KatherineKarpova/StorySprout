/**
 * Bookshelf: the reader's stories, newest first, with their best quiz score.
 * Lives under (app)/ rather than (protected)/ so signed-out visitors get a
 * friendly invitation instead of a bare gate.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, useQuery } from 'deepspace'
import { Plus, Star } from 'lucide-react'
import { Button, Switch } from '@/components/ui'
import { runAction } from '@/lib/actions'
import { Panel } from '@/components/story/Panel'
import { gridFor } from '@/story/panels'
import { coverPanel } from '@/story/tree'
import { cn } from '@/lib/utils'
import { DAILY_STORY_LIMIT, interestLabel, levelFor, type QuizAttemptRecord, type StoryRecord } from '@/story/catalog'

export default function HomePage() {
  const { isSignedIn, isLoaded, user } = useAuthProfileReady({ requireUser: true })
  const [showAuth, setShowAuth] = useState(false)

  if (!isLoaded) return null
  if (!isSignedIn) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <div className="text-7xl" aria-hidden>
          📚
        </div>
        <h1 className="mt-5 text-4xl font-semibold text-foreground">Your bookshelf is waiting</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          A grown-up signs in once. Then every story you make is saved here to read again.
        </p>
        <Button size="lg" className="mt-8 h-14 rounded-full px-8 text-lg font-semibold" onClick={() => setShowAuth(true)}>
          Sign in to start
        </Button>
        {showAuth && <AuthOverlay onClose={() => setShowAuth(false)} />}
      </div>
    )
  }
  return (
    <>
      {/* The app owner is always an admin; the actions re-check ownership. */}
      {user?.role === 'admin' && <WhoPays />}
      <Shelf />
    </>
  )
}

function Shelf() {
  const { records: stories, status } = useQuery<StoryRecord>('stories', { orderBy: 'createdAt', orderDir: 'desc' })
  const { records: attempts } = useQuery<QuizAttemptRecord>('quiz_attempts')

  const best = useMemo(() => {
    const m = new Map<string, { correct: number; total: number }>()
    for (const a of attempts) {
      const prev = m.get(a.data.storyId)
      if (!prev || a.data.correct > prev.correct) m.set(a.data.storyId, { correct: a.data.correct, total: a.data.total })
    }
    return m
  }, [attempts])

  const today = new Date().toISOString().slice(0, 10)
  // Mirrors startStory: failed stories do not use up the reader's day.
  const left = Math.max(
    0,
    DAILY_STORY_LIMIT - stories.filter((s) => s.createdAt.startsWith(today) && s.data.status !== 'failed').length,
  )
  const stars = [...best.values()].reduce((n, b) => n + b.correct, 0)

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">My bookshelf</h1>
          <p className="mt-1 text-lg text-muted-foreground">
            {stories.length === 0
              ? 'No stories yet. Let’s make your first one!'
              : `${stories.length} ${stories.length === 1 ? 'story' : 'stories'} · ${stars} ⭐ earned`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            to="/new"
            className={cn(
              'inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[17px] font-semibold text-primary-foreground hover:bg-primary/90',
              left === 0 && 'pointer-events-none opacity-50',
            )}
            aria-disabled={left === 0}
          >
            <Plus className="h-5 w-5" aria-hidden /> New story
          </Link>
          <span className="text-sm text-muted-foreground">
            {left} new {left === 1 ? 'story' : 'stories'} left today
          </span>
        </div>
      </div>

      {status === 'loading' ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="sprout-shimmer h-44 rounded-3xl" />
          ))}
        </div>
      ) : stories.length === 0 ? (
        <Link
          to="/new"
          className="mt-10 flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-primary/40 bg-card px-6 py-16 text-center hover:border-primary"
        >
          <span className="text-6xl" aria-hidden>
            🌱
          </span>
          <span className="mt-4 font-display text-2xl font-semibold text-foreground">Make your first story</span>
          <span className="mt-1 text-muted-foreground">Pick dinosaurs, space, dragons, or anything you like.</span>
        </Link>
      ) : (
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((story) => {
            const s = story.data
            const score = best.get(story.recordId)
            const cover = s.imagePaths?.find(Boolean)
            const cooking = s.status !== 'ready' && s.status !== 'failed'
            return (
              <li key={story.recordId}>
                <Link
                  to={`/story/${story.recordId}`}
                  className="group block overflow-hidden rounded-3xl border-2 border-border bg-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_12px_28px_-12px_rgba(90,60,20,0.3)]"
                >
                  <div className="aspect-[4/3] bg-muted">
                    {cover && gridFor(s.imageLayout) ? (
                      // Cover = the sheet's cover panel (or its first picture), cropped to the card.
                      <Panel
                        src={cover}
                        grid={gridFor(s.imageLayout)!}
                        index={coverPanel(s.imageLayout)}
                        aspect={4 / 3}
                        alt=""
                        className="h-full w-full"
                      />
                    ) : cover ? (
                      <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className={cn('flex h-full items-center justify-center text-5xl', cooking && 'sprout-shimmer')} aria-hidden>
                        {s.status === 'failed' ? '🙈' : '📖'}
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold text-coral">
                      {levelFor(s.grade).label}
                      {cooking && ' · being made…'}
                      {s.status === 'failed' && ' · didn’t work'}
                    </p>
                    <p className="mt-0.5 font-display text-xl font-semibold leading-snug text-foreground">
                      {s.status === 'failed'
                        ? `Oops! The ${(s.interests ?? []).map(interestLabel).join(' & ') || 'story'} story got stuck`
                        : s.title || (s.interests ?? []).map(interestLabel).join(' & ') || 'New story'}
                    </p>
                    {score ? (
                      <p className="mt-2 flex items-center gap-0.5" aria-label={`${score.correct} of ${score.total} stars`}>
                        {Array.from({ length: score.total }, (_, i) => (
                          <Star key={i} className={cn('h-5 w-5', i < score.correct ? 'fill-[#f5b301] text-[#f5b301]' : 'text-border')} aria-hidden />
                        ))}
                      </p>
                    ) : (
                      s.status === 'ready' && <p className="mt-2 text-sm text-muted-foreground">Questions waiting</p>
                    )}
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Owner tools: switch new stories between "I pay" (default) and "readers use
 * their own DeepSpace credits", and see whether the credits ran out today
 * (which flips readers to their own credits until tomorrow or a switch-back).
 */
function WhoPays() {
  const [state, setState] = useState<{ readersPay: boolean; outOfCreditsToday: boolean } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    runAction<{ readersPay: boolean; outOfCreditsToday: boolean }>('ownerSettings', {}).then((r) => {
      if (live && r.success) setState(r.data)
    })
    return () => {
      live = false
    }
  }, [])

  async function toggle(on: boolean) {
    setBusy(true)
    const r = await runAction<{ readersPay: boolean }>('setReadersPay', { on })
    setBusy(false)
    if (r.success) setState({ readersPay: r.data.readersPay, outOfCreditsToday: on ? (state?.outOfCreditsToday ?? false) : false })
  }

  if (!state) return null
  const readersPay = state.readersPay || state.outOfCreditsToday
  return (
    <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-border px-4 py-3 text-[15px]">
      <div>
        <p className="font-semibold text-foreground">Owner tools · Who pays for new stories?</p>
        <p className="text-muted-foreground">
          {state.outOfCreditsToday
            ? 'Your credits ran out today, so readers are asked to use their own. Switch off to try yours again.'
            : readersPay
              ? 'Readers are asked to use their own DeepSpace credits.'
              : 'You pay (from your DeepSpace credits).'}
        </p>
      </div>
      <label className="flex items-center gap-2 font-semibold text-foreground">
        Readers use their own credits
        <Switch checked={readersPay} disabled={busy} onCheckedChange={(on: boolean) => toggle(on)} />
      </label>
    </div>
  )
}
