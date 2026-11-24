/**
 * The StorySprout mark: an open book with a sprout growing up out of its
 * spine. Same drawing as public/favicon.svg (keep the two in sync).
 */

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {/* Sprout: stem from the spine, two leaves */}
      <path d="M32 42 C32 34 31.5 27 32 19" fill="none" stroke="#2f7d4f" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M31.8 27 C25 27.5 18.5 23 17.5 15 C25 14.5 30.5 19 31.8 27 Z" fill="#3f9b5b" />
      <path d="M32.2 21.5 C38.5 21 45 16 46 8 C38.5 8 33 13 32.2 21.5 Z" fill="#2f7d4f" />
      {/* Open book: two curved pages meeting at the spine */}
      <path
        d="M32 43 C25 38 15 37.5 5 40.5 L5 57 C15 54 25 54.5 32 59 Z"
        fill="#fff8ec"
        stroke="#e8613c"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M32 43 C39 38 49 37.5 59 40.5 L59 57 C49 54 39 54.5 32 59 Z"
        fill="#fff8ec"
        stroke="#e8613c"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      {/* A few lines of "text" on each page */}
      <path d="M11 46 C16 44.6 21 44.6 26 46.3 M11 50.5 C16 49.1 21 49.1 26 50.8" fill="none" stroke="#e8613c" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M53 46 C48 44.6 43 44.6 38 46.3 M53 50.5 C48 49.1 43 49.1 38 50.8" fill="none" stroke="#e8613c" strokeOpacity="0.45" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
