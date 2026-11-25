/**
 * Story picker: reading level, then up to three picks, from the interest
 * chips and/or the child's own typed ideas (Enter or "Add" turns a typed idea
 * into a chip; it never starts a story). Only the "Make my story" button
 * calls `startStory` (which validates and caps) and goes straight to the
 * reader, which fills in live as the job runs.
 */

import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { runAction } from '@/lib/actions'
import {
  INTERESTS,
  MAX_CUSTOM_INTEREST_LENGTH,
  MAX_INTERESTS,
  MAX_CAST,
  MAX_CAST_DESCRIPTION,
  MAX_CAST_NAME,
  OWNER_NOT_PAYING,
  OWNER_PAYS,
  type CastMember,
  READER_COST_ESTIMATE,
  READING_LEVELS,
  type Grade,
} from '@/story/catalog'

const GRADE_KEY = 'storysprout:grade'

/** What the picker asks the server for. */
interface StoryAsk {
  grade: Grade
  interests: string[]
  custom: string[]
  cast: CastMember[]
}

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
  // Typed ideas already added as chips; `draft` is what is in the box now.
  const [customs, setCustoms] = useState<string[]>(() =>
    params.getAll('custom').filter(Boolean).slice(0, MAX_INTERESTS),
  )
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  // Set when the owner is not paying: the request waiting for the reader's OK.
  const [askToPay, setAskToPay] = useState<StoryAsk | null>(null)
  // Optional main characters: rows of name + description; blank rows are ignored.
  const [cast, setCast] = useState<CastMember[]>(() => {
    try {
      const fromRetry = JSON.parse(params.get('cast') ?? '[]') as CastMember[]
      return Array.isArray(fromRetry) ? fromRetry.slice(0, MAX_CAST) : []
    } catch {
      return []
    }
  })
  const [error, setError] = useState<string | null>(null)

  const count = picked.length + customs.length
  const full = count >= MAX_INTERESTS
  // Text typed but not yet added with Enter/Add still counts when the child
  // presses "Make my story", as long as there is room for it.
  const pendingIdea = full ? '' : draft.replace(/\s+/g, ' ').trim()
  const hasTopic = count > 0 || pendingIdea.length > 0
  const canGo = grade !== null && hasTopic && !busy

  function toggle(id: string) {
    setError(null)
    setPicked((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : full ? cur : [...cur, id],
    )
  }

  function addCustom() {
    const idea = draft.replace(/\s+/g, ' ').trim()
    if (!idea || full) return
    setError(null)
    if (!customs.some((c) => c.toLowerCase() === idea.toLowerCase())) setCustoms((cur) => [...cur, idea])
    setDraft('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    // Only the "Make my story" button starts a story. Some phone keyboards
    // submit the form from their Go/Search key without an Enter keydown; that
    // adds the typed idea as a chip instead, like Enter does.
    const submitter = (e.nativeEvent as SubmitEvent).submitter
    if (!(submitter instanceof HTMLElement) || submitter.dataset.testid !== 'make-story') {
      addCustom()
      return
    }
    if (!canGo || grade === null) return
    const ideas =
      pendingIdea && !customs.some((c) => c.toLowerCase() === pendingIdea.toLowerCase())
        ? [...customs, pendingIdea]
        : customs
    setCustoms(ideas)
    setDraft('')
    setBusy(true)
    setError(null)
    try {
      localStorage.setItem(GRADE_KEY, String(grade))
    } catch {
      /* private mode: just don't remember */
    }
    const chosenCast = cast
      .map((c) => ({ name: c.name.trim(), description: c.description.trim() }))
      .filter((c) => c.name)
    await start({ grade, interests: picked, custom: ideas, cast: chosenCast }, false)
  }

  /**
   * Ask the server for a story. When the owner is not paying right now, it
   * answers OWNER_NOT_PAYING and we ask the reader before spending their own
   * credits; with `mine`, the reader-paid story is written by writeMyStory
   * (not awaited: it runs about a minute while the story page fills in).
   */
  async function start(request: StoryAsk, mine: boolean) {
    setBusy(true)
    setError(null)
    const r = await runAction<{ storyId: string; paidBy?: string }>('startStory', { ...request, useMyCredits: mine })
    if (!r.success) {
      setBusy(false)
      if (r.code === OWNER_NOT_PAYING) {
        setAskToPay(request)
        return
      }
      setError(r.error)
      return
    }
    if (r.data.paidBy === 'reader') void runAction('writeMyStory', { storyId: r.data.storyId })
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
          Pick up to {MAX_INTERESTS}, or add your own.{' '}
          {count > 0 && (
            <span className="font-semibold text-foreground">
              {count} of {MAX_INTERESTS} picked
            </span>
          )}
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
          {customs.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed
              aria-label={`Remove ${c}`}
              onClick={() => setCustoms((cur) => cur.filter((x) => x !== c))}
              className="flex items-center gap-2 rounded-full border-2 border-coral bg-secondary px-4 py-2.5 text-[16px] font-semibold text-secondary-foreground"
            >
              <span aria-hidden className="text-xl leading-none">
                ✨
              </span>
              {c}
              <X className="h-4 w-4" aria-hidden />
            </button>
          ))}
        </div>

        <label htmlFor="custom-idea" className="mt-8 block text-[15px] font-semibold text-foreground">
          Or type your own idea
        </label>
        <div className="mt-2 flex max-w-xl gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              id="custom-idea"
              type="search"
              value={draft}
              disabled={full}
              maxLength={MAX_CUSTOM_INTEREST_LENGTH}
              onChange={(e) => {
                setError(null)
                setDraft(e.target.value)
              }}
              onKeyDown={(e) => {
                // Enter adds the idea as a chip; it must never submit the form.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  // Enter that confirms an IME composition (e.g. Japanese
                  // input) finishes the word; it does not add the idea yet.
                  if (e.nativeEvent.isComposing) return
                  addCustom()
                }
              }}
              placeholder={full ? `You picked ${MAX_INTERESTS}! Remove one to add more.` : 'volcanoes, my cat Pepper, baking cookies…'}
              className="h-14 w-full rounded-full border-2 border-input bg-card pl-12 pr-5 text-[17px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-primary disabled:opacity-60"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={addCustom}
            disabled={full || !draft.trim()}
            className="h-14 rounded-full border-2 px-5 text-[16px] font-semibold"
          >
            <Plus aria-hidden /> Add
          </Button>
        </div>
      </fieldset>

      {/* ── Step 3: main characters (optional) ───────────────────── */}
      <fieldset className="mt-12">
        <legend className="font-display text-xl font-semibold text-foreground">
          <StepDot n={3} /> Who's in the story? <span className="text-muted-foreground">(optional)</span>
        </legend>
        <p className="mt-1 text-[15px] text-muted-foreground">
          Add up to {MAX_CAST} main characters: you, a pet, a friend, anyone! The first one is the hero. Say what they
          look like, and the pictures will match.
        </p>
        <div className="mt-4 space-y-3">
          {cast.map((c, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2 rounded-2xl border-2 border-border bg-card p-3 sm:flex-nowrap">
              <input
                aria-label={`Character ${i + 1} name`}
                value={c.name}
                maxLength={MAX_CAST_NAME}
                onChange={(e) => setCast((cur) => cur.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                placeholder={i === 0 ? 'Name, e.g. Sage' : 'Name, e.g. Rosie'}
                className="h-12 w-full rounded-full border-2 border-input bg-background px-4 text-[16px] text-foreground outline-none focus:border-primary sm:w-44"
              />
              <input
                aria-label={`Character ${i + 1} description`}
                value={c.description}
                maxLength={MAX_CAST_DESCRIPTION}
                onChange={(e) =>
                  setCast((cur) => cur.map((x, k) => (k === i ? { ...x, description: e.target.value } : x)))
                }
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                placeholder={
                  i === 0 ? 'a 7 year old girl with long blonde hair and blue eyes' : 'a small white cat with black spots'
                }
                className="h-12 min-w-0 flex-1 rounded-full border-2 border-input bg-background px-4 text-[16px] text-foreground outline-none focus:border-primary"
              />
              <Button
                type="button"
                variant="ghost"
                aria-label={`Remove character ${i + 1}`}
                className="h-12 rounded-full"
                onClick={() => setCast((cur) => cur.filter((_, k) => k !== i))}
              >
                <X aria-hidden />
              </Button>
            </div>
          ))}
        </div>
        {cast.length < MAX_CAST && (
          <Button
            type="button"
            variant="outline"
            data-testid="add-character"
            className="mt-3 h-12 rounded-full border-2 px-5 text-[16px] font-semibold"
            onClick={() => setCast((cur) => [...cur, { name: '', description: '' }])}
          >
            <Plus aria-hidden /> Add a character
          </Button>
        )}
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
        {!OWNER_PAYS && (
          <p className="text-[15px] text-muted-foreground">
            Stories are made with your own DeepSpace credits (about 75 each). You'll be asked first.
          </p>
        )}
        {!grade && <p className="text-[15px] text-muted-foreground">First, pick how you read.</p>}
        {grade && !hasTopic && <p className="text-[15px] text-muted-foreground">Now pick something you like.</p>}
        {askToPay && (
          <div role="alertdialog" aria-label="Use your own credits?" className="w-full max-w-xl rounded-2xl border-2 border-coral bg-secondary p-5 text-secondary-foreground">
            <p className="font-display text-lg font-semibold">
              {OWNER_PAYS ? "StorySprout's free stories are used up for now." : 'Make this story with your DeepSpace credits?'}
            </p>
            <p className="mt-1 text-[15px]">
              A grown-up can make this story with your own DeepSpace credits ({READER_COST_ESTIMATE[askToPay.grade]}),
              with high-quality pictures. Nothing is spent unless you say yes.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                type="button"
                loading={busy}
                data-testid="use-my-credits"
                className="rounded-full px-6 font-semibold"
                onClick={() => start(askToPay, true).then(() => setAskToPay(null))}
              >
                Yes, use my credits
              </Button>
              <Button type="button" variant="ghost" className="rounded-full" onClick={() => setAskToPay(null)}>
                Not now
              </Button>
            </div>
          </div>
        )}
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
