/**
 * Phonics UI shared by the in-book checkpoint pages and (for stories made
 * before in-book phonics) the end quiz: see the word in sound-it-out chunks,
 * try saying it, answer, then hear Hope say it with the tip.
 */

import { useState } from 'react'
import { Loader2, Mic, Volume2 } from 'lucide-react'
import { useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PhonicsQuestion } from '@/story/catalog'
import { Choices } from './Choices'
import { hearWord } from './speech'

export function PhonicsWord({ q, compact }: { q: PhonicsQuestion; compact?: boolean }) {
  if (compact) {
    // In-page version: word, sound chunks and the say-it prompt on one row,
    // so a question fits under the page's picture and text.
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-muted/60 px-4 py-3">
        <span className="font-display text-3xl font-semibold tracking-wide text-foreground">{q.word}</span>
        <span className="flex flex-wrap gap-1.5" aria-label={`Sound it out: ${q.chunks.join(', ')}`}>
          {q.chunks.map((chunk, i) => (
            <span
              key={i}
              className={cn(
                'rounded-lg px-2 py-0.5 font-display text-lg font-semibold',
                i % 2 === 0 ? 'bg-secondary text-secondary-foreground' : 'bg-[#dcebf7] text-[#1f4d7a]',
              )}
            >
              {chunk}
            </span>
          ))}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-foreground">
          <Mic className="h-4 w-4 text-coral" aria-hidden />
          Say it out loud!
        </span>
      </div>
    )
  }
  return (
    <div className={cn('rounded-2xl bg-muted/60 text-center', compact ? 'p-4' : 'mt-5 p-5')}>
      <p className={cn('font-display font-semibold tracking-wide text-foreground', compact ? 'text-4xl' : 'text-5xl sm:text-6xl')}>
        {q.word}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2" aria-label={`Sound it out: ${q.chunks.join(', ')}`}>
        {q.chunks.map((chunk, i) => (
          <span
            key={i}
            className={cn(
              'rounded-xl px-3 py-1 font-display font-semibold',
              compact ? 'text-xl' : 'text-2xl',
              i % 2 === 0 ? 'bg-secondary text-secondary-foreground' : 'bg-[#dcebf7] text-[#1f4d7a]',
            )}
          >
            {chunk}
          </span>
        ))}
      </div>
      <p className="mt-3 inline-flex items-center gap-2 text-[16px] font-semibold text-foreground">
        <Mic className="h-5 w-5 text-coral" aria-hidden />
        Try saying it out loud first!
      </p>
    </div>
  )
}

/** A complete phonics question: word, prompt, choices, then tip + Hope's audio. */
export function PhonicsCard({
  q,
  picked,
  onPick,
  compact,
}: {
  q: PhonicsQuestion
  picked: number | null
  onPick: (i: number) => void
  compact?: boolean
}) {
  const right = picked !== null && picked === q.answerIndex
  return (
    <div>
      <PhonicsWord q={q} compact={compact} />
      <h3 className={cn('font-semibold text-foreground', compact ? 'mt-3 text-lg leading-snug' : 'mt-6 text-2xl')}>{q.prompt}</h3>
      <div className={compact ? 'mt-3' : 'mt-5'}>
        <Choices choices={q.choices} answerIndex={q.answerIndex} picked={picked} onPick={onPick} size={compact ? 'md' : 'lg'} />
      </div>
      {picked !== null && (
        <div
          // Answering can push the feedback below the fold: bring it into view.
          ref={(el) => {
            if (compact) el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          }}
          className={cn(
            'sprout-pop rounded-2xl',
            compact ? 'mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 p-3' : 'mt-4 space-y-3 p-4',
            right ? 'bg-primary/10' : 'bg-accent',
          )}
        >
          <p className={cn('font-display font-semibold text-foreground', compact ? 'text-base' : 'text-lg')}>
            {right ? 'Yes! You got it! 🎉' : compact ? 'Good try!' : 'Good try! Here is the answer.'}
          </p>
          <HearButton word={q.word} path={q.audioPath} big={!compact} />
          {q.tip && <p className={cn('text-foreground', compact ? 'basis-full text-[15px]' : 'text-[16px]')}>{q.tip}</p>}
        </div>
      )}
    </div>
  )
}

export function HearButton({ word, path, big }: { word: string; path?: string; big?: boolean }) {
  const { warning } = useToast()
  const [loading, setLoading] = useState(false)
  async function play() {
    setLoading(!path)
    try {
      await hearWord(word, path)
    } catch (err) {
      warning('Hmm!', err instanceof Error ? err.message : 'That word would not play.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <button
      type="button"
      onClick={play}
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-sky font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95',
        big ? 'px-6 py-3 text-lg' : 'px-4 py-2 text-[15px]',
      )}
    >
      {loading ? (
        <Loader2 className={cn(big ? 'h-6 w-6' : 'h-5 w-5', 'animate-spin')} aria-hidden />
      ) : (
        <Volume2 className={big ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden />
      )}
      Hear “{word}”
    </button>
  )
}
