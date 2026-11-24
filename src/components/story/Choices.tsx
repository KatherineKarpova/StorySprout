/** Multiple-choice answers with right/wrong feedback, shared by every question. */

import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  choices: string[]
  answerIndex: number
  /** Chosen index, or null while unanswered. */
  picked: number | null
  onPick: (index: number) => void
  size?: 'md' | 'lg'
}

export function Choices({ choices, answerIndex, picked, onPick, size = 'lg' }: Props) {
  const answered = picked !== null
  return (
    // Compact (in-book phonics, short answers): side by side on wider pages.
    <div className={cn('grid', size === 'md' ? 'gap-2 sm:grid-cols-3' : 'gap-3')}>
      {choices.map((choice, i) => {
        const isAnswer = i === answerIndex
        const isPicked = i === picked
        return (
          <button
            key={i}
            type="button"
            disabled={answered}
            onClick={() => onPick(i)}
            className={cn(
              'flex items-center gap-3 rounded-2xl border-2 text-left font-semibold transition-all',
              size === 'lg' ? 'px-5 py-4 text-[19px]' : 'px-3 py-2.5 text-[16px]',
              !answered && 'border-border bg-background hover:border-primary hover:bg-accent/40',
              answered && isAnswer && 'border-primary bg-primary/10 text-foreground',
              answered && isPicked && !isAnswer && 'border-coral bg-secondary text-secondary-foreground',
              answered && !isAnswer && !isPicked && 'border-border bg-background opacity-50',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm',
                answered && isAnswer ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
              aria-hidden
            >
              {answered && isAnswer ? (
                <Check className="h-4 w-4" />
              ) : answered && isPicked ? (
                <X className="h-4 w-4" />
              ) : (
                String.fromCharCode(65 + i)
              )}
            </span>
            {choice}
          </button>
        )
      })}
    </div>
  )
}
