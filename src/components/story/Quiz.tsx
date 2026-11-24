/**
 * End-of-story quiz, one question at a time: three reading comprehension
 * questions about the branch the child read, then two pronunciation
 * questions (hear the word first, answer, then the tip). The finished
 * attempt, with the branch, is saved to `quiz_attempts` with the reader's
 * own RBAC, by <SaveAttempt>, which is only mounted when there is a score to
 * save: the public demo's signed-out visitor has no records scope, so even
 * calling useMutations there throws.
 */

import { useEffect, useRef, useState } from 'react'
import { useMutations } from 'deepspace'
import { RotateCcw, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Question, QuizAttemptRecord } from '@/story/catalog'
import { Choices } from './Choices'
import { PhonicsCard } from './Phonics'

interface Props {
  storyId: string
  /** Node indices of the branch the child read. */
  path: number[]
  questions: Question[]
  newStoryHref: string
  /** False for the public demo: a signed-out visitor has nowhere to save a score. */
  saveAttempt?: boolean
}

export function Quiz({ storyId, path, questions, newStoryHref, saveAttempt = true }: Props) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  // Bumped by "try again", so each finished round saves its own attempt.
  const [round, setRound] = useState(0)

  const done = step >= questions.length
  const correct = answers.filter((a, i) => a === questions[i]?.answerIndex).length
  const total = questions.length

  function choose(i: number) {
    if (answers[step] !== null) return
    setAnswers((cur) => cur.map((a, k) => (k === step ? i : a)))
  }

  function next() {
    setStep(step + 1)
  }

  function restart() {
    setAnswers(questions.map(() => null))
    setRound((r) => r + 1)
    setStep(0)
  }

  if (done) {
    return (
      <section className="sprout-pop rounded-3xl border-2 border-border bg-card p-6 text-center sm:p-10" data-testid="quiz-done">
        {saveAttempt && (
          <SaveAttempt
            key={round}
            attempt={{ storyId, path, answers: answers.map((a) => a ?? -1), correct, total }}
          />
        )}
        <div className="flex flex-wrap justify-center gap-1.5" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <Star key={i} className={cn('h-10 w-10', i < correct ? 'fill-[#f5b301] text-[#f5b301]' : 'text-border')} />
          ))}
        </div>
        <h2 className="mt-4 text-3xl font-semibold text-foreground">
          {correct === total ? 'You got them all!' : correct > 0 ? 'Great reading!' : 'Good try!'}
        </h2>
        <p className="mt-2 text-lg text-muted-foreground">
          {correct} out of {total} right.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="outline" size="lg" className="rounded-full" onClick={restart}>
            <RotateCcw aria-hidden /> Try the questions again
          </Button>
          <Link
            to={newStoryHref}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Make a new story
          </Link>
        </div>
      </section>
    )
  }

  const q = questions[step]
  const picked = answers[step]
  const right = picked !== null && picked === q.answerIndex

  return (
    <section className="rounded-3xl border-2 border-border bg-card p-6 sm:p-8" aria-live="polite" data-testid="quiz">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {q.kind === 'phonics' ? 'Say it!' : 'What happened?'} · {step + 1} of {questions.length}
        </span>
        <div className="flex gap-1.5" aria-hidden>
          {questions.map((_, i) => (
            <span key={i} className={cn('h-2.5 w-8 rounded-full', i < step ? 'bg-primary' : i === step ? 'bg-coral' : 'bg-muted')} />
          ))}
        </div>
      </div>

      {q.kind === 'phonics' ? (
        <div className="mt-5">
          <PhonicsCard q={q} picked={picked} onPick={choose} />
        </div>
      ) : (
        <>
          <h3 className="mt-6 text-2xl font-semibold text-foreground">{q.prompt}</h3>
          <div className="mt-5">
            <Choices choices={q.choices} answerIndex={q.answerIndex} picked={picked} onPick={choose} />
          </div>
          {picked !== null && (
            <div className={cn('sprout-pop mt-5 rounded-2xl p-5', right ? 'bg-primary/10' : 'bg-accent')}>
              <p className="font-display text-xl font-semibold text-foreground">
                {right ? 'Yes! You got it! 🎉' : 'Nice try! Here is the answer.'}
              </p>
              {q.explanation && <p className="mt-1.5 text-[17px] text-foreground">{q.explanation}</p>}
            </div>
          )}
        </>
      )}
      {picked !== null && (
        <Button size="lg" className="mt-4 rounded-full px-8 font-semibold" onClick={next} data-testid="quiz-next">
          {step + 1 < questions.length ? 'Next question' : 'See my stars'}
        </Button>
      )}
    </section>
  )
}

/**
 * Saves one finished quiz, once, as soon as the records connection can take
 * writes (a write before `ready` would be rejected client-side).
 */
function SaveAttempt({ attempt }: { attempt: QuizAttemptRecord }) {
  const { create, ready } = useMutations<QuizAttemptRecord>('quiz_attempts')
  const saved = useRef(false)
  useEffect(() => {
    if (!ready || saved.current) return
    saved.current = true
    create(attempt)
  }, [ready, create, attempt])
  return null
}
