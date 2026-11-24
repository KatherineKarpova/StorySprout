import type { CollectionSchema } from 'deepspace/schema'

/**
 * App-wide pronunciation cache for tapped words: one row per (voice, word),
 * keyed by `wordClipId`, pointing at a public mp3 in the app's file storage.
 * A word is paid for the first time anyone taps it and is free after that.
 * Read and written only by the `sayWord` action (RBAC-off); no client role
 * can touch it, so nobody can point a word at a different file.
 */
export const wordClipsSchema: CollectionSchema = {
  name: 'word_clips',
  columns: [
    { name: 'word', storage: 'text', interpretation: 'plain', maxLength: 24 },
    { name: 'voiceId', storage: 'text', interpretation: 'plain', maxLength: 64 },
    { name: 'path', storage: 'text', interpretation: 'plain', maxLength: 300 },
  ],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
