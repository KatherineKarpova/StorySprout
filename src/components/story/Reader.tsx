/**
 * A finished (or still-arriving) adventure: title, the Book, then the five
 * end-of-story questions for the branch the child read (quizFor). Used by the
 * reader's own story page and by the public demo, which passes
 * `saveAttempt={false}` because a signed-out visitor has nowhere to save.
 */

import { useMemo, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { levelFor, type StoryRecord } from '@/story/catalog'
import { pathFor, quizFor } from '@/story/tree'
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
  // The option picked at each choice, root first. Re-choosing earlier drops
  // everything after it, because that branch no longer happens.
  const [choices, setChoices] = useState<number[]>([])
  const nodes = s.nodes ?? []
  const path = useMemo(() => pathFor(choices, nodes.length), [choices, nodes.length])
  const questions = useMemo(() => quizFor(nodes, path), [nodes, path])

  return (
    <>
      <header className="mt-2 text-center">
        <p className="text-[15px] font-semibold text-coral">{levelFor(s.grade).label} · Choose your own adventure</p>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl" data-testid="story-title">
          {s.title}
        </h1>
      </header>

      <div className="mt-3">
        {phase === 'reading' ? (
          <Book
            story={s}
            choices={choices}
            onChoose={(depth, option) => setChoices((cur) => [...cur.slice(0, depth), option])}
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
              // A new branch is a new quiz.
              key={path.join('-')}
              storyId={storyId}
              path={path}
              questions={questions}
              newStoryHref={newStoryHref}
              saveAttempt={saveAttempt}
            />
          </div>
        )}
      </div>
    </>
  )
}
