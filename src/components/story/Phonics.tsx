/**
 * Pronunciation questions in the end-of-story quiz: see the word in
 * sound-it-out chunks and hear Hope say it, answer a question about how it
 * sounds (rhymes, matching sounds), then read the tip.
 */

import { useState } from 'react'
import { Loader2, Mic, Volume2 } from 'lucide-react'
import { useToast } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PhonicsQuestion } from '@/story/catalog'
import { Choices } from './Choices'
import { hearWord } from './speech'

function PhonicsWord({ q }: { q: PhonicsQuestion }) {
  return (
    <div className="rounded-2xl bg-muted/60 p-5 text-center">
      <p className="font-display text-5xl font-semibold tracking-wide text-foreground sm:text-6xl">{q.word}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2" aria-label={`Sound it out: ${q.chunks.join(', ')}`}>
        {q.chunks.map((chunk, i) => (
          <span
            key={i}
            className={cn(
              'rounded-xl px-3 py-1 font-display text-2xl font-semibold',
              i % 2 === 0 ? 'bg-secondary text-secondary-foreground' : 'bg-[#dcebf7] text-[#1f4d7a]',
            )}
          >
            {chunk}
          </span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <span className="inline-flex items-center gap-2 text-[16px] font-semibold text-foreground">
          <Mic className="h-5 w-5 text-coral" aria-hidden />
          Say it out loud, then listen!
        </span>
        <HearButton word={q.word} path={q.audioPath} />
      </div>
    </div>
  )
}

/** A complete pronunciation question: word + audio, prompt, choices, then the tip. */
export function PhonicsCard({
  q,
  picked,
  onPick,
}: {
  q: PhonicsQuestion
  picked: number | null
  onPick: (i: number) => void
}) {
  const right = picked !== null && picked === q.answerIndex
  return (
    <div>
      <PhonicsWord q={q} />
      <h3 className="mt-6 text-2xl font-semibold text-foreground">{q.prompt}</h3>
      <div className="mt-5">
        <Choices choices={q.choices} answerIndex={q.answerIndex} picked={picked} onPick={onPick} />
      </div>
      {picked !== null && (
        <div className={cn('sprout-pop mt-4 space-y-2 rounded-2xl p-4', right ? 'bg-primary/10' : 'bg-accent')}>
          <p className="font-display text-lg font-semibold text-foreground">
            {right ? 'Yes! You got it! 🎉' : 'Good try! Here is the answer.'}
          </p>
          {q.tip && <p className="text-[16px] text-foreground">{q.tip}</p>}
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
