# Reve AI

*Rêve* is French for "dream". Reve AI is a dreamy memory sanctuary: a prototype where a photo, a feeling and a message become a memory room you can visit.

```bash
npm install
npm run dev
```

## Structure

```
src/
  App.jsx                    routing (#/ and #/room/<id>), creation flow, sound state
  data/moods.js              the five feelings: palette, icon, weather particles
  data/seedMemories.js       the three memories that exist on first load
  services/memoryGenerator.js  photo → painterly image (local canvas pipeline + AI hook)
  services/seedScenes.js     procedurally painted images for the seed memories
  services/ambientAudio.js   Web Audio generative soundscapes, one per feeling
  services/storage.js        localStorage persistence
  components/
    WorldMap.jsx, Landscape.jsx, MemoryPortal.jsx, Island.jsx
    PlantSeedModal.jsx, WeavingOverlay.jsx
    MemoryRoom.jsx, ParticleCanvas.jsx
```

## Plugging in an AI image model

`generateMemoryImage(source, mood)` uses the local painter by default (Kuwahara oil-paint filter,
mood split-toning, bloom, grain and vignette). To use OpenAI or Replicate instead, copy `.env.example`
to `.env.local`, set `VITE_IMAGE_AI_PROVIDER`, and fill in `stylizeWithAI()`. It already builds a
prompt for each feeling, re-encodes the result to a small JPEG, and falls back to the local painter
(with a notice) if the call fails or takes more than 90 seconds.

Keep your secret key on a server: set `VITE_IMAGE_AI_ENDPOINT` to your own proxy. Any `VITE_*`
value is bundled into the browser.

## Notes

- Memories are saved in `localStorage` as JPEGs (~70–150 KB each), which is roughly 30+ memories
  before the browser's ~5 MB limit. If storage runs out, the app shows a notice and keeps the
  memory for the current visit only.
- Keyboard: ← → drift between rooms, Esc returns to the map. On touch screens, swipe.
- Audio starts only after you turn on the soundscape, as browsers require.
