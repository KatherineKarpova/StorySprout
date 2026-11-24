#!/usr/bin/env node
/**
 * Export one generated story as the public sample at /demo.
 *
 *   node scripts/export-demo.mjs <storyId>
 *
 * Reads the story record from the LOCAL dev database (.wrangler state, made
 * by `deepspace dev`), downloads its panel sheet and Hope's phonics clips
 * from the owner's private app files with the DeepSpace CLI, rewrites their
 * paths to /demo/..., and writes public/demo/. Those become static assets on
 * the next deploy, so the sample costs nothing to serve. Run as the owner.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const storyId = process.argv[2]
if (!storyId) {
  console.error('usage: node scripts/export-demo.mjs <storyId>')
  process.exit(1)
}

const roomDir = '.wrangler/state/v3/do/storysprout-AppRecordRoom'
const dbFile = readdirSync(roomDir).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
if (!dbFile) throw new Error(`no local record database in ${roomDir}; run deepspace dev first`)
const db = new DatabaseSync(join(roomDir, dbFile), { readOnly: true })
const row = db.prepare('SELECT * FROM c_stories WHERE _row_id = ?').get(storyId)
if (!row) throw new Error(`story ${storyId} not found locally`)
if (row.col_status !== 'ready') throw new Error(`story ${storyId} is ${row.col_status}, not ready`)

const json = (v) => (v == null ? [] : JSON.parse(v))
const story = {
  title: row.col_title,
  grade: row.col_grade,
  interests: json(row.col_interests),
  status: 'ready',
  progressMessage: '',
  paragraphs: json(row.col_paragraphs),
  imagePaths: json(row.col_imagepaths),
  imageAlts: json(row.col_imagealts),
  imageSlots: [],
  imageLayout: row.col_imagelayout ?? '',
  questions: json(row.col_questions),
  checkpoints: json(row.col_checkpoints),
  soundWords: json(row.col_soundwords),
  wordCount: row.col_wordcount,
  error: '',
}

const outDir = 'public/demo'
mkdirSync(outDir, { recursive: true })

/** "/api/files/apps/<app>/users/<user>/stories/<id>/x.png?scope=self" → "/demo/x.png" */
function localize(path) {
  if (!path) return path
  const m = /\/users\/[^/]+\/(stories\/[^?]+)/.exec(path)
  if (!m) throw new Error(`unexpected file path ${path}`)
  const name = basename(m[1])
  execFileSync('npx', ['deepspace', 'app', 'files', 'get', '--private', m[1], `--out=${join(outDir, name)}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  return `/demo/${name}`
}

story.imagePaths = story.imagePaths.map(localize)
story.checkpoints = story.checkpoints.map((c) => ({ ...c, audioPath: c.audioPath && localize(c.audioPath) }))
story.soundWords = story.soundWords.map((w) => ({ ...w, audioPath: w.audioPath && localize(w.audioPath) }))
writeFileSync(join(outDir, 'story.json'), JSON.stringify(story, null, 2) + '\n')
console.log(`exported "${story.title}" to ${outDir}/`)
