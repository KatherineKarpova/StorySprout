/**
 * Public sample story at /demo: no sign-in, no credits. The story, its panel
 * sheet and Hope's phonics recordings are static files in public/demo/,
 * exported once from a real generated story by scripts/export-demo.mjs, so a
 * visitor (or reviewer) sees the whole experience without spending anything.
 * Under (app)/ only so the shared reader's providers exist; the quiz score is
 * not saved, and tapping a non-practice word asks the visitor to sign in.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { Reader } from '@/components/story/Reader'
import type { StoryRecord } from '@/story/catalog'

export default function DemoPage() {
  const [story, setStory] = useState<StoryRecord | null | 'missing'>(null)

  useEffect(() => {
    let live = true
    fetch('/demo/story.json')
      .then((r) => (r.ok ? (r.json() as Promise<StoryRecord>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => live && setStory(s))
      .catch(() => live && setStory('missing'))
    return () => {
      live = false
    }
  }, [])

  return (
    <article className="mx-auto max-w-[120rem] px-4 pb-28 pt-3">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-2xl bg-accent px-5 py-1.5">
        <p className="text-[15px] font-semibold text-accent-foreground">
          <Sparkles className="mr-1.5 inline h-4 w-4" aria-hidden />
          A sample story. Sign in to make your own about anything you like!
        </p>
        <Link to="/new" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          Make my story
        </Link>
      </div>

      {story === null && <p className="mt-16 text-center text-lg text-muted-foreground">Opening the book…</p>}
      {story === 'missing' && (
        <p className="mt-16 text-center text-lg text-muted-foreground">The sample story isn't here yet.</p>
      )}
      {story && story !== 'missing' && <Reader story={story} storyId="demo" newStoryHref="/new" saveAttempt={false} />}
    </article>
  )
}
