/**
 * Story picker: reading level, up to three interest chips, and an optional
 * typed idea. Submitting calls the `startStory` action (which validates and
 * caps) and goes straight to the reader, which fills in live as the job runs.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { runAction } from '@/lib/actions'
import {
  INTERESTS,
  MAX_CUSTOM_INTEREST_LENGTH,
  MAX_INTERESTS,
  READING_LEVELS,
  type Grade,
} from '@/story/catalog'

const GRADE_KEY = 'storysprout:grade'

function rememberedGrade(): Grade | null {
  try {
    const g = Number(localStorage.getItem(GRADE_KEY))
    return g === 1 || g === 2 || g === 3 ? g : null
  } catch {
    return null
  }
}

export default function NewStoryPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [grade, setGrade] = useState<Grade | null>(() => {
    const g = Number(params.get('grade'))
    return g === 1 || g === 2 || g === 3 ? g : rememberedGrade()
  })
  const [picked, setPicked] = useState<string[]>(() =>
    (params.get('interests') ?? '')
      .split(',')
      .filter((id) => INTERESTS.some((i) => i.id === id))
      .slice(0, MAX_INTERESTS),
  )
  const [custom, setCustom] = useState(params.get('custom') ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const full = picked.length >= MAX_INTERESTS
  const hasTopic = picked.length > 0 || custom.trim().length > 0
  const canGo = grade !== null && hasTopic && !busy

  function toggle(id: string) {
    setError(null)
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= MAX_INTERESTS ? cur : [...cur, id],
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!canGo || grade === null) return
    setBusy(true)
    setError(null)
    try {
      localStorage.setItem(GRADE_KEY, String(grade))
    } catch {
      /* private mode: just don't remember */
    }
    const r = await runAction<{ storyId: string }>('startStory', {
      grade,
      interests: picked,
      custom: custom.trim(),
    })
    if (!r.success) {
      setBusy(false)
      setError(r.error)
      return
    }
    navigate(`/story/${r.data.storyId}`)
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:pt-12">
      <h1 className="text-3xl font-semibold text-foreground sm:text-4xl">Let's make a story!</h1>
      <p className="mt-2 text-lg text-muted-foreground">Pick how you read, then pick what you love.</p>

      {/* ── Step 1: reading level ─────────────────────────────────── */}
      <fieldset className="mt-10">
        <legend className="font-display text-xl font-semibold text-foreground">
          <StepDot n={1} /> How do you read?
        </legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {READING_LEVELS.map((level) => {
            const on = grade === level.grade
            return (
              <button
                key={level.grade}
                type="button"
                aria-pressed={on}
                data-testid={`grade-${level.grade}`}
                onClick={() => setGrade(level.grade)}
                className={cn(
                  'rounded-2xl border-2 bg-card p-5 text-left transition-all',
                  on
                    ? 'border-primary shadow-[0_0_0_4px_rgba(47,125,79,0.15)]'
                    : 'border-border hover:border-primary/50',
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-2xl font-semibold text-foreground">{level.label}</span>
                  <span className="text-sm text-muted-foreground">{level.ages}</span>
                </div>
                <p className="mt-1.5 text-[15px] text-muted-foreground">{level.blurb}</p>
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* ── Step 2: interests ─────────────────────────────────────── */}
      <fieldset className="mt-12">
        <legend className="font-display text-xl font-semibold text-foreground">
          <StepDot n={2} /> What should it be about?
        </legend>
        <p className="mt-1 text-[15px] text-muted-foreground" aria-live="polite">
          Pick up to {MAX_INTERESTS}.{' '}
          {picked.length > 0 && <span className="font-semibold text-foreground">{picked.length} picked</span>}
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {INTERESTS.map((it) => {
            const on = picked.includes(it.id)
            return (
              <button
                key={it.id}
                type="button"
                aria-pressed={on}
                disabled={!on && full}
                onClick={() => toggle(it.id)}
                className={cn(
                  'flex items-center gap-2 rounded-full border-2 px-4 py-2.5 text-[16px] font-semibold transition-all',
                  on
                    ? 'border-coral bg-secondary text-secondary-foreground'
                    : 'border-border bg-card text-foreground hover:border-coral/60',
                  !on && full && 'opacity-40',
                )}
              >
                <span aria-hidden className="text-xl leading-none">
                  {it.emoji}
                </span>
                {it.label}
              </button>
            )
          })}
        </div>

        <label htmlFor="custom-idea" className="mt-8 block text-[15px] font-semibold text-foreground">
          Or type your own idea
        </label>
        <div className="relative mt-2 max-w-xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="custom-idea"
            type="search"
            value={custom}
            maxLength={MAX_CUSTOM_INTEREST_LENGTH}
            onChange={(e) => {
              setError(null)
              setCustom(e.target.value)
            }}
            placeholder="volcanoes, my cat Pepper, baking cookies…"
            className="h-14 w-full rounded-full border-2 border-input bg-card pl-12 pr-5 text-[17px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary"
          />
        </div>
      </fieldset>

      {/* ── Go ────────────────────────────────────────────────────── */}
      <div className="mt-12 flex flex-col items-start gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={!canGo}
          loading={busy}
          data-testid="make-story"
          className="h-14 rounded-full px-8 text-lg font-semibold"
        >
          {!busy && <Sparkles aria-hidden />}
          {busy ? 'Starting…' : 'Make my story'}
        </Button>
        {!grade && <p className="text-[15px] text-muted-foreground">First, pick how you read.</p>}
        {grade && !hasTopic && <p className="text-[15px] text-muted-foreground">Now pick something you like.</p>}
        {error && (
          <p role="alert" className="rounded-xl bg-secondary px-4 py-3 text-[15px] font-semibold text-secondary-foreground">
            {error}
          </p>
        )}
      </div>
    </form>
  )
}

function StepDot({ n }: { n: number }) {
  return (
    <span
      aria-hidden
      className="mr-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
    >
      {n}
    </span>
  )
}
