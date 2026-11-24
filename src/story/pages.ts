/**
 * Book pages. A story is written as one passage per page (~55 words, nine
 * pages), and each page shows, top to bottom: its picture panel, its text,
 * and any phonics question the writer attached to it. Keeping the question
 * on the page it belongs to (instead of on a page of its own) is what stops
 * the text before a question from being cut into a half-empty page.
 * Pure, so it is unit tested.
 */

import type { CheckpointQuestion } from './catalog'

export type Page =
  | {
      kind: 'page'
      /** Index of this page's passage in the story's paragraphs. */
      index: number
      text: string
      /** Panel to show at the top, if the story has one for this page. */
      panel?: number
      /** Checkpoint indices to ask at the bottom of this page. */
      questions: number[]
    }
  | { kind: 'end' }

export function buildPages(
  paragraphs: string[],
  checkpoints: Pick<CheckpointQuestion, 'afterParagraph'>[],
  panelCount: number,
): Page[] {
  const pages: Page[] = paragraphs.map((text, index) => ({
    kind: 'page',
    index,
    text,
    panel: panelFor(index, paragraphs.length, panelCount),
    questions: checkpoints.flatMap((c, q) => (c.afterParagraph === index ? [q] : [])),
  }))
  pages.push({ kind: 'end' })
  return pages
}

/**
 * Which panel a page shows. One panel per page when there are enough (the
 * normal case: nine pages, nine panels). Stories from the earlier six-panel
 * format spread their panels evenly, so some pages go without.
 */
export function panelFor(page: number, pageCount: number, panelCount: number): number | undefined {
  if (panelCount <= 0) return undefined
  if (panelCount >= pageCount) return page
  // Panel k sits on the page nearest the middle of the k-th share of pages.
  for (let k = 0; k < panelCount; k++) {
    if (Math.floor(((k + 0.5) * pageCount) / panelCount) === page) return k
  }
  return undefined
}
