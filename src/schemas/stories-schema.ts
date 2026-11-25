import type { CollectionSchema } from 'deepspace/schema'

/**
 * Generated stories. Rows are written only by the `startStory` server action
 * and the `generate-story` job (both RBAC-off), never by the client: a
 * client-created row would skip the daily cap and the paid pipeline's
 * validation. Each reader sees only the stories they started.
 */
export const storiesSchema: CollectionSchema = {
  name: 'stories',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain', maxLength: 120 },
    { name: 'grade', storage: 'number', interpretation: 'plain' },
    { name: 'interests', storage: 'text', interpretation: { kind: 'json' } },
    {
      name: 'status',
      storage: 'text',
      interpretation: {
        kind: 'select',
        options: ['queued', 'writing', 'illustrating', 'recording', 'ready', 'failed'],
      },
    },
    { name: 'progressMessage', storage: 'text', interpretation: 'plain', maxLength: 200 },
    /** The story tree (StoryNode[] in heap order): pages, choices, questions. */
    { name: 'nodes', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'imagePaths', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'imageAlts', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'imageLayout', storage: 'text', interpretation: 'plain', maxLength: 20 },
    { name: 'libraryId', storage: 'text', interpretation: 'plain', maxLength: 64 },
    { name: 'paidBy', storage: 'text', interpretation: { kind: 'select', options: ['owner', 'reader'] } },
    /** Optional main characters the reader chose ([{ name, description }]). */
    { name: 'cast', storage: 'text', interpretation: { kind: 'json' } },
    // Reader's own character descriptions + the writer's sheet (capped at 600).
    { name: 'characters', storage: 'text', interpretation: 'plain', maxLength: 1000 },
    { name: 'scenes', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'hiRes', storage: 'number', interpretation: { kind: 'boolean' } },
    { name: 'wordCount', storage: 'number', interpretation: 'plain' },
    { name: 'error', storage: 'text', interpretation: 'plain', maxLength: 500 },
  ],
  permissions: {
    viewer: { read: 'own', create: false, update: false, delete: false },
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
