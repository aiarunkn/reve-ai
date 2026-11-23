# Reve AI

*Rêve* is French for "dream". Reve AI is a personal interactive universe: you live stories you couldn’t
live anywhere else, your decisions have lasting consequences, and the world remembers you when you come back.

**Insight:** people don’t just want to generate worlds; they want to live experiences they couldn’t otherwise have.

### Stories (the heart of the app)
- **One line to begin**: type where you want to be ("a candlelit common room under a lake, past midnight") and press
  Enter. The narrator builds a small, coherent world and drops you into that exact place, with someone in the room.
- **Played like a visual novel**: the place fills the screen, whoever you're talking to stands in it, and the scene
  plays one line at a time (tap, Space or Enter to continue). At the end of each scene: three replies, or say
  something else. The narrator writes in beats (`Name: line` for dialogue) and always picks up exactly where the last line ended.
- **Sound**: the story's feeling plus the place itself (fireplace, rain, wind, water, a distant crowd), on by default.
- **Begin with a premise**, e.g. *"1920s Paris: my best friend and I are rival artists."* Create your own character
  (name, look, what they want, a secret), optionally a friend who plays alongside you, and up to five photos that
  become real places.
- **The narrator casts the world**: setting, places, 3–5 characters with their own goals and secrets, open threads,
  and chapter one.
- **Play**: write what you do, or pick one of three suggested moves. Narration streams in like a book.
- **Lasting consequences**: every turn records consequences ("Théo knows you tried to destroy your best work"),
  relationship changes, canon facts and opened/closed threads into a ledger the narrator always reads.
- **Come back weeks later**: a "Previously…" recap, and the world has moved on a little while you were away.
- **Illustrated**: places and character portraits are painted by an image model in one consistent style
  (cached once per story), and any passage can be illustrated with "Illustrate this moment".
- **Sound**: a generative ambient soundscape for the story's feeling.
- **Journal**: the cast and where you stand with each of them, open threads, your choices next to their
  consequences, places, and players.
- **Dream together**: tap the invite button in any story to get a 6-letter code (like a game lobby).
  Friends type the code or open the link, pick a name and a color, and wake up in the same world.
  Everyone plays their own scenes at their own pace, but the canon is shared: what one player does
  ripples into everyone else's story ("Meanwhile, Aya…"). See **Shared worlds** below.

### Also in Reve
- **Worlds**: photos and a description become a place with one character you talk to, who remembers you.

```bash
npm install
npm run dev
```

## Structure

```
src/
  App.jsx                    routing (#/, #/story/<id>, #/world/<id>, #/w/<CODE>), creation flows
  data/moods.js              the five feelings: palette, icon, weather particles
  shared/worldState.js       the story ledger and shared-world view, used by browser and server
  services/storyStore.js     solo stories in IndexedDB (assetStore) + the story index
  services/storyArt.js       place, portrait and moment pictures, shared-world picture cache
  services/scenes.js         narration → visual-novel beats, place sounds
  services/memoryGenerator.js  photo → painterly image (local canvas pipeline + AI hook)
  services/imageUtils.js     resizing photos before they're sent
  services/ambientAudio.js   Web Audio generative soundscapes, one per feeling
  services/assetStore.js     IndexedDB storage for stories and pictures
  services/worldStore.js     imagined worlds (localStorage + IndexedDB)
  services/authClient.js     one Supabase client for the app: session, magic-link sign-in, authHeaders()
  components/
    WorldMap.jsx (home), StoryCover.jsx, StoryView.jsx, StoryJournal.jsx, InviteSheet.jsx
    WorldView.jsx, WorldPanels.jsx, WorldChat.jsx, CreateWorldModal.jsx
    WeavingOverlay.jsx, JoinWorld.jsx, SignInSheet.jsx, AccountMenu.jsx, ParticleCanvas.jsx
api/story.js                 the narrator (Claude)
api/reve.js                  world characters (Claude)
api/media.js                 pictures (OpenAI) and photos of places (Pexels/Openverse)
api/shared.js, api/_db.js, api/_art.js   shared worlds + the shared picture cache (Supabase)
api/_auth.js, api/_limits.js  who's calling (account or guest) and per-day rate limits
supabase/schema.sql, supabase/migrations/  creates/updates the tables, functions and Storage bucket
test/                        node --test, mocking @supabase/supabase-js and @anthropic-ai/sdk
```

## Waking up the characters (Anthropic API key)

Stories run through `api/story.js` (the narrator) and worlds through `api/reve.js`: Vercel serverless functions
that call Claude (`claude-opus-5-5`) with the official Anthropic SDK. The key stays on the server.

1. Create a key at **console.anthropic.com** → API Keys (pay-as-you-go).
2. **On Vercel:** Project → Settings → Environment Variables → `ANTHROPIC_API_KEY`, then redeploy.
   **Locally:** put `ANTHROPIC_API_KEY=...` in `.env.local` and restart `npm run dev`.

Without a key, you can still create a world: its scenes are painted, but its inhabitant stays "asleep"
until a key is added. If a reply is ever declined by Claude's safety classifiers, the API automatically
retries it on a fallback model (`fallbacks: "default"`).

**Cost:** world creation reads up to 5 photos once; each chat message sends the character sheet, their
memory and recent conversation (cached between turns). To spend less, switch `MODEL` in `api/reve.js`
to `claude-haiku-5-5`. Stories (`api/story.js`) are rate-limited per account/guest device — see **Login +
rate limits** below. Worlds (`api/reve.js`, the photo-and-description feature above) aren't yet: before
sharing that feature's URL publicly, add rate limiting or put it behind a login too.

## Shared worlds (Supabase)

One desired reality, many players. Each player lives their own scenes; the world's canon (facts,
relationships, open threads, chapter) is the fold of everyone's turns, so two friends playing at the
same moment never overwrite each other. The narrator reads what the others did lately and lets it
ripple into your scene through rumours, objects and moods.

1. Create a free project at **supabase.com**.
2. Supabase → **SQL Editor** → New query → paste `supabase/schema.sql` → **Run**.
3. Supabase → **Project Settings → API**: copy the Project URL, the `anon` key and the `service_role` key.
4. **Vercel** → Settings → Environment Variables:
   - `SUPABASE_URL` = Project URL, `SUPABASE_SERVICE_ROLE_KEY` = service_role key (server only, never `VITE_`)
   - `VITE_SUPABASE_URL` = Project URL, `VITE_SUPABASE_ANON_KEY` = anon key (live pings + who's online)
   Then redeploy. Locally, put the same four lines in `.env.local`.

How it fits together:
- `src/shared/worldState.js` — pure functions both sides use: the shared ledger fold, one player's view, codes.
- `api/shared.js` — `peek` / `create` (open up a solo story) / `join` (the narrator writes your arrival) / `load`
  / `art` / `claimArt` / `putArt` (the shared picture cache, below).
- `api/story.js` → `turn` with `{ shared }` — loads the world on the server, narrates, saves the turn.
- `src/services/sharedClient.js` — identity per world (localStorage), live channel, invite links (`#/w/CODE`).
- Only the server touches the tables (row level security is on with no policies). The browser's anon key
  is used only for Realtime broadcast/presence on the `world:<CODE>` channel, and for signing in (below).
- A world's places and portraits are painted once for everyone, not once per device — see **Shared
  picture cache** below.

**Cost safety:** every call is rate-limited per signed-in account or per guest device — see **Login +
rate limits** below.

### Shared picture cache

When three friends are in a world, each place and portrait is painted once, not three times.

- A private Storage bucket `world-art` holds the files, at `w/<CODE>/<kind>.<ext>` (`place0…7`,
  `portrait0…7`, `moment<turn>`, plus `credit<i>` — a place's photo credit, stored as JSON the same way).
- A table `world_art` tracks one row per `(world, kind)`: `painting` | `ready` | `failed`, who claimed it,
  and where its file lives. The Postgres function `claim_art()` makes claiming atomic: if nobody has
  started that picture, you get the claim; if someone did less than 3 minutes ago, you're told to wait
  (a claim older than that can be reclaimed, in case a tab was closed mid-paint); if it's already `ready`,
  you get a short-lived signed URL straight away.
- `src/services/storyArt.js`: before painting any kind in a shared world, a device checks its own
  IndexedDB cache, then asks the server for the ready pictures (`art`), then tries to `claimArt`. If it
  gets the claim, it paints exactly as a solo story would, uploads the result (`putArt`), and caches it
  locally. If told to wait, it polls every 5s for up to 90s, then falls back to painting its own local-only
  copy (without uploading) so nobody is stuck looking at a gradient forever.
- Opening a solo story up to friends (`shareStory`) offers any pictures that device already painted to
  the new shared cache, so friends don't repaint them.
- Image generation only counts against the `image` rate limit for the device that actually paints —
  downloading a cached picture is free.

## Login + rate limits (Supabase Auth)

One viral post shouldn't be able to drain the Anthropic/OpenAI credits, and every player should have an
account that can be emailed and billed later. Reve uses **Supabase Auth with email magic links — no
passwords.** Guests can still try everything, up to a small daily allowance; past that, the app opens a
"Keep dreaming — sign in with your email" sheet.

Setup (uses the same Supabase project as **Shared worlds** above):

1. Supabase → **Authentication → URL Configuration**: set the **Site URL** to your deployed URL (e.g.
   `https://reve-ai-2rim.vercel.app`), and add it (plus `http://localhost:5173` for local dev) to
   **Redirect URLs**.
2. **Before launch, set up a custom SMTP provider** (Authentication → Settings → SMTP), for example
   [Resend](https://resend.com). Supabase's built-in email sender is heavily rate-limited and will not
   hold up once real people start signing in.
3. **Vercel** → Settings → Environment Variables → `RATE_LIMIT_SALT` = any long random string (server
   only). It's hashed together with a guest's IP so the app can rate-limit guests without ever storing a
   raw IP address.
4. Optional overrides (server only, JSON):
   - `RATE_LIMITS` — per-kind, per-day limits. Defaults: `turn` 150/15 (signed-in/guest), `world` 6/1,
     `join` 10/2, `image` 60/10, `recap` 40/5. Example:
     `RATE_LIMITS={"turn":{"signedIn":300},"image":{"guest":5}}`
   - `GLOBAL_DAILY_CAPS` — a per-kind ceiling across *everyone*, as a circuit breaker. Example:
     `GLOBAL_DAILY_CAPS={"turn":20000}`.

How it fits together:
- `api/_auth.js` — `identify(req)`: a valid bearer token resolves to the signed-in account; anything
  else (no token, or an invalid/expired one) is a guest, keyed by `sha256(ip + RATE_LIMIT_SALT)`. An
  invalid token is never mistaken for someone else's account.
- `api/_limits.js` — `enforce(req, kind)` checks and atomically consumes one unit of that day's quota
  (via the `bump_usage()` Postgres function) *before* the matching Claude/OpenAI call, in
  `api/story.js`, `api/shared.js` and `api/media.js`. Over the limit → `429 { error, kind, limit,
  signIn }`; `signIn` is true only for a guest (a signed-in caller is already signed in).
- `src/services/authClient.js` — one Supabase client for the whole app (session persisted, reused by
  Realtime too), `sendMagicLink(email)`, and `authHeaders()`, sent as `Authorization: Bearer <token>` on
  every `/api` call.
- `SignInSheet.jsx` ("Keep dreaming") opens automatically for a guest on a 429; `AccountMenu.jsx` (map
  corner) shows the signed-in email and a sign-out button.
- Joining a shared world links the player row to the signed-in account (`players.user_id`); if you're
  signed in but your device joined before you had an account, it's linked the next time the world loads.
- `peek` and `load` stay free (no rate limit) — they don't call any AI model.

## Illustrations (OpenAI API key)

Story art goes through `api/media.js`, which calls OpenAI's image model (`gpt-image-2.5-flare` by default).
Add `OPENAI_API_KEY` in Vercel (Settings → Environment Variables) or `.env.local`, then redeploy/restart.
Without it, stories still work with painted photos and gradients. Each story draws its places and
portraits once (roughly 6–10 images), plus any moments you choose to illustrate. Set
`OPENAI_IMAGE_QUALITY=low` to spend less.

## Painted-photo AI hook

`generateMemoryImage()` in `src/services/memoryGenerator.js` paints photos with a local oil-paint
filter. `stylizeWithAI()` is a placeholder where an OpenAI or Replicate image model can be added.

## Notes

- Solo stories and their pictures are saved in IndexedDB in the browser; worlds keep their text in
  `localStorage`. If storage runs out, the app shows a notice.
- Audio starts only after you turn on the soundscape, as browsers require.
