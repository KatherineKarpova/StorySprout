/**
 * Landing page — STATIC (no providers, prerendered at build). Speaks to the
 * grown-up who signs in; the app itself speaks to the child.
 */

import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { seo } from '../seo'
import { Logo } from '../components/Logo'

const STEPS = [
  {
    emoji: '🎯',
    title: 'Pick a level and a passion',
    body: 'Grade 1, 2 or 3, plus up to three favorite things, or the child types their own idea.',
  },
  {
    emoji: '📖',
    title: 'Choose the adventure',
    body: 'A brand-new picture book where your reader decides what happens next. Tap any word to hear it said.',
  },
  {
    emoji: '🗣️',
    title: 'Show what you know',
    body: 'Five questions about the path they chose: three about what happened, two about how words sound. With stars.',
  },
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background">
        <header className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <span className="font-display flex items-center gap-1.5 text-2xl font-semibold text-primary">
            <Logo className="h-9 w-9" /> StorySprout
          </span>
          <Link to="/home" className="rounded-full px-4 py-2 text-[15px] font-semibold text-foreground hover:bg-muted">
            Sign in
          </Link>
        </header>

        <main>
          <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-16 pt-8 md:grid-cols-[1.15fr_1fr] md:pt-16">
            <div>
              <p className="font-display text-lg font-semibold text-coral">For readers ages 6 to 8</p>
              <h1 className="mt-3 text-5xl font-semibold leading-[1.05] text-foreground sm:text-6xl">
                Stories about what your kid loves, at the level they read.
              </h1>
              <p className="mt-5 max-w-xl text-xl text-muted-foreground">
                StorySprout writes a new illustrated choose-your-own-adventure in about a minute.
                Your reader picks what happens next, then shows what they understood.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  to="/new"
                  className="inline-flex h-14 items-center rounded-full bg-primary px-8 text-lg font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  Make a story
                </Link>
                <Link to="/demo" className="inline-flex h-14 items-center rounded-full border-2 border-primary px-7 text-lg font-semibold text-primary hover:bg-primary/5">
                  Read a sample story
                </Link>
              </div>
            </div>

            {/* A tiny "page" from a story, so the promise is concrete. */}
            <div className="rotate-1 rounded-[2rem] border-4 border-card bg-card p-6 shadow-[0_20px_50px_-20px_rgba(90,60,20,0.35)]">
              <p className="text-sm font-semibold text-coral">Grade 1 · Dinosaurs + Space</p>
              <p className="font-display mt-1 text-2xl font-semibold text-foreground">Rex and the Red Rocket</p>
              <p className="mt-3 text-[20px] leading-relaxed text-foreground">
                Rex had a red{' '}
                <mark className="rounded-md bg-primary px-1 text-primary-foreground">rocket</mark>. It went
                up, up, up! “Hop in!” said Rex to his pal Pip.
              </p>
              <div className="mt-5 rounded-2xl bg-muted/70 p-4 text-center">
                <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Say it!</p>
                <p className="font-display mt-1 text-4xl font-semibold text-foreground">rocket</p>
                <div className="mt-2 flex justify-center gap-2">
                  <span className="font-display rounded-xl bg-secondary px-3 py-1 text-xl font-semibold text-secondary-foreground">rock</span>
                  <span className="font-display rounded-xl bg-[#dcebf7] px-3 py-1 text-xl font-semibold text-[#1f4d7a]">et</span>
                </div>
              </div>
            </div>
          </section>

          <section className="border-t border-border bg-card/60">
            <ol className="mx-auto grid max-w-5xl gap-8 px-5 py-14 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="text-4xl" aria-hidden>
                    {step.emoji}
                  </span>
                  <h2 className="mt-3 text-xl font-semibold text-foreground">
                    {i + 1}. {step.title}
                  </h2>
                  <p className="mt-1.5 text-[16px] text-muted-foreground">{step.body}</p>
                </li>
              ))}
            </ol>
          </section>

          <footer className="mx-auto max-w-5xl px-5 py-10 text-[14px] text-muted-foreground">
            Stories are written by AI with child-safety instructions. A grown-up nearby is still the best co-reader.
          </footer>
        </main>
      </div>
    </>
  )
}
