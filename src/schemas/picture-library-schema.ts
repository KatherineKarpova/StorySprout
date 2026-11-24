import type { CollectionSchema } from 'deepspace/schema'

/**
 * Picture library: every picture sheet painted for a story whose topics are
 * all catalog interests (never a child's typed idea, which may be personal)
 * is saved here with its character sheet and per-panel scenes. A later story
 * with the same tree size and exactly the same interests reuses a whole
 * sheet the reader has not seen: Claude writes a new story to fit the
 * existing pictures and no image is generated. Whole sheets, because one
 * grid image costs the same for 1 panel or 16, so only full reuse saves.
 * Server-only (job + actions, RBAC-off), like word_clips.
 */
export const pictureLibrarySchema: CollectionSchema = {
  name: 'picture_library',
  columns: [
    /** 'tree3' (grade 1) or 'tree7' (grades 2-3): the sheet's shape. */
    { name: 'band', storage: 'text', interpretation: 'plain', maxLength: 10 },
    /** Sorted catalog interest ids joined with '+', e.g. "dinosaurs+space". */
    { name: 'interestsKey', storage: 'text', interpretation: 'plain', maxLength: 200 },
    { name: 'layout', storage: 'text', interpretation: 'plain', maxLength: 20 },
    { name: 'characters', storage: 'text', interpretation: 'plain', maxLength: 400 },
    /** [{ scene, alt }] per panel, in panel order. */
    { name: 'panels', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'sheetPath', storage: 'text', interpretation: 'plain', maxLength: 300 },
    { name: 'sourceStoryId', storage: 'text', interpretation: 'plain', maxLength: 64 },
    { name: 'uses', storage: 'number', interpretation: 'plain' },
  ],
  permissions: {
    viewer: { read: false, create: false, update: false, delete: false },
    member: { read: false, create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
