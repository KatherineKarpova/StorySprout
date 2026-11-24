/**
 * Shared story vocabulary: reading levels, interest chips, and the shape of a
 * generated story. Imported by the worker (prompts, validation, the job) and
 * the client (picker, reader, quiz) so the two can never disagree.
 */

export type Grade = 1 | 2 | 3

export interface ReadingLevel {
  grade: Grade
  label: string
  ages: string
  blurb: string
  /** Guidance handed to the model. Plain words; it is a prompt, not UI copy. */
  guidance: string
}

export const READING_LEVELS: ReadingLevel[] = [
  {
    grade: 1,
    label: 'Grade 1',
    ages: 'Ages 6–7',
    blurb: 'Short sentences, lots of words I can sound out.',
    guidance:
      'First-grade reader. Sentences of 5-8 words. Mostly one- and two-syllable decodable words (CVC words, consonant blends, digraphs sh/ch/th, common sight words). Repeat key words so the reader meets them several times. Simple past or present tense. Lots of dialogue and action.',
  },
  {
    grade: 2,
    label: 'Grade 2',
    ages: 'Ages 7–8',
    blurb: 'Longer sentences and a few new big words.',
    guidance:
      'Second-grade reader. Sentences of 7-12 words. Long-vowel patterns (silent e, vowel teams ai/ee/oa), r-controlled vowels, two-syllable words, a handful of richer vocabulary words that context makes clear. Clear beginning, middle, and end.',
  },
  {
    grade: 3,
    label: 'Grade 3',
    ages: 'Ages 8–9',
    blurb: 'Bigger stories with paragraphs and new words.',
    guidance:
      'Third-grade reader. Varied sentence length up to about 15 words. Multisyllable words, prefixes and suffixes (un-, re-, -ful, -ly), some figurative language. A small problem the character solves through their own choices, and a feeling that changes over the story.',
  },
]

export interface Interest {
  id: string
  label: string
  emoji: string
}

/** Popular themes in picture books and early chapter books for ages 6-8. */
export const INTERESTS: Interest[] = [
  { id: 'dinosaurs', label: 'Dinosaurs', emoji: '🦕' },
  { id: 'space', label: 'Outer space', emoji: '🚀' },
  { id: 'animals', label: 'Animals', emoji: '🐶' },
  { id: 'dragons', label: 'Dragons', emoji: '🐉' },
  { id: 'ocean', label: 'Under the sea', emoji: '🐙' },
  { id: 'magic', label: 'Fairies & magic', emoji: '🧚' },
  { id: 'superheroes', label: 'Superheroes', emoji: '🦸' },
  { id: 'pirates', label: 'Pirates', emoji: '🏴‍☠️' },
  { id: 'robots', label: 'Robots', emoji: '🤖' },
  { id: 'knights', label: 'Castles & knights', emoji: '🏰' },
  { id: 'trucks', label: 'Trucks & trains', emoji: '🚂' },
  { id: 'sports', label: 'Sports', emoji: '⚽' },
  { id: 'bugs', label: 'Bugs', emoji: '🐞' },
  { id: 'mystery', label: 'Mysteries', emoji: '🔍' },
  { id: 'friendship', label: 'Friendship', emoji: '🤝' },
  { id: 'jungle', label: 'Jungle adventure', emoji: '🦁' },
]

export const MAX_INTERESTS = 3
export const MAX_CUSTOM_INTEREST_LENGTH = 60
/** Stories each signed-in user may start per UTC day. Owner credits pay for them. */
export const DAILY_STORY_LIMIT = 2
/**
 * Stories the whole app may start per UTC day, across every reader. This is
 * the owner's spend ceiling: one story measured ~33 credits (≈ $0.33) in local
 * testing (~25 after moving to Haiku and one grid image). The free tier's
 * 500 credits do not renew, so during review the app allows 4 stories a day
 * (~100 credits) across everyone. When credits run out calls are refused
 * (insufficient_credits), not billed.
 */
export const APP_DAILY_STORY_LIMIT = 4

export type StoryStatus = 'queued' | 'writing' | 'illustrating' | 'recording' | 'ready' | 'failed'

export interface PhonicsQuestion {
  kind: 'phonics'
  /** The word the child practices saying, as it appears in the story. */
  word: string
  /** Sound-it-out chunks, e.g. ["drag", "on"]. */
  chunks: string[]
  /** The phonics pattern in kid words, e.g. "The 'ph' makes the /f/ sound." */
  tip: string
  prompt: string
  choices: string[]
  answerIndex: number
  /** Served path of the spoken word, filled in by the job. */
  audioPath?: string
}

export interface ComprehensionQuestion {
  kind: 'comprehension'
  prompt: string
  choices: string[]
  answerIndex: number
  /** Why the answer is right, pointing back at the story. */
  explanation: string
}

export type Question = PhonicsQuestion | ComprehensionQuestion

/**
 * A phonics question shown as its own page inside the book, about the
 * longest, rarest, or hardest word in the ~100 words just read.
 */
export interface CheckpointQuestion extends PhonicsQuestion {
  /** Paragraph index the question follows. */
  afterParagraph: number
}

export interface SoundWord {
  word: string
  chunks: string[]
  audioPath?: string
}

export interface StoryRecord {
  title: string
  grade: Grade
  interests: string[]
  status: StoryStatus
  /** Human-readable stage for the reader while the job runs. */
  progressMessage: string
  paragraphs: string[]
  /**
   * Served image paths. With a grid imageLayout this is one sheet of panels
   * (imageAlts has one alt per panel): 'grid3x3' is one picture per page,
   * 'grid3x2' an earlier six-panel format; older stories hold a single
   * picture. Empty until illustrated.
   */
  imagePaths: string[]
  imageLayout: '' | 'grid3x2' | 'grid3x3'
  imageAlts: string[]
  /** Paragraph index each picture follows, parallel to imagePaths. */
  imageSlots: number[]
  /** End-of-story questions: three reading comprehension questions. */
  questions: Question[]
  /** In-book phonics questions, about one per 100 words. */
  checkpoints: CheckpointQuestion[]
  /** Legacy: stories made before in-book phonics. New stories leave it empty. */
  soundWords: SoundWord[]
  wordCount: number
  error: string
}

export interface QuizAttemptRecord {
  storyId: string
  /** Chosen answer per question: in-book checkpoints first, then the end quiz. */
  answers: number[]
  correct: number
  total: number
}

export function levelFor(grade: number): ReadingLevel {
  return READING_LEVELS.find((l) => l.grade === grade) ?? READING_LEVELS[0]
}

export function interestLabel(id: string): string {
  return INTERESTS.find((i) => i.id === id)?.label ?? id
}
