/**
 * The story body: paragraphs with the two pictures placed where the writer
 * asked, every word tappable to hear it, and a per-paragraph read-aloud.
 */

import { Fragment, useState } from 'react'
import { ImageOff, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { canSpeak, speak, stopAll } from './speech'

interface Props {
  paragraphs: string[]
  imagePaths: string[]
  imageAlts: string[]
  /** Paragraph index each picture follows. */
  imageSlots: number[]
  /** Pictures are still being painted. */
  painting: boolean
  grade: number
}

export function StoryText({ paragraphs, imagePaths, imageAlts, imageSlots, painting, grade }: Props) {
  const [reading, setReading] = useState<number | null>(null)
  const [tapped, setTapped] = useState<string | null>(null)
  const speech = canSpeak()

  function readParagraph(i: number) {
    if (reading === i) {
      stopAll()
      setReading(null)
      return
    }
    setReading(i)
    speak(paragraphs[i], { rate: grade === 1 ? 0.8 : 0.9, onEnd: () => setReading(null) })
  }

  function sayWord(key: string, word: string) {
    const clean = word.replace(/[^\p{L}\p{N}'-]/gu, '')
    if (!clean) return
    setTapped(key)
    setReading(null)
    speak(clean, { rate: 0.7, onEnd: () => setTapped((k) => (k === key ? null : k)) })
  }

  const textSize = grade === 1 ? 'text-[24px] leading-[1.75]' : grade === 2 ? 'text-[21px] leading-[1.7]' : 'text-[19px] leading-[1.7]'

  return (
    <div className="space-y-6">
      {speech && (
        <p className="text-[15px] text-muted-foreground">
          Stuck on a word? <span className="font-semibold text-foreground">Tap it</span> to hear it.
        </p>
      )}
      {paragraphs.map((para, i) => {
        const slot = imageSlots.indexOf(i)
        return (
          <Fragment key={i}>
            <div className="group relative">
              <p className={cn(textSize, 'text-foreground', reading === i && 'rounded-xl bg-accent/70 px-2 -mx-2')}>
                {para.split(/(\s+)/).map((tok, j) =>
                  /^\s+$/.test(tok) || !speech ? (
                    tok
                  ) : (
                    <span
                      key={j}
                      role="button"
                      tabIndex={0}
                      onClick={() => sayWord(`${i}-${j}`, tok)}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), sayWord(`${i}-${j}`, tok))}
                      className={cn(
                        'cursor-pointer rounded-md transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                        tapped === `${i}-${j}` && 'bg-primary text-primary-foreground hover:bg-primary',
                      )}
                    >
                      {tok}
                    </span>
                  ),
                )}
              </p>
              {speech && (
                <button
                  type="button"
                  onClick={() => readParagraph(i)}
                  aria-label={reading === i ? 'Stop reading' : `Read paragraph ${i + 1} to me`}
                  className={cn(
                    'mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold transition-colors',
                    reading === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Volume2 className="h-4 w-4" aria-hidden />
                  {reading === i ? 'Stop' : 'Read to me'}
                </button>
              )}
            </div>
            {slot !== -1 && (
              <Picture path={imagePaths[slot]} alt={imageAlts[slot] ?? ''} painting={painting} />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

function Picture({ path, alt, painting }: { path?: string; alt: string; painting: boolean }) {
  const [broken, setBroken] = useState(false)
  if (path && !broken) {
    return (
      <figure className="sprout-pop overflow-hidden rounded-3xl border-4 border-card bg-muted shadow-[0_10px_30px_-12px_rgba(90,60,20,0.35)]">
        <img src={path} alt={alt} onError={() => setBroken(true)} className="aspect-[4/3] w-full object-cover" />
      </figure>
    )
  }
  if (painting) {
    return (
      <div
        role="img"
        aria-label="A picture is being painted"
        className="sprout-shimmer flex aspect-[4/3] w-full items-center justify-center rounded-3xl border-4 border-card"
      >
        <span className="font-display text-lg font-semibold text-muted-foreground">🎨 Painting a picture…</span>
      </div>
    )
  }
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-border text-muted-foreground">
      <ImageOff className="h-8 w-8" aria-hidden />
      <span className="text-[15px]">This picture didn't come out. Imagine it! {alt}</span>
    </div>
  )
}
