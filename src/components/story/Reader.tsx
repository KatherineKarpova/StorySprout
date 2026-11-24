/**
 * A finished (or still-arriving) story: title, the Book with its in-book
 * phonics, then the end-of-story comprehension quiz. Used by the reader's own
 * story page and by the public demo, which passes `saveAttempt={false}`
 * because a signed-out visitor has nowhere to save a score.
 */

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { levelFor, type StoryRecord } from '@/story/catalog'
import { gridFor } from '@/story/panels'
import { Book } from './Book'
import { Quiz } from './Quiz'
import { stopAll } from './speech'

interface Props {
  story: StoryRecord
  storyId: string
  newStoryHref: string
  saveAttempt?: boolean
}

export function Reader({ story: s, storyId, newStoryHref, saveAttempt = true }: Props) {
  const [phase, setPhase] = useState<'reading' | 'quiz'>('reading')
  // In-book phonics answers, by checkpoint index.
  const [answers, setAnswers] = useState<Record<number, number>>({})

  const level = levelFor(s.grade)
  const grid = gridFor(s.imageLayout)
  const checkpoints = s.checkpoints ?? []
  const answerList = checkpoints.map((_, i) => answers[i] ?? null)
  const checkpointCorrect = checkpoints.filter((q, i) => answers[i] === q.answerIndex).length

  return (
    <>
      <header className="mt-4 text-center">
        <p className="text-[15px] font-semibold text-coral">
          {level.label} · {s.wordCount} words
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-foreground sm:text-4xl" data-testid="story-title">
          {s.title}
        </h1>
      </header>

      <div className="mt-5">
        {phase === 'reading' ? (
          <Book
            title={s.title}
            grade={s.grade}
            paragraphs={s.paragraphs ?? []}
            sheetPath={grid ? s.imagePaths?.[0] || undefined : undefined}
            grid={grid}
            panelAlts={grid ? (s.imageAlts ?? []) : []}
            painting={s.status === 'illustrating'}
            checkpoints={checkpoints}
            answers={answerList}
            onAnswer={(i, choice) => setAnswers((cur) => (i in cur ? cur : { ...cur, [i]: choice }))}
            practiceWords={[...checkpoints, ...(s.soundWords ?? [])]}
            onFinish={() => {
              stopAll()
              setPhase('quiz')
            }}
          />
        ) : (
          <div className="mx-auto max-w-3xl">
            <button
              type="button"
              onClick={() => setPhase('reading')}
              className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the book
            </button>
            <Quiz
              storyId={storyId}
              questions={s.questions ?? []}
              soundWords={s.soundWords ?? []}
              checkpointAnswers={answerList.map((a) => a ?? -1)}
              checkpointCorrect={checkpointCorrect}
              newStoryHref={newStoryHref}
              saveAttempt={saveAttempt}
            />
          </div>
        )}
      </div>
    </>
  )
}
