# Reve AI

*Rêve* is French for "dream". Reve AI turns a photo, a feeling and a message into a place you can step inside.

- **Step inside the photo.** An AI depth model (Depth Anything V2) runs in your browser and rebuilds the
  photo in 3D, so near things stand in front of far things and shift as you look around.
- **A 360° world around you.** Blockade Labs' Skybox AI paints the rest of the world around your photo.
  Without a key, the app paints its own 360° world from the photo's colours.
- **Find your message.** Up to 5 glowing fragments are hidden around you, some of them behind you.
  Each one you catch recovers part of your message, and finding them all unfolds the full letter.

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
