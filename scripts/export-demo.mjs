#!/usr/bin/env node
/**
 * Export one generated story as the public sample at /demo.
 *
 *   node scripts/export-demo.mjs <storyId>
 *
 * Reads the story record from the LOCAL dev database (.wrangler state, made
 * by `deepspace dev`), downloads its picture sheet (private, or from the
 * public picture library) and Hope's phonics clips with the DeepSpace CLI,
 * rewrites their paths to /demo/..., and writes public/demo/. Those become static assets on
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
  nodes: json(row.col_nodes),
  imagePaths: json(row.col_imagepaths),
  imageAlts: json(row.col_imagealts),
  imageLayout: row.col_imagelayout ?? '',
  libraryId: '',
  wordCount: row.col_wordcount,
  error: '',
}
if (!story.nodes.length) throw new Error(`story ${storyId} has no story tree (made before choose-your-own-adventure)`)

const outDir = 'public/demo'
mkdirSync(outDir, { recursive: true })

/**
 * "/api/files/apps/<app>/users/<user>/stories/<id>/x.mp3?scope=self" (private)
 * or "/api/files/apps/<app>/library/<id>.png?scope=app" (picture library)
 * → "/demo/<file>", downloaded next to story.json.
 */
function localize(path) {
  if (!path) return path
  const own = /\/users\/[^/]+\/(stories\/[^?]+)/.exec(path)
  const shared = /\/apps\/[^/]+\/(library\/[^?]+)/.exec(path)
  const key = own?.[1] ?? shared?.[1]
  if (!key) throw new Error(`unexpected file path ${path}`)
  const name = basename(key)
  const args = ['deepspace', 'app', 'files', 'get', ...(own ? ['--private'] : []), key, `--out=${join(outDir, name)}`]
  // npx is npx.cmd on Windows, which needs a shell; the arguments are fixed
  // strings and keys from our own records, never user input.
  execFileSync('npx', args, { stdio: 'inherit', shell: process.platform === 'win32' })
  return `/demo/${name}`
}

story.imagePaths = story.imagePaths.map(localize)
story.nodes = story.nodes.map((n) => ({
  ...n,
  phonics: { ...n.phonics, audioPath: n.phonics.audioPath && localize(n.phonics.audioPath) },
}))
writeFileSync(join(outDir, 'story.json'), JSON.stringify(story, null, 2) + '\n')
console.log(`exported "${story.title}" to ${outDir}/`)
