/**
 * Product analytics (PostHog), used to learn whether people come back.
 *
 * Privacy, by design:
 *   - Off unless VITE_POSTHOG_KEY is set. Without it every call here does nothing.
 *   - No cookies: an anonymous random id is kept in this browser's localStorage.
 *   - Only the events named below. No automatic click capture, no page-view capture,
 *     no session recordings, no surveys. Do Not Track is respected.
 *   - Never any story text, premises, names, emails or codes: only counts, ids that
 *     are random to begin with (story ids), and simple labels.
 *
 * Events (see README → Analytics):
 *   app_opened        { days_since_last_visit, stories }
 *   story_started     { story_id, photos, players }
 *   story_start_failed{ reason }
 *   story_opened      { story_id, turns, shared, days_since_last_played }
 *   turn_played       { story_id, turn, choice: 'suggested' | 'own', shared }
 *   invite_created    {}
 *   world_joined      {}
 *   sign_in_link_sent {}
 */
const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
const LAST_VISIT = 'reve-ai:last-visit';

let ready = null;

function load() {
  if (!KEY || typeof window === 'undefined') return null;
  ready ??= import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(KEY, {
        api_host: HOST,
        persistence: 'localStorage',
        autocapture: false,
        capture_pageview: false,
        capture_pageleave: false,
        disable_session_recording: true,
        disable_surveys: true,
        respect_dnt: true,
        person_profiles: 'identified_only',
      });
      return posthog;
    })
    .catch((err) => {
      console.warn('[analytics] could not load', err?.message);
      return null;
    });
  return ready;
}

/** Record one event. Never throws and never waits on the network. */
export function track(event, props = {}) {
  const p = load();
  if (!p) return;
  p.then((posthog) => posthog?.capture(event, props)).catch(() => {});
}

const daysBetween = (from, to = Date.now()) => Math.max(0, Math.floor((to - new Date(from).getTime()) / 86400000));

/** Once per page load: an "app opened" event that says how long it has been since the last visit. */
export function trackAppOpened(storyCount) {
  let last = null;
  try {
    last = localStorage.getItem(LAST_VISIT);
    localStorage.setItem(LAST_VISIT, new Date().toISOString());
  } catch { /* storage blocked: still count the visit */ }
  track('app_opened', { days_since_last_visit: last ? daysBetween(last) : null, stories: storyCount });
}

export { daysBetween };

/** A solo story's random id is fine to send; a shared world's id contains its invite code, so it never is. */
export const storyKey = (id) => (typeof id === 'string' && !id.startsWith('w-') ? id : null);
