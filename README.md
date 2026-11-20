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
- **Read aloud**: a narrator voice plus a distinct voice per character (dialogue is split by speaker).
  Today this uses the browser's built-in voices; a paid voice service can replace them in one place
  (`api/media.js` → `voice`, and `VITE_VOICE_PROVIDER=server`).
- **Sound**: a generative ambient soundscape for the story's feeling, which softens while voices read.
- **Journal**: the cast and where you stand with each of them, open threads, your choices next to their
  consequences, places, and players.
- **Built for multiplayer**: every turn is a round with one action per player. Until a friend joins, the
  narrator plays their character true to your description. Real invites need a shared database (next step).

### Also in Reve
- **Worlds**: photos and a description become a place with one character you talk to, who remembers you.
- **Memory rooms**: a photo, a feeling and a letter to your future self, which you can step inside in 3D.

```bash
npm install
npm run dev
```

**Controls:** drag to look around · scroll or pinch to zoom · WASD to lean in · Q/E or arrow keys to turn ·
click or tap a fragment to catch it · on phones, the phone button lets you look around by moving your phone.

## Structure

```
src/
  App.jsx                    routing (#/ and #/room/<id>), creation flow, sound state
  data/moods.js              the five feelings: palette, icon, weather particles
  data/seedMemories.js       the three memories that exist on first load
  services/memoryGenerator.js  photo → painterly image (local canvas pipeline + AI hook)
  services/seedScenes.js     procedurally painted images for the seed memories
  services/ambientAudio.js   Web Audio generative soundscapes, one per feeling
  services/storage.js        localStorage persistence (memory text + painted photo)
  services/assetStore.js     IndexedDB storage for depth maps and 360° worlds
  services/depthEstimator.js AI depth (runs in workers/depthWorker.js)
  services/panoramaService.js  painted 360° world + client for the AI world
  data/fragments.js          splits the message into fragments and hides them
  components/
    WorldMap.jsx, Landscape.jsx, MemoryPortal.jsx, Island.jsx
    PlantSeedModal.jsx, WeavingOverlay.jsx
    MemoryRoom.jsx (the game HUD), ExploreScene.jsx (three.js world), ParticleCanvas.jsx
api/panorama.js              Vercel serverless function → Blockade Labs (keeps the key secret)
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
to `claude-haiku-5-5`. Before sharing the site publicly, add rate limiting or a login: anyone with the
URL could otherwise run up your bill.

## Illustrations (OpenAI API key)

Story art goes through `api/media.js`, which calls OpenAI's image model (`gpt-image-2.5-flare` by default).
Add `OPENAI_API_KEY` in Vercel (Settings → Environment Variables) or `.env.local`, then redeploy/restart.
Without it, stories still work with painted photos and gradients. Each story draws its places and
portraits once (roughly 6–10 images), plus any moments you choose to illustrate. Set
`OPENAI_IMAGE_QUALITY=low` to spend less.

OpenAI's text-to-speech models (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`) shut down on 2027-01-06, so voices
use the browser for now.

## Turning on AI 360° worlds (Blockade Labs)

1. Create a Skybox AI API key at blockadelabs.com. Image-to-panorama costs credits on a paid plan.
2. **On Vercel:** Project → Settings → Environment Variables → add `BLOCKADE_API_KEY`, then redeploy.
   **Locally:** create `.env.local` with `BLOCKADE_API_KEY=your-key` and restart `npm run dev`.
3. Optional: `BLOCKADE_STYLE_ID` picks the art style. The default is 155; list the styles with
   `GET https://backend.blockadelabs.com/api/v1/skybox/styles`.

New memories then ask the AI for a world in the background (usually a minute or two). It fades in
when ready, even while you're inside, and resumes if you close the page. Starter memories and memories
made without a key keep the painted world.

**Cost safety:** `/api/panorama` refuses requests from other websites, but anyone who scripts calls to
your deployed URL could still spend your credits. Before sharing the site widely, add rate limiting
(for example Vercel's firewall rules) or put the app behind a login.

## Painted-photo AI hook

`generateMemoryImage()` in `src/services/memoryGenerator.js` paints photos with a local oil-paint
filter. `stylizeWithAI()` is a placeholder where an OpenAI or Replicate image model can be added.

## Notes

- Memory text and painted photos are saved in `localStorage` (~70–150 KB each, so roughly 30+ memories
  fit in the browser's ~5 MB limit). Depth maps and 360° worlds go in IndexedDB, which holds much more. If storage runs out, the app shows a notice and keeps the
  memory for the current visit only.
- The arrow buttons in the bottom corners move between memories; Esc returns to the map.
- The depth model (~27 MB) downloads once from Hugging Face, and the browser caches it after that.
- Audio starts only after you turn on the soundscape, as browsers require.
