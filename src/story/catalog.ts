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
  /**
   * Words per page: what fits the bottom half of a page at this grade's type
   * size. A range for the writer, not an exact count; the reader shrinks the
   * type a little if a page still overflows.
   */
  wordsPerPage: [number, number]
}

export const READING_LEVELS: ReadingLevel[] = [
  {
    grade: 1,
    label: 'Grade 1',
    ages: 'Ages 6–7',
    blurb: 'Short sentences, lots of words I can sound out.',
    guidance:
      'First-grade reader. Sentences of 5-8 words. Mostly one- and two-syllable decodable words (CVC words, consonant blends, digraphs sh/ch/th, common sight words). Repeat key words so the reader meets them several times. Simple past or present tense. Lots of dialogue and action.',
    wordsPerPage: [18, 28],
  },
  {
    grade: 2,
    label: 'Grade 2',
    ages: 'Ages 7–8',
    blurb: 'Longer sentences and a few new big words.',
    guidance:
      'Second-grade reader. Sentences of 7-12 words. Long-vowel patterns (silent e, vowel teams ai/ee/oa), r-controlled vowels, two-syllable words, a handful of richer vocabulary words that context makes clear. Clear beginning, middle, and end.',
    wordsPerPage: [28, 40],
  },
  {
    grade: 3,
    label: 'Grade 3',
    ages: 'Ages 8–10',
    blurb: 'Bigger words and twistier stories.',
    guidance:
      'Third- to fourth-grade reader. Varied sentences up to about 18 words, some with two clauses. Multisyllable and less common words (prefixes and suffixes like un-, re-, -tion, -ous, -ful), vivid verbs, some figurative language. A more complex storyline: a real problem, a clue or twist, characters with clear motives and feelings that change, and choices with consequences.',
    wordsPerPage: [38, 52],
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

/** Nodes in a story tree: one choice for grade 1, two for grades 2-3. */
export function nodeCountFor(grade: number): 3 | 7 {
  return grade === 1 ? 3 : 7
}

export type StoryStatus = 'queued' | 'writing' | 'illustrating' | 'recording' | 'ready' | 'failed'

export interface PhonicsQuestion {
  kind: 'phonics'
  /** The word the child practices saying, as it appears in the story. */
  word: string
  /** Sound-it-out chunks, e.g. ["drag", "on"]. */
  chunks: string[]
  /** The sound pattern in kid words, e.g. "The 'oa' says /oh/, like in boat." */
  tip: string
  /** About how the word sounds: rhymes, matching sounds, vowel sounds. */
  prompt: string
  choices: string[]
  answerIndex: number
  /** Served path of Hope saying the word, filled in by the job. */
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

/** One book page: the top half is a picture panel, the bottom half this text. */
export interface StoryPage {
  text: string
  /** Panel index in the story's picture sheet. */
  panel: number
}

/** The "what should they do next?" page after a node that is not an ending. */
export interface StoryChoice {
  prompt: string
  /** Option 0 leads to child node 2i+1, option 1 to child node 2i+2. */
  options: [string, string]
}

/**
 * One node of the choose-your-own-adventure tree: two pages, then (unless it
 * is an ending) a choice. Nodes are stored in heap order: node i's children
 * are 2i+1 and 2i+2. Each node carries the questions about what happens in
 * it, so the end quiz is built from the branch the child actually read.
 */
export interface StoryNode {
  pages: [StoryPage, StoryPage]
  choice?: StoryChoice
  phonics: PhonicsQuestion
  comprehension: ComprehensionQuestion[]
}

export type ImageLayout = '' | 'grid3x2' | 'grid4x4'

export interface StoryRecord {
  title: string
  grade: Grade
  interests: string[]
  status: StoryStatus
  /** Human-readable stage for the reader while the job runs. */
  progressMessage: string
  /** The story tree: 3 nodes (grade 1) or 7 (grades 2-3). Empty until written. */
  nodes: StoryNode[]
  /** The picture sheet (one path), once painted or taken from the library. */
  imagePaths: string[]
  imageLayout: ImageLayout
  /** One alt text per panel in the sheet. */
  imageAlts: string[]
  /** Picture-library entry this story's pictures came from or were saved as. */
  libraryId: string
  /** The illustrator's character sheet and per-panel scenes, kept so the
   *  pictures can be redrawn later (older stories have neither). */
  characters?: string
  scenes?: string[]
  /** True once the owner redrew the pictures at 2K. */
  hiRes?: boolean
  /** Words across the whole tree (a single path reads about a third to half). */
  wordCount: number
  error: string
}

export interface QuizAttemptRecord {
  storyId: string
  /** Node indices of the branch the child read, root first. */
  path: number[]
  /** Chosen answer per end-of-story question. */
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
