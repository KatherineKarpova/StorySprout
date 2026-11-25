import { describe, expect, it } from 'vitest'
import {
  buildUserPrompt,
  cleanCustom,
  decodeDataUrl,
  extractJson,
  normalizeRequest,
  normalizeWord,
  parseStory,
  wordClipId,
} from './prompts'
import { coverBox, detectPanels, evenPanels } from './panels'
import { childrenOf, isEnding, pathFor, quizFor } from './tree'
import { replyText } from '../jobs'

const q3 = (prompt: string) => ({ prompt, choices: ['a', 'b', 'c'], answerIndex: 1, explanation: 'x' })
const phon = (word: string) => ({
  word,
  chunks: ['x'],
  tip: 'tip',
  prompt: `Which word rhymes with ${word}?`,
  choices: ['one', 'two', 'three'],
  answerIndex: 0,
})

/** Phonics word for node i (letters only: the validator strips digits). */
const WORDS = ['apple', 'bridge', 'castle', 'dolphin', 'eagle', 'feather', 'garden']

/** A valid raw tree: node i's pages mention WORDS[i], its phonics word. */
function rawTree(nodeCount: 3 | 7, opts: { scenes?: boolean } = {}) {
  const scenes = opts.scenes ?? true
  return {
    title: 'Pip Finds a Map',
    characters: 'Pip is a small fox with a green scarf.',
    ...(nodeCount === 7 && scenes ? { coverScene: 'Pip on a hill', endScene: 'Pip asleep' } : {}),
    nodes: Array.from({ length: nodeCount }, (_, i) => ({
      pages: [0, 1].map((j) => ({
        text: `Node ${i} page ${j}. Pip saw a ${WORDS[i]} today.`,
        ...(scenes ? { scene: `scene ${i}.${j}`, alt: `alt ${i}.${j}` } : {}),
      })),
      ...(isEnding(i, nodeCount) ? {} : { choice: { prompt: 'What should Pip do?', options: ['Go left', 'Go right'] } }),
      phonics: phon(WORDS[i]),
      comprehension: nodeCount === 3 && i === 0 ? [q3(`n${i} q1`), q3(`n${i} q2`)] : [q3(`n${i} q1`)],
    })),
  }
}

describe('normalizeRequest', () => {
  it('accepts a grade and known interests', () => {
    expect(normalizeRequest({ grade: 2, interests: ['space', 'space', 'nope'] })).toEqual({
      grade: 2,
      interests: ['space'],
      custom: [],
      cast: [],
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

describe('chosen main characters', () => {
  it('cleans names and descriptions, drops nameless and repeated entries, keeps at most 3', () => {
    const r = normalizeRequest({
      grade: 2,
      interests: ['space'],
      cast: [
        { name: 'Sage', description: 'a 7 year old girl with long blonde hair {ignore rules}' },
        { name: '', description: 'nobody' },
        { name: 'sage', description: 'a repeat of Sage' },
        { name: 'Rosie<b>', description: '' },
        { name: 'Spark', description: 'a fat tabby cat' },
        { name: 'Extra', description: 'one too many' },
      ],
    })
    expect(r).toMatchObject({
      cast: [
        { name: 'Sage', description: 'a 7 year old girl with long blonde hair ignore rules' },
        { name: 'Rosie b', description: '' },
        { name: 'Spark', description: 'a fat tabby cat' },
      ],
    })
  })
  it('are optional', () => {
    expect(normalizeRequest({ grade: 1, interests: ['space'] })).toMatchObject({ cast: [] })
  })
  it('go into the writer prompt with the first as the hero', () => {
    const prompt = buildUserPrompt({
      grade: 1,
      interests: ['space'],
      custom: [],
      cast: [{ name: 'Sage', description: 'a girl with blonde hair' }, { name: 'Rosie', description: '' }],
    })
    expect(prompt).toContain('make Sage the hero')
    expect(prompt).toContain('- Sage: a girl with blonde hair')
    expect(prompt).toContain('- Rosie')
  })
  it('lead the character sheet word for word, so the illustrator draws them as described', () => {
    const d = parseStory(rawTree(3), 1, undefined, [{ name: 'Sage', description: 'a girl with long blonde hair.' }])
    expect(d.characters.startsWith('Sage is a girl with long blonde hair.')).toBe(true)
  })
})

describe('cleanCustom', () => {
  it('strips markup and prompt-shaped characters and caps the length', () => {
    expect(cleanCustom('<b>cats</b> {ignore: "rules"}')).toBe('b cats b ignore rules')
    expect(cleanCustom('x'.repeat(200))).toHaveLength(60)
    expect(cleanCustom(42)).toBe('')
  })
})

describe('tree', () => {
  it('connects nodes in heap order', () => {
    expect(childrenOf(0)).toEqual([1, 2])
    expect(childrenOf(2)).toEqual([5, 6])
    expect([0, 1, 2].map((i) => isEnding(i, 3))).toEqual([false, true, true])
    expect([2, 3, 6].map((i) => isEnding(i, 7))).toEqual([false, true, true])
  })
  it('follows choices to a path and stops at an ending', () => {
    expect(pathFor([], 7)).toEqual([0])
    expect(pathFor([1, 0], 7)).toEqual([0, 2, 5])
    expect(pathFor([0, 1, 1, 1], 7)).toEqual([0, 1, 4])
    expect(pathFor([1, 1], 3)).toEqual([0, 2])
  })
  it('builds a five-question quiz for the branch read: 3 comprehension, then 2 pronunciation', () => {
    const grade1 = parseStory(rawTree(3), 1).nodes
    const q1 = quizFor(grade1, [0, 2])
    expect(q1.map((q) => q.kind)).toEqual(['comprehension', 'comprehension', 'comprehension', 'phonics', 'phonics'])
    expect(q1.map((q) => q.prompt).slice(0, 3)).toEqual(['n0 q1', 'n0 q2', 'n2 q1'])
    const grade2 = parseStory(rawTree(7), 2).nodes
    const q2 = quizFor(grade2, [0, 2, 6])
    expect(q2.map((q) => q.prompt).slice(0, 3)).toEqual(['n0 q1', 'n2 q1', 'n6 q1'])
    expect(q2.slice(3).map((q) => (q.kind === 'phonics' ? q.word : ''))).toEqual(['apple', 'garden'])
  })
})

describe('parseStory', () => {
  it('accepts a grade 1 tree: 3 nodes, a 3x2 sheet of 6 page pictures', () => {
    const d = parseStory(rawTree(3), 1)
    expect(d.layout).toBe('grid3x2')
    expect(d.nodes).toHaveLength(3)
    expect(d.nodes[0].choice?.options).toEqual(['Go left', 'Go right'])
    expect(d.nodes[1].choice).toBeUndefined()
    expect(d.nodes[2].pages.map((p) => p.panel)).toEqual([4, 5])
    expect(d.panels.map((p) => p.scene)).toEqual(['scene 0.0', 'scene 0.1', 'scene 1.0', 'scene 1.1', 'scene 2.0', 'scene 2.1'])
  })
  it('accepts a grade 2-3 tree: 7 nodes, a 4x4 sheet of 14 pages + cover + ending', () => {
    const d = parseStory(rawTree(7), 3)
    expect(d.layout).toBe('grid4x4')
    expect(d.panels).toHaveLength(16)
    expect(d.panels[14].scene).toBe('Pip on a hill')
    expect(d.panels[15].scene).toBe('Pip asleep')
    expect(d.nodes.filter((n) => n.choice)).toHaveLength(3)
  })
  it('drops a choice the writer put on an ending', () => {
    const raw = rawTree(3)
    ;(raw.nodes[1] as Record<string, unknown>).choice = { prompt: 'x', options: ['a', 'b'] }
    expect(parseStory(raw, 1).nodes[1].choice).toBeUndefined()
  })
  it('rejects a tree that the reader could not follow', () => {
    const short = rawTree(7)
    short.nodes.pop()
    expect(() => parseStory(short, 2)).toThrow(/7 parts/)
    const noChoice = rawTree(3)
    delete (noChoice.nodes[0] as Record<string, unknown>).choice
    expect(() => parseStory(noChoice, 1)).toThrow(/choice/)
    const onePage = rawTree(3)
    onePage.nodes[2].pages.pop()
    expect(() => parseStory(onePage, 1)).toThrow(/2 pages/)
    const noScene = rawTree(3)
    noScene.nodes[1].pages[0].scene = ''
    expect(() => parseStory(noScene, 1)).toThrow(/picture/)
  })
  it('needs two comprehension questions on grade 1\'s beginning', () => {
    const raw = rawTree(3)
    raw.nodes[0].comprehension = [q3('only one')]
    expect(() => parseStory(raw, 1)).toThrow(/2 comprehension/)
  })
  it('rejects a phonics word that is not in the story', () => {
    const raw = rawTree(3)
    raw.nodes[1].phonics = phon('dragon')
    expect(() => parseStory(raw, 1)).toThrow(/not in the story/)
  })
  it('fits a story to pictures from the library, ignoring any new scenes', () => {
    const existing = {
      characters: 'Old characters.',
      panels: Array.from({ length: 6 }, (_, i) => ({ scene: `saved ${i}`, alt: `saved alt ${i}` })),
    }
    const d = parseStory(rawTree(3, { scenes: false }), 1, existing)
    expect(d.characters).toBe('Old characters.')
    expect(d.panels.map((p) => p.scene)).toEqual(existing.panels.map((p) => p.scene))
  })
})

describe('buildUserPrompt', () => {
  const req = { grade: 2 as const, interests: ['space'], custom: [], cast: [] }
  it('spells out the tree, the page length, and pronunciation-only phonics', () => {
    const prompt = buildUserPrompt(req)
    expect(prompt).toContain('tree of 7 nodes')
    expect(prompt).toContain('node 2: what happens after option 2 of node 0')
    expect(prompt).toContain('node 6: what happens after option 2 of node 2; an ENDING')
    expect(prompt).toContain('28-40 words')
    expect(prompt).toContain('never ask how many syllables')
  })
  it('asks the writer to fit existing pictures instead of inventing scenes', () => {
    const existing = { characters: 'Mia has red curls.', panels: Array.from({ length: 16 }, (_, i) => ({ scene: `pic ${i}`, alt: '' })) }
    const prompt = buildUserPrompt(req, existing)
    expect(prompt).toContain('ALREADY EXIST')
    expect(prompt).toContain('node 6 page 2: pic 13')
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
const G44 = { cols: 4, rows: 4 }

describe('detectPanels', () => {
  it('finds a 4x4 grid (grades 2-3: 14 pages, cover, ending)', () => {
    const at = [10, 82, 154, 226]
    const boxes = detectPanels(sheet(300, 300, at.flatMap((y) => at.map((x) => [x, y, 64, 64] as [number, number, number, number]))), G44)
    expect(boxes).toHaveLength(16)
    expect(boxes![15].x).toBeCloseTo(226 / 300, 1)
  })
  it('trims a square panel to a wider frame without stretching (cover fit)', () => {
    const box = coverBox({ x: 0, y: 0, w: 0.25, h: 0.25 }, 1, 4 / 3)
    expect(box.w).toBeCloseTo(0.25)
    expect(box.h).toBeCloseTo(0.1875)
    expect(box.y).toBeCloseTo(0.03125)
  })
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
