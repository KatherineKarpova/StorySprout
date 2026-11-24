/**
 * The story as a book: two facing pages on wide screens, one on phones,
 * turned with the arrows (or ← →). Each page shows, top to bottom, its
 * picture panel (cropped from the story's grid sheet in Panel.tsx), its text,
 * and any phonics question attached to it, which must be answered before
 * turning on. Every word is tappable and Hope says it (see speech.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Volume2 } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { CheckpointQuestion } from '@/story/catalog'
import { buildPages, type Page } from '@/story/pages'
import type { Grid } from '@/story/panels'
import { Panel } from './Panel'
import { PhonicsCard } from './Phonics'
import { hearWord } from './speech'

/** Lowercase letters only, so "Rocket!" in the text matches the word "rocket". */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}'-]/gu, '')

export interface PracticeWord {
  word: string
  audioPath?: string
}

function useWide() {
  const query = '(min-width: 900px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

interface Props {
  title: string
  grade: number
  paragraphs: string[]
  /** The panel sheet, once painted, and its grid shape. */
  sheetPath?: string
  grid: Grid | null
  /** One alt text per panel, in story order; empty when the story has no panels. */
  panelAlts: string[]
  painting: boolean
  checkpoints: CheckpointQuestion[]
  /** Chosen answer per checkpoint, null while unanswered. */
  answers: (number | null)[]
  onAnswer: (checkpoint: number, choice: number) => void
  practiceWords: PracticeWord[]
  onFinish: () => void
}

export function Book(props: Props) {
  const { paragraphs, checkpoints, answers, panelAlts } = props
  const pages = useMemo(
    () => buildPages(paragraphs, checkpoints, panelAlts.length),
    [paragraphs, checkpoints, panelAlts.length],
  )
  const wide = useWide()
  const perView = wide ? 2 : 1
  const [start, setStart] = useState(0)
  const bookRef = useRef<HTMLDivElement>(null)
  // Keep spreads aligned when the screen width changes.
  const first = Math.min(Math.floor(start / perView) * perView, Math.max(0, pages.length - 1))
  const visible = pages.slice(first, first + perView)
  const blocked = visible.some((p) => p.kind === 'page' && p.questions.some((q) => answers[q] == null))
  const atEnd = first + perView >= pages.length

  const go = useCallback(
    (dir: 1 | -1) => {
      if (dir === 1 && (blocked || atEnd)) return
      setStart(Math.max(0, first + dir * perView))
      // A long page may have been scrolled down to its question: bring the
      // top of the next page back into view.
      bookRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    },
    [blocked, atEnd, first, perView],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  return (
    <div>

      <div className="flex items-center gap-2 sm:gap-4">
        <Arrow dir="prev" disabled={first === 0} onClick={() => go(-1)} />

        <div
          className={cn(
            'relative grid flex-1 overflow-hidden rounded-[1.75rem] border-2 border-border bg-card shadow-[0_18px_40px_-18px_rgba(90,60,20,0.35)]',
            perView === 2 ? 'grid-cols-2' : 'grid-cols-1',
          )}
          data-testid="book"
          ref={bookRef}
        >
          {perView === 2 && (
            // The spine: a soft fold shadow down the middle.
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-1/2 w-10 -translate-x-1/2 bg-[linear-gradient(90deg,transparent,rgba(90,60,20,0.10),transparent)]"
            />
          )}
          {visible.map((page, k) => (
            <div
              key={first + k}
              className={cn(
                'sprout-pop flex min-h-[26rem] flex-col p-5 sm:p-7',
                perView === 2 && k === 0 && 'border-r border-border/60',
              )}
            >
              <div className="flex-1">
                <PageBody page={page} {...props} />
              </div>
              <p className="mt-4 text-center text-sm font-semibold text-muted-foreground">{first + k + 1}</p>
            </div>
          ))}
          {visible.length < perView && <div className="min-h-[26rem]" aria-hidden />}
        </div>

        <Arrow dir="next" disabled={blocked || atEnd} onClick={() => go(1)} />
      </div>

      <p className="mt-3 h-6 text-center text-[15px] font-semibold text-coral" aria-live="polite">
        {blocked ? 'Answer the question to keep reading!' : ''}
      </p>
      <p className="mt-2 text-center text-[15px] text-muted-foreground">
        Tap any word to hear Hope say it. Practice words are{' '}
        <span className="rounded-md bg-accent px-1.5 font-semibold text-accent-foreground underline decoration-coral decoration-2 underline-offset-4">
          marked like this
        </span>
        .
      </p>
    </div>
  )
}

function Arrow({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Previous page' : 'Next page'}
      data-testid={`page-${dir}`}
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none sm:h-16 sm:w-16"
    >
      <Icon className="h-7 w-7 sm:h-9 sm:w-9" aria-hidden />
    </button>
  )
}

function PageBody({ page, ...p }: { page: Page } & Props) {
  if (page.kind === 'page') {
    return (
      <div className="flex h-full flex-col">
        {page.panel !== undefined && p.grid && (
          <Panel
            src={p.sheetPath}
            grid={p.grid}
            index={page.panel}
            alt={p.panelAlts[page.panel] ?? ''}
            painting={p.painting}
            className={cn(
              'sprout-pop mx-auto mb-4 aspect-square w-full shrink-0 rounded-2xl shadow-[0_8px_24px_-12px_rgba(90,60,20,0.4)]',
              // A page with a question gets a smaller picture so it all fits.
              page.questions.length ? 'max-w-[8.5rem]' : 'max-w-[12rem]',
            )}
          />
        )}
        <TextPage paragraphs={[page.text]} grade={p.grade} practiceWords={p.practiceWords} />
        {page.questions.map((q) => (
          <div key={q} className="mt-4 border-t-2 border-dashed border-border pt-4">
            <p className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-coral">
              Say it!{p.answers[q] == null && <span className="ml-2 normal-case tracking-normal text-muted-foreground">Answer to turn the page</span>}
            </p>
            <PhonicsCard
              q={p.checkpoints[q]}
              picked={p.answers[q] ?? null}
              onPick={(i) => p.onAnswer(q, i)}
              compact
            />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <p className="font-display text-5xl font-semibold text-primary">The End</p>
      <p className="mt-3 text-lg text-muted-foreground">Great reading! Ready for 3 questions about the story?</p>
      <Button size="lg" className="mt-6 h-14 rounded-full px-8 text-lg font-semibold" onClick={p.onFinish} data-testid="start-quiz">
        Let's go!
      </Button>
    </div>
  )
}

function TextPage({ paragraphs, grade, practiceWords }: { paragraphs: string[]; grade: number; practiceWords: PracticeWord[] }) {
  const { warning } = useToast()
  const [active, setActive] = useState<{ key: string; loading: boolean } | null>(null)
  const practice = useMemo(() => new Map(practiceWords.map((w) => [norm(w.word), w])), [practiceWords])

  async function tap(key: string, token: string) {
    const word = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    if (!word) return
    const pw = practice.get(norm(word))
    setActive({ key, loading: !pw?.audioPath })
    try {
      await hearWord(word, pw?.audioPath)
    } catch (err) {
      warning('Hmm!', err instanceof Error ? err.message : 'That word would not play.')
    } finally {
      setActive((a) => (a?.key === key ? null : a))
    }
  }

  const textSize =
    grade === 1 ? 'text-[23px] leading-[1.75]' : grade === 2 ? 'text-[20px] leading-[1.7]' : 'text-[18px] leading-[1.7]'

  return (
    <div className="space-y-5">
      {paragraphs.map((para, i) => (
        <p key={i} className={cn(textSize, 'text-foreground')}>
          {para.split(/(\s+)/).map((tok, j) => {
            if (/^\s*$/.test(tok)) return tok
            const key = `${i}-${j}`
            const isPractice = practice.has(norm(tok))
            const on = active?.key === key
            return (
              <span
                key={j}
                role="button"
                tabIndex={0}
                aria-label={`Hear ${tok.replace(/[^\p{L}'-]/gu, '')}`}
                onClick={() => tap(key, tok)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    tap(key, tok)
                  }
                }}
                className={cn(
                  'cursor-pointer rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isPractice
                    ? 'bg-accent px-0.5 font-semibold text-accent-foreground underline decoration-coral decoration-2 underline-offset-4 hover:bg-[#ffe6a0]'
                    : 'hover:bg-accent',
                  on && 'bg-primary text-primary-foreground decoration-primary-foreground hover:bg-primary',
                )}
              >
                {tok}
                {on && active.loading && <Loader2 className="ml-0.5 inline h-4 w-4 animate-spin align-middle" aria-hidden />}
                {on && !active.loading && <Volume2 className="ml-0.5 inline h-4 w-4 align-middle" aria-hidden />}
              </span>
            )
          })}
        </p>
      ))}
    </div>
  )
}
