/**
 * The choose-your-own-adventure book. Every node of the story tree is two
 * pages, each exactly half picture (top) and half text (bottom); wide screens
 * show a node's two pages as one spread, phones one page at a time. After a
 * node that is not an ending comes a choice ("What should Mia do next?") with
 * two options, each previewing the first picture of where it leads; the
 * child's pick decides which node comes next. An ending leads to "The End".
 * Every word is tappable and Hope says it (see speech.ts).
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Volume2 } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { StoryRecord } from '@/story/catalog'
import { gridFor } from '@/story/panels'
import { childrenOf, endPanel, isEnding, pathFor } from '@/story/tree'
import { Panel } from './Panel'
import { hearWord } from './speech'

type Unit =
  | { kind: 'pages'; node: number; pages: (0 | 1)[] }
  | { kind: 'choice'; node: number; depth: number }
  | { kind: 'end'; node: number }

/** The reading order for the branch chosen so far. */
function buildUnits(nodeCount: number, choices: number[], twoUp: boolean): Unit[] {
  const units: Unit[] = []
  pathFor(choices, nodeCount).forEach((node, depth) => {
    if (twoUp) units.push({ kind: 'pages', node, pages: [0, 1] })
    else units.push({ kind: 'pages', node, pages: [0] }, { kind: 'pages', node, pages: [1] })
    units.push(isEnding(node, nodeCount) ? { kind: 'end', node } : { kind: 'choice', node, depth })
  })
  return units
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

/** Lowercase letters only, so "Rocket!" in the text matches the word "rocket". */
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}'-]/gu, '')

interface Props {
  story: StoryRecord
  /** Option picked at each choice so far (0 or 1), root first. */
  choices: number[]
  onChoose: (depth: number, option: 0 | 1) => void
  onFinish: () => void
}

/** A page is 2:3; its picture half is therefore 4:3. */
const PICTURE_ASPECT = 4 / 3

export function Book({ story, choices, onChoose, onFinish }: Props) {
  const nodes = useMemo(() => story.nodes ?? [], [story.nodes])
  const wide = useWide()
  const units = useMemo(() => buildUnits(nodes.length, choices, wide), [nodes.length, choices, wide])
  const [at, setAt] = useState(0)
  const index = Math.min(at, units.length - 1)
  const unit = units[index]
  const bookRef = useRef<HTMLDivElement>(null)
  // Where the book starts on the page (below the nav, title, any banner), so
  // a spread can take exactly the rest of the window's height.
  const rowRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(240)
  useLayoutEffect(() => {
    const measure = () => {
      const el = rowRef.current
      if (el) setTop(Math.round(el.getBoundingClientRect().top + window.scrollY))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Switching between one- and two-page views keeps the reader on the same node.
  const lastWide = useRef(wide)
  useEffect(() => {
    if (lastWide.current === wide) return
    const old = buildUnits(nodes.length, choices, lastWide.current)[index]
    lastWide.current = wide
    const found = units.findIndex((u) => u.kind === old?.kind && u.node === old?.node)
    setAt(Math.max(0, found))
    // Only on a width change; `index` is read as it was before the switch.
  }, [wide])

  const blocked = unit?.kind === 'choice' && choices.length <= unit.depth
  const atEnd = index >= units.length - 1
  const go = useCallback(
    (dir: 1 | -1) => {
      if (dir === 1 && (blocked || atEnd)) return
      setAt(Math.max(0, index + dir))
      bookRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    },
    [blocked, atEnd, index],
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

  const path = useMemo(() => pathFor(choices, nodes.length), [choices, nodes.length])
  const practice = useMemo(
    () => new Map(path.map((i) => [norm(nodes[i]?.phonics.word ?? ''), nodes[i]?.phonics])),
    [path, nodes],
  )

  if (!unit) return null
  const grid = gridFor(story.imageLayout)
  const sheet = grid ? story.imagePaths?.[0] || undefined : undefined
  const painting = story.status === 'illustrating'
  // Wide: the spread is as big as the screen allows: as tall as the window
  // minus the header, and no wider than the window minus the arrows (a
  // spread is 4/3 of a page's height wide). Phone: a page fills the width.
  // Either way a page is 2:3, so its picture half is 4:3.
  const pageStyle: React.CSSProperties = wide
    ? { height: `min(calc(100vh - ${top}px - 1.5rem), calc((100vw - 12rem) * 0.75))`, aspectRatio: '2 / 3' }
    : { width: '100%', aspectRatio: '2 / 3' }
  const wideStyle: React.CSSProperties = wide ? { ...pageStyle, aspectRatio: '4 / 3' } : pageStyle

  return (
    <div>
      <div ref={rowRef} className="flex items-center justify-center gap-4">
        {/* Phones put the arrows under the book so a page gets the full width. */}
        {wide && <Arrow dir="prev" disabled={index === 0} onClick={() => go(-1)} />}

        <div
          ref={bookRef}
          key={index}
          data-testid="book"
          className={cn(
            'sprout-pop relative flex overflow-hidden rounded-[1.75rem] border-2 border-border bg-card shadow-[0_18px_40px_-18px_rgba(90,60,20,0.35)]',
            !wide && 'min-w-0 flex-1',
          )}
        >
          {unit.kind === 'pages' &&
            unit.pages.map((page, k) => {
              const p = nodes[unit.node].pages[page]
              return (
                <div
                  key={page}
                  style={pageStyle}
                  className={cn('flex flex-col', unit.pages.length === 2 && k === 0 && 'border-r border-border/60')}
                >
                  {grid ? (
                    <Panel
                      src={sheet}
                      grid={grid}
                      index={p.panel}
                      aspect={PICTURE_ASPECT}
                      alt={story.imageAlts?.[p.panel] ?? ''}
                      painting={painting}
                      className="h-1/2 w-full shrink-0 bg-muted"
                    />
                  ) : (
                    <div className="h-1/2 w-full shrink-0 bg-muted" aria-hidden />
                  )}
                  <PageText text={p.text} grade={story.grade} practice={practice} />
                  <p className="pb-2 text-center text-xs font-semibold text-muted-foreground">
                    {path.indexOf(unit.node) * 2 + page + 1}
                  </p>
                </div>
              )
            })}

          {unit.kind === 'choice' && (
            <ChoiceSpread
              story={story}
              node={unit.node}
              picked={choices[unit.depth]}
              wide={wide}
              style={wideStyle}
              onPick={(option) => {
                onChoose(unit.depth, option)
                setAt(index + 1)
              }}
            />
          )}

          {unit.kind === 'end' && (
            <EndSpread
              story={story}
              style={wideStyle}
              onQuiz={onFinish}
              onOtherPath={() => {
                // Back to the last choice, so the child can pick the other option.
                const last = units.map((u) => u.kind).lastIndexOf('choice')
                if (last >= 0) setAt(last)
              }}
            />
          )}
        </div>

        {wide && <Arrow dir="next" disabled={blocked || atEnd} onClick={() => go(1)} />}
      </div>
      {!wide && (
        <div className="mt-3 flex items-center justify-center gap-6">
          <Arrow dir="prev" disabled={index === 0} onClick={() => go(-1)} />
          <Arrow dir="next" disabled={blocked || atEnd} onClick={() => go(1)} />
        </div>
      )}
      <p className="mt-3 h-6 text-center text-[15px] font-semibold text-coral" aria-live="polite">
        {blocked ? 'Pick what happens next!' : ''}
      </p>
      <p className="mt-1 text-center text-[15px] text-muted-foreground">
        Tap any word to hear Hope say it. Tricky words are{' '}
        <span className="rounded-md bg-accent px-1.5 font-semibold text-accent-foreground underline decoration-coral decoration-2 underline-offset-4">
          marked like this
        </span>
        .
      </p>
    </div>
  )
}

function ChoiceSpread({
  story,
  node,
  picked,
  wide,
  style,
  onPick,
}: {
  story: StoryRecord
  node: number
  picked?: number
  wide: boolean
  style: React.CSSProperties
  onPick: (option: 0 | 1) => void
}) {
  const choice = story.nodes[node].choice
  const grid = gridFor(story.imageLayout)
  const sheet = grid ? story.imagePaths?.[0] || undefined : undefined
  if (!choice) return null
  return (
    <div style={style} className="flex flex-col items-center justify-center gap-5 p-5 sm:p-10" data-testid="choice">
      <p className="font-display text-sm font-semibold uppercase tracking-wider text-coral">You choose!</p>
      <h2 className="text-center text-2xl font-semibold text-foreground sm:text-3xl">{choice.prompt}</h2>
      <div className={cn('grid w-full gap-4', wide ? 'grid-cols-2' : 'grid-cols-1')}>
        {choice.options.map((label, o) => {
          const next = story.nodes[childrenOf(node)[o]]
          const on = picked === o
          return (
            <button
              key={o}
              type="button"
              onClick={() => onPick(o as 0 | 1)}
              aria-pressed={on}
              className={cn(
                'overflow-hidden rounded-2xl border-4 bg-background text-left transition-all hover:-translate-y-0.5',
                on ? 'border-primary shadow-[0_0_0_4px_rgba(47,125,79,0.15)]' : 'border-border hover:border-primary/60',
              )}
            >
              {grid && next && (
                <Panel
                  src={sheet}
                  grid={grid}
                  index={next.pages[0].panel}
                  aspect={wide ? 16 / 9 : 16 / 7}
                  alt=""
                  painting={story.status === 'illustrating'}
                  className={cn('w-full bg-muted', wide ? 'aspect-video' : 'aspect-[16/7]')}
                />
              )}
              <span className="flex items-center gap-3 p-4">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold',
                    on ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {o + 1}
                </span>
                <span className="text-[18px] font-semibold leading-snug text-foreground">{label}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function EndSpread({
  story,
  style,
  onQuiz,
  onOtherPath,
}: {
  story: StoryRecord
  style: React.CSSProperties
  onQuiz: () => void
  onOtherPath: () => void
}) {
  const grid = gridFor(story.imageLayout)
  const sheet = grid ? story.imagePaths?.[0] || undefined : undefined
  const picture = endPanel(story.imageLayout)
  return (
    <div style={style} className="flex flex-col items-center justify-center gap-4 p-6 text-center sm:p-10">
      {grid && picture !== undefined && (
        <Panel
          src={sheet}
          grid={grid}
          index={picture}
          alt={story.imageAlts?.[picture] ?? ''}
          className="aspect-square w-full max-w-[min(24rem,40%)] rounded-2xl shadow-[0_8px_24px_-12px_rgba(90,60,20,0.4)]"
        />
      )}
      <p className="font-display text-5xl font-semibold text-primary">The End</p>
      <p className="text-lg text-muted-foreground">Great reading! Ready for 5 questions about your story?</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button size="lg" className="h-14 rounded-full px-8 text-lg font-semibold" onClick={onQuiz} data-testid="start-quiz">
          Let's go!
        </Button>
        <Button variant="outline" size="lg" className="h-14 rounded-full px-6 text-[16px] font-semibold" onClick={onOtherPath}>
          <RotateCcw aria-hidden /> Try the other path
        </Button>
      </div>
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
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-all hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none sm:h-16 sm:w-16"
    >
      <Icon className="h-6 w-6 sm:h-9 sm:w-9" aria-hidden />
    </button>
  )
}

/**
 * Type size per grade for a ~400px-wide page; bigger pages start bigger (up
 * to 2.2×) so the text half stays filled, then shrink until the text fits.
 */
const TEXT_PX: Record<number, number> = { 1: 24, 2: 21, 3: 19 }
const BASE_PAGE_WIDTH = 400
const MAX_TEXT_SCALE = 2.2
const MIN_TEXT_PX = 14

/**
 * The bottom half of a page. The writer aims for what fits, but word counts
 * are not exact, so the type steps down a pixel at a time (re-measured on
 * resize) until the text fits without scrolling.
 */
function PageText({
  text,
  grade,
  practice,
}: {
  text: string
  grade: number
  practice: Map<string, { word: string; audioPath?: string } | undefined>
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [px, setPx] = useState(TEXT_PX[grade] ?? 20)
  const { warning } = useToast()
  const [active, setActive] = useState<{ key: string; loading: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const fit = () => {
      const scale = Math.min(MAX_TEXT_SCALE, Math.max(1, el.clientWidth / BASE_PAGE_WIDTH))
      let size = Math.round((TEXT_PX[grade] ?? 20) * scale)
      el.style.fontSize = `${size}px`
      while (el.scrollHeight > el.clientHeight + 1 && size > MIN_TEXT_PX) {
        size -= 1
        el.style.fontSize = `${size}px`
      }
      setPx(size)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [text, grade])

  async function tap(key: string, token: string) {
    const word = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
    if (!word) return
    // The shared word cache first (one word, English-only voice): older
    // stories recorded their own phonics clips with a model that
    // mispronounced lone names (e.g. "Sage"). The story's clip is the
    // fallback, e.g. for a signed-out visitor on the public sample.
    const pw = practice.get(norm(word))
    setActive({ key, loading: true })
    try {
      await hearWord(word).catch((err) => (pw?.audioPath ? hearWord(word, pw.audioPath) : Promise.reject(err)))
    } catch (err) {
      warning('Hmm!', err instanceof Error ? err.message : 'That word would not play.')
    } finally {
      setActive((a) => (a?.key === key ? null : a))
    }
  }

  return (
    <div
      ref={boxRef}
      className="min-h-0 flex-1 overflow-hidden px-5 pt-4 sm:px-7"
      style={{ fontSize: `${px}px`, lineHeight: 1.6 }}
    >
      <p className="text-foreground">
        {text.split(/(\s+)/).map((tok, j) => {
          if (/^\s*$/.test(tok)) return tok
          const key = String(j)
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
    </div>
  )
}
