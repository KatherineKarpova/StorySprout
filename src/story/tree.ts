/**
 * The choose-your-own-adventure tree, as pure functions shared by the job
 * (validation, picture sheet) and the reader (paging, quiz).
 *
 * Nodes are in heap order: node 0 is the beginning; option 0 of node i leads
 * to node 2i+1 and option 1 to node 2i+2. Grade 1 has 3 nodes (one choice),
 * grades 2-3 have 7 (two choices). Every node is two pages; page j of node i
 * shows picture panel 2i+j. The 7-node sheet is a 4×4 grid: panels 0-13 are
 * the pages, 14 is the cover and 15 the ending picture.
 */

import type { ImageLayout, Question, StoryNode, StoryRecord } from './catalog'

export const childrenOf = (node: number): [number, number] => [2 * node + 1, 2 * node + 2]

export const isEnding = (node: number, nodeCount: number) => 2 * node + 1 >= nodeCount

export const panelFor = (node: number, page: 0 | 1) => 2 * node + page

export function layoutForGrade(grade: number): Exclude<ImageLayout, ''> {
  return grade === 1 ? 'grid3x2' : 'grid4x4'
}

/**
 * The layout to show a story's sheet with. Normally the saved one; if a
 * story has a picture sheet and pages but no saved layout (a failed save
 * once dropped it), the grade decides it, since the layout follows the tree.
 */
export function effectiveLayout(s: Pick<StoryRecord, 'imageLayout' | 'imagePaths' | 'nodes' | 'grade'>): ImageLayout {
  if (s.imageLayout) return s.imageLayout
  return s.imagePaths?.[0] && s.nodes?.length ? layoutForGrade(s.grade) : ''
}

/** Pictures in a sheet: one per page, plus cover and ending for the big tree. */
export function panelCount(layout: ImageLayout): number {
  return layout === 'grid4x4' ? 16 : layout === 'grid3x2' ? 6 : 0
}

/** Bookshelf cover: the dedicated cover panel when the sheet has one. */
export const coverPanel = (layout: ImageLayout) => (layout === 'grid4x4' ? 14 : 0)

/** The picture on "The End", when the sheet has one. */
export const endPanel = (layout: ImageLayout) => (layout === 'grid4x4' ? 15 : undefined)

/** Node indices from the root, following `choices` (0 or 1 at each choice). */
export function pathFor(choices: number[], nodeCount: number): number[] {
  const path = [0]
  for (const c of choices) {
    const here = path[path.length - 1]
    if (isEnding(here, nodeCount)) break
    path.push(childrenOf(here)[c === 1 ? 1 : 0])
  }
  return path
}

export const QUIZ_COMPREHENSION = 3
export const QUIZ_PHONICS = 2

/**
 * The five end-of-story questions for the branch the child read: three
 * comprehension questions in story order (every node on the path has at
 * least one; grade 1's beginning has two), then two pronunciation questions,
 * from the first and the last node so they span the story.
 */
export function quizFor(nodes: StoryNode[], path: number[]): Question[] {
  const onPath = path.map((i) => nodes[i]).filter(Boolean)
  const comprehension = onPath.flatMap((n) => n.comprehension).slice(0, QUIZ_COMPREHENSION)
  const phonicsNodes = onPath.length > 1 ? [onPath[0], onPath[onPath.length - 1]] : onPath
  const phonics = phonicsNodes.map((n) => n.phonics).slice(0, QUIZ_PHONICS)
  return [...comprehension, ...phonics]
}
