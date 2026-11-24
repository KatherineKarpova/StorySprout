import type { CollectionSchema } from 'deepspace/schema'

/**
 * One row per paid word recording, so `sayWord` can cap new recordings per
 * reader and app-wide per UTC day. Server-only, like word_clips.
 */
export const usageSchema: CollectionSchema = {
  name: 'usage',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', maxLength: 64 },
    { name: 'day', storage: 'text', interpretation: 'plain', maxLength: 10 },
    { name: 'kind', storage: 'text', interpretation: 'plain', maxLength: 20 },
  ],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
