/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'developer': The app owner pays (default).
 * - 'user': The calling user pays.
 *
 * Every integration requires a signed-in caller. Set `anonymous: true` on a
 * 'developer' integration to let signed-out visitors call it too — the owner
 * then pays for anyone who can reach the app.
 *
 * Integrations not listed here default to 'developer' with sign-in required.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject. With 'developer' the app owner's JWT is forwarded, so every
 * signed-in user connects and acts on the app owner's account. Server code
 * that acts for a user in the background (e.g. a cron job) uses
 * `callComposio(env, ..., { asUser })` from 'deepspace/worker' instead.
 */

export const integrations: Record<
  string,
  {
    billing: 'developer' | 'user'
    anonymous?: boolean
    /**
     * StorySprout addition: refuse this integration on the browser proxy
     * (/api/integrations/*, src/server/http-routes.ts). Server actions, jobs
     * and cron still call it through `tools.integration`.
     */
    serverOnly?: boolean
  }
> = {
  google: { billing: 'user' },
  composio: { billing: 'user' },
  // StorySprout's readers are 6-8 year olds with no DeepSpace credits, so the
  // owner pays. These are called only from the generate-story job, which only
  // the capped `startStory` action can enqueue — never from the browser.
  anthropic: { billing: 'developer', serverOnly: true }, // story + quiz text
  gemini: { billing: 'developer', serverOnly: true }, // two illustrations per story
  elevenlabs: { billing: 'developer', serverOnly: true }, // spoken practice words
}
