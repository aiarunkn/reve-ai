/**
 * Three memories that live in the world from the very first visit.
 * They have no uploaded photo: their image is painted procedurally
 * (services/seedScenes.js) and then run through the same stylizer as user photos.
 */
export const SEED_MEMORIES = [
  {
    id: 'seed-astana-snow',
    seed: true,
    scene: 'astanaSnow',
    title: 'First Snow in Astana',
    mood: 'weightless',
    weather: ['snow', 'stars'],
    message:
      'The whole city went quiet at once, as if someone had pressed pause on the world. Remember how the streetlights turned every flake into a tiny falling star — and how you didn’t need anything else.',
    createdAt: '2025-11-02T21:40:00',
  },
  {
    id: 'seed-midnight-train',
    seed: true,
    scene: 'midnightTrain',
    title: 'Midnight Train Home',
    mood: 'bittersweet',
    weather: ['rain', 'mist'],
    message:
      'Rain on the window, your reflection floating over the city lights. You were tired, a little sad, and somehow completely okay. Home was never a place — it was the feeling of moving toward it.',
    createdAt: '2026-03-14T23:52:00',
  },
  {
    id: 'seed-sunday-coffee',
    seed: true,
    scene: 'sundayCoffee',
    title: 'Quiet Sunday Coffee',
    mood: 'quietlyHappy',
    message:
      'Nothing happened, and that was the whole point. Steam curling from the cup, light pooling on the table. Dear future me: the ordinary mornings were the treasure all along.',
    createdAt: '2026-06-07T09:15:00',
  },
];
