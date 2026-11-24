import { describe, expect, it } from 'vitest'
import {
  cleanCustom,
  decodeDataUrl,
  extractJson,
  normalizeRequest,
  normalizeWord,
  parseStoryDraft,
  wordClipId,
} from './prompts'
import { buildPages, panelFor } from './pages'
import { detectPanels, evenPanels } from './panels'
import { replyText } from '../jobs'

const phonics = (word: string, page: number) => ({
  page,
  word,
  chunks: ['x'],
  tip: 'tip',
  prompt: `How many syllables in ${word}?`,
  choices: ['1', '2', '3'],
  answerIndex: 1,
})

const goodDraft = () => ({
  title: 'Dot and the Moon Rocket',
  characters: 'Dot is a small girl with red curls and a yellow raincoat.',
  pages: [
    'Dot built a rocket.', // 0
    'The rocket was shiny.', // 1
    'Dot flew past a planet.', // 2
    'She saw a comet.', // 3
    'The comet was bright.', // 4
    'Dot landed on the moon.', // 5
    'She saw a crater.', // 6
    'Dot planted a flag.', // 7
    'She waved to Earth.', // 8 (last page)
  ].map((text, i) => ({ text, scene: `Scene ${i + 1}`, alt: `Picture ${i + 1}` })),
  checkpoints: [phonics('rocket', 0), phonics('planet', 2), phonics('comet', 3), phonics('landed', 5)],
  comprehension: [
    { prompt: 'What did Dot build?', choices: ['A boat', 'A rocket', 'A kite'], answerIndex: 1, explanation: 'She built a rocket.' },
    { prompt: 'What came first?', choices: ['a', 'b', 'c'], answerIndex: 0, explanation: 'x' },
    { prompt: 'Why was Dot proud?', choices: ['a', 'b', 'c'], answerIndex: 2, explanation: 'x' },
  ],
})

describe('normalizeRequest', () => {
  it('accepts a grade and known interests', () => {
    expect(normalizeRequest({ grade: 2, interests: ['space', 'space', 'nope'] })).toEqual({
      grade: 2,
      interests: ['space'],
      custom: [],
    })
  })
  it('rejects a missing grade and an empty choice', () => {
    expect(normalizeRequest({ interests: ['space'] })).toHaveProperty('error')
    expect(normalizeRequest({ grade: 1, interests: [] })).toHaveProperty('error')
  })
  it('allows a typed idea on its own (string from older clients, or a list)', () => {
    expect(normalizeRequest({ grade: 3, custom: 'volcanoes' })).toMatchObject({ custom: ['volcanoes'] })
    expect(normalizeRequest({ grade: 3, custom: ['volcanoes', 'Volcanoes', ' ', 'cats'] })).toMatchObject({
      custom: ['volcanoes', 'cats'],
    })
  })
  it('counts typed ideas toward the three picks', () => {
    expect(normalizeRequest({ grade: 1, interests: ['space', 'bugs'], custom: ['cats'] })).not.toHaveProperty('error')
    expect(normalizeRequest({ grade: 1, interests: ['space', 'bugs'], custom: ['cats', 'dogs'] })).toHaveProperty('error')
  })
  it('rejects more than three chips', () => {
    expect(normalizeRequest({ grade: 1, interests: ['space', 'dragons', 'bugs', 'ocean'] })).toHaveProperty('error')
  })
})

describe('cleanCustom', () => {
  it('strips markup and prompt-shaped characters and caps the length', () => {
    expect(cleanCustom('<b>cats</b> {ignore: "rules"}')).toBe('b cats b ignore rules')
    expect(cleanCustom('x'.repeat(200))).toHaveLength(60)
    expect(cleanCustom(42)).toBe('')
  })
})

describe('parseStoryDraft', () => {
  it('keeps phonics checkpoints in the book and comprehension at the end', () => {
    const d = parseStoryDraft(goodDraft())
    expect(d.checkpoints.map((q) => [q.kind, q.word, q.afterParagraph])).toEqual([
      ['phonics', 'rocket', 0],
      ['phonics', 'planet', 2],
      ['phonics', 'comet', 3],
      ['phonics', 'landed', 5],
    ])
    expect(d.questions.map((q) => q.kind)).toEqual(['comprehension', 'comprehension', 'comprehension'])
  })
  it('drops a checkpoint whose word is not in the story, and repeated words', () => {
    const raw = goodDraft()
    raw.checkpoints.push(phonics('dragon', 3), phonics('Rocket', 4))
    expect(parseStoryDraft(raw).checkpoints.map((q) => q.word)).toEqual(['rocket', 'planet', 'comet', 'landed'])
  })
  it('moves a checkpoint asked too early to after the paragraph with its word', () => {
    const raw = goodDraft()
    raw.checkpoints[2].page = 0 // "comet" first appears on page 3
    expect(parseStoryDraft(raw).checkpoints.find((q) => q.word === 'comet')?.afterParagraph).toBe(3)
  })
  it('never puts a checkpoint on the last page', () => {
    const raw = goodDraft()
    raw.checkpoints = [phonics('rocket', 8), phonics('Earth', 8)] // Earth is only on the last page
    const d = parseStoryDraft(raw)
    expect(d.checkpoints.map((q) => [q.word, q.afterParagraph])).toEqual([['rocket', 7]])
  })
  it('requires at least one phonics checkpoint', () => {
    const raw = goodDraft()
    raw.checkpoints = []
    expect(() => parseStoryDraft(raw)).toThrow(/phonics/)
  })
  it('rejects an answer index outside the choices', () => {
    const raw = goodDraft()
    raw.comprehension[0].answerIndex = 5
    expect(() => parseStoryDraft(raw)).toThrow(/answer/)
  })
  it('requires nine pages, each with a picture scene, and drops extras', () => {
    const few = goodDraft()
    few.pages = few.pages.slice(0, 8)
    expect(() => parseStoryDraft(few)).toThrow(/9 pages/)
    const noScene = goodDraft()
    noScene.pages[4].scene = ''
    expect(() => parseStoryDraft(noScene)).toThrow(/9 pages/)
    const many = goodDraft()
    many.pages.push({ text: 'Extra.', scene: 'Scene 10', alt: 'x' })
    const d = parseStoryDraft(many)
    expect(d.paragraphs).toHaveLength(9)
    expect(d.panels.map((p) => p.scene)).toEqual(many.pages.slice(0, 9).map((p) => p.scene))
  })
})

describe('buildPages', () => {
  it('makes one page per passage with its panel and its questions, then The End', () => {
    const pages = buildPages(['a', 'b', 'c'], [{ afterParagraph: 1 }, { afterParagraph: 1 }], 3)
    expect(pages).toEqual([
      { kind: 'page', index: 0, text: 'a', panel: 0, questions: [] },
      { kind: 'page', index: 1, text: 'b', panel: 1, questions: [0, 1] },
      { kind: 'page', index: 2, text: 'c', panel: 2, questions: [] },
      { kind: 'end' },
    ])
  })
  it('spreads fewer panels evenly (older six-panel stories) and none without a sheet', () => {
    const placed = Array.from({ length: 9 }, (_, i) => panelFor(i, 9, 6))
    expect(placed.filter((p) => p !== undefined)).toEqual([0, 1, 2, 3, 4, 5])
    expect(panelFor(0, 9, 0)).toBeUndefined()
  })
})

/** A synthetic sheet: cream background with dark panels at the given boxes (pixels). */
function sheet(W: number, H: number, boxes: [number, number, number, number][]) {
  const data = new Uint8ClampedArray(W * H * 4)
  for (let i = 0; i < W * H; i++) data.set([250, 245, 230, 255], i * 4)
  for (const [x0, y0, w, h] of boxes)
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) data.set([40, 90, 160, 255], (y * W + x) * 4)
  return { width: W, height: H, data }
}

const G32 = { cols: 3, rows: 2 }
const G33 = { cols: 3, rows: 3 }

describe('detectPanels', () => {
  it('finds a 3x3 grid whose outer margin is under 3% (bug seen on a real sheet)', () => {
    // Real sheet: 1024px with ~30px margins; scaled to 300px that is ~8px.
    const at = [8, 104, 200]
    const boxes = detectPanels(sheet(300, 300, at.flatMap((y) => at.map((x) => [x, y, 92, 92] as [number, number, number, number]))), G33)
    expect(boxes).toHaveLength(9)
  })
  it('finds a 3x3 grid (one picture per page)', () => {
    const at = [12, 108, 204]
    const boxes = detectPanels(sheet(300, 300, at.flatMap((y) => at.map((x) => [x, y, 84, 84] as [number, number, number, number]))), G33)
    expect(boxes).toHaveLength(9)
    expect(boxes![8].x).toBeCloseTo(204 / 300, 1)
    expect(boxes![8].y).toBeCloseTo(204 / 300, 1)
  })
  it('finds an uneven 3x2 grid (wide outer margins, narrow gutters)', () => {
    // Like the real test sheet: 300x200, outer margin 15, gutters 10.
    const cols = [15, 107, 199]
    const rows = [16, 108]
    const boxes = detectPanels(sheet(300, 200, rows.flatMap((y) => cols.map((x) => [x, y, 86, 76] as [number, number, number, number]))), G32)
    expect(boxes).toHaveLength(6)
    expect(boxes![0].x).toBeCloseTo(15 / 300, 1)
    expect(boxes![4].y).toBeCloseTo(108 / 200, 1)
  })
  it('ignores darkened corners when judging the background (bug seen on a real sheet)', () => {
    const cols = [15, 107, 199]
    const rows = [16, 108]
    const px = sheet(300, 200, rows.flatMap((y) => cols.map((x) => [x, y, 86, 76] as [number, number, number, number])))
    // Darken a 6px vignette in every corner, like the real Gemini sheet.
    for (const [cx, cy] of [[0, 0], [294, 0], [0, 194], [294, 194]])
      for (let y = cy; y < cy + 6; y++) for (let x = cx; x < cx + 6; x++) px.data.set([227, 221, 209, 255], (y * 300 + x) * 4)
    expect(detectPanels(px, G32)).toHaveLength(6)
  })
  it('gives up (so the caller falls back to even sixths) when the grid is not 3x2', () => {
    expect(detectPanels(sheet(300, 200, [[20, 20, 260, 160]]), G32)).toBeNull()
    expect(evenPanels(G32)).toHaveLength(6)
    expect(evenPanels(G33)).toHaveLength(9)
  })
})

describe('tapped-word cache keys', () => {
  it('normalizes a tapped token to a word', () => {
    expect(normalizeWord('Rocket!')).toBe('rocket')
    expect(normalizeWord('“Don’t')).toBe("don't")
    expect(normalizeWord('123')).toBe('')
    expect(normalizeWord('x'.repeat(30))).toBe('')
  })
  it('makes ASCII ids that do not collide', () => {
    expect(wordClipId('rocket')).toBe('w_rocket')
    expect(wordClipId("don't")).not.toBe(wordClipId('dont'))
    expect(wordClipId('café')).toMatch(/^[a-z0-9_]+$/)
  })
})

describe('model reply helpers', () => {
  it('pulls JSON out of a fenced reply', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('reads Anthropic and OpenAI reply shapes', () => {
    expect(replyText({ content: [{ type: 'text', text: 'hi' }] })).toBe('hi')
    expect(replyText({ choices: [{ message: { content: 'yo' } }] })).toBe('yo')
  })
  it('decodes data URLs and bare base64', () => {
    expect(decodeDataUrl('data:audio/mpeg;base64,AAE=', 'x')).toMatchObject({ type: 'audio/mpeg' })
    expect(Array.from(decodeDataUrl('AAE=', 'image/png').bytes)).toEqual([0, 1])
  })
})
