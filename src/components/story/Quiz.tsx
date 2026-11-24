/**
 * After-story quiz, one question at a time.
 *
 * Phonics question: see the word in chunks → try saying it out loud → answer
 * → hear the recorded word and the tip. Comprehension questions: answer → see
 * why, pointing back at the story. A finished quiz is saved to
 * `quiz_attempts` with the reader's own RBAC (no server action needed).
 */

import { useState } from 'react'
import { useMutations } from 'deepspace'
import { Check, Mic, RotateCcw, Star, Volume2, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { PhonicsQuestion, Question, QuizAttemptRecord, SoundWord } from '@/story/catalog'
import { playClip, speak } from './speech'

interface Props {
  storyId: string
  questions: Question[]
  soundWords: SoundWord[]
  audioPending: boolean
  newStoryHref: string
}

export function Quiz({ storyId, questions, soundWords, audioPending, newStoryHref }: Props) {
  const { create, ready } = useMutations<QuizAttemptRecord>('quiz_attempts')
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(() => questions.map(() => null))
  const [saved, setSaved] = useState(false)

  const done = step >= questions.length
  const correct = answers.filter((a, i) => a === questions[i]?.answerIndex).length

  function choose(i: number) {
    if (answers[step] !== null) return
    setAnswers((cur) => cur.map((a, k) => (k === step ? i : a)))
  }

  function next() {
    const nextStep = step + 1
    setStep(nextStep)
    if (nextStep >= questions.length && !saved && ready) {
      setSaved(true)
      const final = answers.map((a) => a ?? -1)
      create({
        storyId,
        answers: final,
        correct: final.filter((a, i) => a === questions[i].answerIndex).length,
        total: questions.length,
      })
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
        <div className="flex justify-center gap-2" aria-hidden>
          {questions.map((_, i) => (
            <Star
              key={i}
              className={cn('h-12 w-12', i < correct ? 'fill-[#f5b301] text-[#f5b301]' : 'text-border')}
            />
          ))}
        </div>
        <h2 className="mt-4 text-3xl font-semibold text-foreground">
          {correct === questions.length ? 'You got them all!' : correct > 0 ? 'Great reading!' : 'Good try!'}
        </h2>
        <p className="mt-2 text-lg text-muted-foreground">
          {correct} out of {questions.length} right.
        </p>
        {soundWords.length > 0 && <SoundWords words={soundWords} pending={audioPending} />}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button variant="outline" size="lg" className="rounded-full" onClick={restart}>
            <RotateCcw aria-hidden /> Try again
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
  const answered = picked !== null
  const right = answered && picked === q.answerIndex

  return (
    <section className="rounded-3xl border-2 border-border bg-card p-6 sm:p-8" aria-live="polite" data-testid="quiz">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {q.kind === 'phonics' ? 'Say it!' : 'Think about it'} · {step + 1} of {questions.length}
        </span>
        <div className="flex gap-1.5" aria-hidden>
          {questions.map((_, i) => (
            <span key={i} className={cn('h-2.5 w-8 rounded-full', i < step ? 'bg-primary' : i === step ? 'bg-coral' : 'bg-muted')} />
          ))}
        </div>
      </div>

      {q.kind === 'phonics' && <PhonicsWord q={q} />}

      <h3 className="mt-6 text-2xl font-semibold text-foreground">{q.prompt}</h3>

      <div className="mt-5 grid gap-3">
        {q.choices.map((choice, i) => {
          const isAnswer = i === q.answerIndex
          const isPicked = i === picked
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => choose(i)}
              className={cn(
                'flex items-center gap-3 rounded-2xl border-2 px-5 py-4 text-left text-[19px] font-semibold transition-all',
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
                {answered && isAnswer ? <Check className="h-4 w-4" /> : answered && isPicked ? <X className="h-4 w-4" /> : String.fromCharCode(65 + i)}
              </span>
              {choice}
            </button>
          )
        })}
      </div>

      {answered && (
        <div className={cn('sprout-pop mt-5 rounded-2xl p-5', right ? 'bg-primary/10' : 'bg-accent')}>
          <p className="font-display text-xl font-semibold text-foreground">
            {right ? 'Yes! You got it! 🎉' : 'Nice try! Here is the answer.'}
          </p>
          {q.kind === 'phonics' ? (
            <PhonicsReveal q={q} />
          ) : (
            q.explanation && <p className="mt-1.5 text-[17px] text-foreground">{q.explanation}</p>
          )}
          <Button size="lg" className="mt-4 rounded-full px-8 font-semibold" onClick={next} data-testid="quiz-next">
            {step + 1 < questions.length ? 'Next question' : 'See my stars'}
          </Button>
        </div>
      )}
    </section>
  )
}

function PhonicsWord({ q }: { q: PhonicsQuestion }) {
  return (
    <div className="mt-5 rounded-2xl bg-muted/60 p-5 text-center">
      <p className="font-display text-5xl font-semibold tracking-wide text-foreground sm:text-6xl">{q.word}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2" aria-label={`Sound it out: ${q.chunks.join(', ')}`}>
        {q.chunks.map((chunk, i) => (
          <span
            key={i}
            className={cn(
              'rounded-xl px-4 py-1.5 font-display text-2xl font-semibold',
              i % 2 === 0 ? 'bg-secondary text-secondary-foreground' : 'bg-[#dcebf7] text-[#1f4d7a]',
            )}
          >
            {chunk}
          </span>
        ))}
      </div>
      <p className="mt-4 inline-flex items-center gap-2 text-[17px] font-semibold text-foreground">
        <Mic className="h-5 w-5 text-coral" aria-hidden />
        Try saying it out loud first!
      </p>
    </div>
  )
}

function PhonicsReveal({ q }: { q: PhonicsQuestion }) {
  return (
    <div className="mt-2 space-y-3">
      {q.tip && <p className="text-[17px] text-foreground">{q.tip}</p>}
      <HearButton word={q.word} path={q.audioPath} big />
    </div>
  )
}

function HearButton({ word, path, big }: { word: string; path?: string; big?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => (path ? playClip(path) : speak(word, { rate: 0.7 }))}
      className={cn(
        'inline-flex items-center gap-2 rounded-full bg-sky font-semibold text-white transition-transform hover:scale-[1.03] active:scale-95',
        big ? 'px-6 py-3 text-lg' : 'px-4 py-2 text-[15px]',
      )}
    >
      <Volume2 className={big ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden />
      Hear “{word}”
    </button>
  )
}

function SoundWords({ words, pending }: { words: SoundWord[]; pending: boolean }) {
  return (
    <div className="mx-auto mt-8 max-w-lg rounded-2xl bg-muted/60 p-5">
      <p className="font-display text-lg font-semibold text-foreground">More words to practice</p>
      {pending && <p className="text-sm text-muted-foreground">Recording the words…</p>}
      <ul className="mt-3 space-y-2.5">
        {words.map((w) => (
          <li key={w.word} className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-display text-2xl font-semibold text-foreground">
              {w.chunks.join(' · ')}
            </span>
            <HearButton word={w.word} path={w.audioPath} />
          </li>
        ))}
      </ul>
    </div>
  )
}
