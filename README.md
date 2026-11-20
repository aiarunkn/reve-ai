# Reve AI

*Rêve* is French for "dream". Reve AI is a living visual diary of imagined worlds: you upload up to five of
your own photos, describe a person or place you want to imagine, and it becomes a small world you belong to,
with one inhabitant you can talk to.

**Hypothesis:** people don’t just want to consume fictional worlds; they want to belong to worlds they created.

- **Illustrated scenes.** Each photo becomes a place in the world, painted in one consistent style.
- **One character.** Claude writes a "world bible" from your photos and words: the world’s name, its places,
  small truths about it, and one inhabitant with a personality, a voice, a longing and a secret.
- **Conversations.** Talk with them (text). Replies stream in, and they move you between places as you talk.
- **Persistent memory.** After conversations, the character reflects: they remember what you shared, the
  relationship deepens (stranger → acquaintance → friend → confidant → kindred), and they change over time.
  You can see and edit what they remember in the Memory tab.
- **Stories.** Ask them to tell you a story set in your world; stories are kept to reread.
- **Memory rooms** (the earlier part of the app): a single photo + feeling + letter, which you can step inside in 3D.

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

Worlds are created and characters talk through `api/reve.js`, a Vercel serverless function that calls
Claude (`claude-opus-5-5`) with the official Anthropic SDK. The key stays on the server.

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
