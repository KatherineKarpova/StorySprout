import type { CollectionSchema } from 'deepspace/schema'

/**
 * One row per finished quiz. Written by the reader's own client, so only the
 * fields a quiz produces are writable, and only by their creator.
 */
export const quizAttemptsSchema: CollectionSchema = {
  name: 'quiz_attempts',
  columns: [
    { name: 'storyId', storage: 'text', interpretation: 'plain', required: true, maxLength: 64 },
    { name: 'answers', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'correct', storage: 'number', interpretation: 'plain' },
    { name: 'total', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: {
      read: 'own',
      create: true,
      update: false,
      delete: 'own',
      writableFields: ['storyId', 'answers', 'correct', 'total'],
    },
    admin: { read: true, create: true, update: false, delete: true },
  },
}
