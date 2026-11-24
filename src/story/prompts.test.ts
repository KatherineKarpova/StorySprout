import { describe, expect, it } from 'vitest'
import { cleanCustom, decodeDataUrl, extractJson, normalizeRequest, parseStoryDraft } from './prompts'
import { replyText } from '../jobs'

const goodDraft = () => ({
  title: 'Dot and the Moon Rocket',
  paragraphs: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'],
  illustrations: [
    { afterParagraph: 1, prompt: 'A girl builds a rocket', alt: 'Dot with a cardboard rocket' },
    { afterParagraph: 4, prompt: 'Rocket lands on the moon', alt: 'The rocket on the moon' },
  ],
  phonics: {
    word: 'rocket',
    chunks: ['rock', 'et'],
    tip: 'The "ck" makes one /k/ sound.',
    prompt: 'What sound does "ck" make in rocket?',
    choices: ['/k/', '/s/', '/ch/'],
    answerIndex: 0,
  },
  comprehension: [
    { prompt: 'What did Dot build?', choices: ['A boat', 'A rocket', 'A kite'], answerIndex: 1, explanation: 'She built a rocket.' },
    { prompt: 'Why was Dot proud?', choices: ['a', 'b', 'c'], answerIndex: 2, explanation: 'x' },
  ],
  soundWords: [
    { word: 'planet', chunks: ['plan', 'et'] },
    { word: 'Rocket', chunks: ['rock', 'et'] }, // duplicate of the phonics word: dropped
  ],
})

describe('normalizeRequest', () => {
  it('accepts a grade and known interests', () => {
    expect(normalizeRequest({ grade: 2, interests: ['space', 'space', 'nope'] })).toEqual({
      grade: 2,
      interests: ['space'],
      custom: '',
    })
  })
  it('rejects a missing grade and an empty choice', () => {
    expect(normalizeRequest({ interests: ['space'] })).toHaveProperty('error')
    expect(normalizeRequest({ grade: 1, interests: [] })).toHaveProperty('error')
  })
  it('allows a custom idea on its own', () => {
    expect(normalizeRequest({ grade: 3, custom: 'volcanoes' })).toMatchObject({ custom: 'volcanoes' })
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
  it('builds phonics-first questions and drops duplicate sound words', () => {
    const d = parseStoryDraft(goodDraft())
    expect(d.questions.map((q) => q.kind)).toEqual(['phonics', 'comprehension', 'comprehension'])
    expect(d.soundWords.map((w) => w.word)).toEqual(['planet'])
    expect(d.illustrations.map((i) => i.afterParagraph)).toEqual([1, 4])
  })
  it('rejects an answer index outside the choices', () => {
    const raw = goodDraft()
    raw.comprehension[0].answerIndex = 5
    expect(() => parseStoryDraft(raw)).toThrow(/answer/)
  })
  it('requires exactly two illustrations', () => {
    const raw = goodDraft()
    raw.illustrations.pop()
    expect(() => parseStoryDraft(raw)).toThrow(/two illustrations/)
  })
  it('repairs out-of-range and colliding picture positions', () => {
    const raw = goodDraft()
    raw.illustrations[0].afterParagraph = 99
    raw.illustrations[1].afterParagraph = 1
    const d = parseStoryDraft(raw)
    const [a, b] = d.illustrations.map((i) => i.afterParagraph)
    expect(a).not.toBe(b)
    expect(Math.max(a, b)).toBeLessThan(raw.paragraphs.length)
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
