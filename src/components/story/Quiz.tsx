/**
 * End-of-story quiz: three reading comprehension questions, one at a time
 * (the phonics questions come earlier, as pages inside the Book). Answer →
 * see why, pointing back at the story. The finished attempt, in-book phonics
 * answers included, is saved to `quiz_attempts` with the reader's own RBAC.
 * Stories made before in-book phonics may still carry a phonics question
 * here; it renders with the shared PhonicsCard.
 */

import { useState } from 'react'
import { useMutations } from 'deepspace'
import { RotateCcw, Star } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { Question, QuizAttemptRecord, SoundWord } from '@/story/catalog'
import { Choices } from './Choices'
import { HearButton, PhonicsCard } from './Phonics'

interface Props {
  storyId: string
  questions: Question[]
  soundWords: SoundWord[]
  /** Answers already given to the in-book phonics checkpoints. */
  checkpointAnswers: number[]
  checkpointCorrect: number
  newStoryHref: string
  /** False for the public demo: a signed-out visitor has nowhere to save a score. */
  saveAttempt?: boolean
}

export function Quiz({
  storyId,
  questions,
  soundWords,
  checkpointAnswers,
  checkpointCorrect,
  newStoryHref,
  saveAttempt = true,
}: Props) {
  const { create, ready } = useMutations<QuizAttemptRecord>('quiz_attempts')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [saved, setSaved] = useState(false)

  const done = step >= questions.length
  const endCorrect = answers.filter((a, i) => a === questions[i]?.answerIndex).length
  const correct = endCorrect + checkpointCorrect
  const total = questions.length + checkpointAnswers.length

  function choose(i: number) {
    if (answers[step] !== null) return
    setAnswers((cur) => cur.map((a, k) => (k === step ? i : a)))
  }

  function next() {
    const nextStep = step + 1
    setStep(nextStep)
    if (saveAttempt && nextStep >= questions.length && !saved && ready) {
      setSaved(true)
      create({ storyId, answers: [...checkpointAnswers, ...answers.map((a) => a ?? -1)], correct, total })
    }
  }

  function restart() {
    setAnswers(questions.map(() => null))
    setSaved(false)
    setStep(0)
  }

  if (done) {
    return (
      <section className="sprout-pop rounded-3xl border-2 border-border bg-card p-6 text-center sm:p-10" data-testid="quiz-done">
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
        {soundWords.length > 0 && <SoundWords words={soundWords} />}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="outline" size="lg" className="rounded-full" onClick={restart}>
            <RotateCcw aria-hidden /> Try the last questions again
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

function SoundWords({ words }: { words: SoundWord[] }) {
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-2xl bg-muted/60 p-5">
      <p className="font-display text-lg font-semibold text-foreground">More words to practice</p>
      <ul className="mt-3 space-y-2.5">
        {words.map((w) => (
          <li key={w.word} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-2xl font-semibold text-foreground">{w.chunks.join(' · ')}</span>
            <HearButton word={w.word} path={w.audioPath} />
          </li>
        ))}
      </ul>
    </div>
  )
}
