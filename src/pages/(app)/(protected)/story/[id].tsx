/**
 * The reader. Subscribes to the reader's own stories (RBAC 'own' means the
 * room only ever sends their rows) and renders whichever stage the
 * `generate-story` job has reached; every job patch arrives over the records
 * WebSocket and re-renders this page, so there is no polling.
 */

import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthProfileReady, useQuery } from 'deepspace'
import { ArrowLeft, ImageUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui'
import { runAction } from '@/lib/actions'
import { INTERESTS, interestLabel, type StoryRecord } from '@/story/catalog'
import { Reader } from '@/components/story/Reader'
import { stopAll } from '@/components/story/speech'

const STAGES: { key: StoryRecord['status']; label: string }[] = [
  { key: 'writing', label: 'Writing' },
  { key: 'illustrating', label: 'Painting' },
  { key: 'recording', label: 'Recording' },
  { key: 'ready', label: 'Ready!' },
]

export default function StoryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { records, status } = useQuery<StoryRecord>('stories')
  const story = useMemo(() => records.find((r) => r.recordId === id), [records, id])
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // The app owner is always an admin; the redrawPictures action re-checks it.
  const { user } = useAuthProfileReady({ requireUser: true })
  const isOwner = user?.role === 'admin'

  if (status === 'loading') {
    return <CenteredNote>Opening your book…</CenteredNote>
  }
  if (!story) {
    return (
      <CenteredNote>
        We couldn't find that story.{' '}
        <Link to="/home" className="font-semibold text-primary underline">
          Back to your bookshelf
        </Link>
      </CenteredNote>
    )
  }

  const s = story.data
  const known = new Set(INTERESTS.map((i) => i.id))
  const retryParams = new URLSearchParams({
    grade: String(s.grade),
    interests: (s.interests ?? []).filter((i) => known.has(i)).join(','),
  })
  for (const idea of (s.interests ?? []).filter((i) => !known.has(i))) retryParams.append('custom', idea)
  const retryHref = `/new?${retryParams}`

  async function remove() {
    setDeleting(true)
    stopAll()
    const r = await runAction('deleteStory', { storyId: story!.recordId })
    if (r.success) navigate('/home')
    else setDeleting(false)
  }

  // A reader-paid story is written inside the reader's own request; if they
  // closed the tab it can stop part-way. After 10 minutes, offer a way out.
  const stuck =
    s.paidBy === 'reader' &&
    s.status !== 'ready' &&
    s.status !== 'failed' &&
    Date.now() - Date.parse(story.createdAt) > 10 * 60 * 1000
  if (s.status === 'failed' || stuck) {
    return (
      <CenteredNote>
        <span className="block text-5xl" aria-hidden>
          🙈
        </span>
        <span className="mt-3 block font-display text-2xl font-semibold text-foreground">Oops! This story got stuck.</span>
        <span className="mt-2 block">{s.error || 'Something went wrong while writing it.'}</span>
        <span className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            to={retryHref}
            className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground"
          >
            Try again
          </Link>
          <Button variant="ghost" loading={deleting} onClick={remove} className="h-12 rounded-full px-5">
            <Trash2 className="h-4 w-4" aria-hidden /> Remove it
          </Button>
        </span>
      </CenteredNote>
    )
  }

  const nodes = Array.isArray(s.nodes) ? s.nodes : []
  const ready = s.status === 'ready'
  // Stories from before choose-your-own-adventure have no tree to show.
  if (ready && nodes.length === 0) {
    return (
      <CenteredNote>
        <span className="block font-display text-2xl font-semibold text-foreground">This story is from an older StorySprout.</span>
        <span className="mt-2 block">Stories are choose-your-own-adventures now! Make a new one, or remove this one.</span>
        <span className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link to={retryHref} className="inline-flex h-12 items-center rounded-full bg-primary px-6 font-semibold text-primary-foreground">
            Make a new one
          </Link>
          <Button variant="ghost" loading={deleting} onClick={remove} className="h-12 rounded-full px-5">
            <Trash2 className="h-4 w-4" aria-hidden /> Remove it
          </Button>
        </span>
      </CenteredNote>
    )
  }

  return (
    <article className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:pt-10">
      <Link to="/home" className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Bookshelf
      </Link>

      {!ready && (
        <div className="mx-auto max-w-3xl">
          <Progress status={s.status} message={s.progressMessage} />
        </div>
      )}

      {nodes.length === 0 ? (
        <WritingPlaceholder interests={(s.interests ?? []).map(interestLabel)} />
      ) : (
        <>
          <Reader story={s} storyId={story.recordId} newStoryHref={retryHref} />

          {isOwner && ready && s.imageLayout && (
            <RedrawPictures
              storyId={story.recordId}
              redrawn={!!s.hiRes}
              // Saved character sheet, or (older stories) the ideas typed for it.
              defaultCharacters={
                s.characters || (s.interests ?? []).filter((i) => !INTERESTS.some((c) => c.id === i)).join('. ')
              }
            />
          )}

          <div className="mt-16 flex justify-center">
            {confirmDelete ? (
              <div className="flex items-center gap-2 text-[15px]">
                <span className="text-muted-foreground">Delete this story for good?</span>
                <Button variant="destructive" size="sm" loading={deleting} onClick={remove}>
                  Delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Delete story
              </button>
            )}
          </div>
        </>
      )}
    </article>
  )
}

function Progress({ status, message }: { status: StoryRecord['status']; message: string }) {
  const at = Math.max(0, STAGES.findIndex((st) => st.key === status))
  return (
    <div className="mt-5 rounded-2xl bg-card p-4 shadow-[0_6px_18px_-8px_rgba(90,60,20,0.18)]" role="status" data-testid="story-progress">
      <div className="flex gap-2">
        {STAGES.map((st, i) => (
          <div key={st.key} className="flex-1">
            <div className={`h-2 rounded-full ${i < at ? 'bg-primary' : i === at ? 'sprout-shimmer bg-coral' : 'bg-muted'}`} />
            <p className={`mt-1.5 text-xs font-semibold ${i <= at ? 'text-foreground' : 'text-muted-foreground'}`}>{st.label}</p>
          </div>
        ))}
      </div>
      {message && <p className="mt-2 text-[15px] text-muted-foreground">{message}</p>}
    </div>
  )
}

function WritingPlaceholder({ interests }: { interests: string[] }) {
  return (
    <div className="mt-16 text-center">
      <div className="sprout-bob text-7xl" aria-hidden>
        ✏️
      </div>
      <p className="mt-6 font-display text-3xl font-semibold text-foreground">Writing your story…</p>
      {interests.length > 0 && (
        <p className="mt-2 text-lg text-muted-foreground">A brand-new adventure about {interests.join(' and ')}.</p>
      )}
      <p className="mt-1 text-[15px] text-muted-foreground">This takes about a minute. The pictures come next!</p>
      <div className="mx-auto mt-10 max-w-xl space-y-3" aria-hidden>
        {[100, 92, 96, 70].map((w, i) => (
          <div key={i} className="sprout-shimmer h-5 rounded-full" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  )
}

function CenteredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center text-lg text-muted-foreground">
      <p>{children}</p>
    </div>
  )
}

/**
 * Owner-only upgrade: redraw this story's pictures at 2K. Costs about 70
 * credits, so it asks first; the new pictures arrive in the open book live.
 */
function RedrawPictures({
  storyId,
  redrawn,
  defaultCharacters,
}: {
  storyId: string
  redrawn: boolean
  defaultCharacters: string
}) {
  const [characters, setCharacters] = useState(defaultCharacters)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function redraw() {
    setBusy(true)
    setError(null)
    const r = await runAction('redrawPictures', { storyId, characters })
    setBusy(false)
    setConfirm(false)
    if (!r.success) setError(r.error)
  }

  return (
    <div className="mx-auto mt-12 max-w-xl rounded-2xl border-2 border-dashed border-border p-4 text-center text-[15px]">
      <p className="font-semibold text-foreground">Owner tools{redrawn && ' · pictures already redrawn at 2K'}</p>
      <label className="mt-3 block text-left text-sm font-semibold text-foreground" htmlFor="redraw-characters">
        How should the characters look in every picture?
      </label>
      <textarea
        id="redraw-characters"
        value={characters}
        maxLength={400}
        rows={3}
        onChange={(e) => setCharacters(e.target.value)}
        placeholder="Sage is a 7 year old girl with long blonde hair and blue eyes, in a yellow sweater. Her grandma has curly blonde hair."
        className="mt-1 w-full rounded-xl border-2 border-input bg-card p-3 text-[15px] text-foreground outline-none focus:border-primary"
      />
      {confirm ? (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <span className="text-muted-foreground">Redraw all pictures at 2K for about 70 credits?</span>
          <Button size="sm" loading={busy} onClick={redraw}>
            {busy ? 'Redrawing… (about 30s)' : 'Yes, redraw'}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="mt-2 rounded-full" onClick={() => setConfirm(true)}>
          <ImageUp aria-hidden /> Redraw pictures in high quality (about 70 credits)
        </Button>
      )}
      {error && <p className="mt-2 font-semibold text-destructive">{error}</p>}
    </div>
  )
}
