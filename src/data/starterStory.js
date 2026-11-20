/**
 * The world you land in the very first time you open Reve: no forms, no waiting.
 * Its opening is written in advance so it appears instantly; from your first choice
 * on, the narrator (api/story.js) takes over. Original setting and characters.
 */
export const STARTER_PREMISE = 'A school of quiet magic on a cliff above a northern lake. It is autumn of my fifth year, and the Vanishing Map has gone missing from the archive.';

export const STARTER_PLAYERS = [
  {
    id: 'p1',
    name: 'Elaria Vale',
    look: 'Dark curls pinned up badly, ink on one sleeve, a lantern-shaped house pin.',
    want: 'To find out what was hidden in the academy archive years ago.',
    secret: 'Can hear the lanterns whisper, and has never told anyone.',
    tag: 'House Ashgrove · Year 5',
    joined: true,
    local: true,
  },
];

export const STARTER_BIBLE = {
  title: 'Lanternfall Academy',
  tagline: 'A school of quiet magic, and one autumn that changes everything',
  setting: 'A rain-washed academy of spellcraft on a cliff above a northern lake. It is autumn of your fifth year, and the Vanishing Map, which shows rooms that only exist at night, has gone missing from the archive.',
  tone: 'wry, golden, mysterious',
  mood: 'nostalgic',
  places: [
    { name: 'Courtyard of Lamps', description: 'Mossy arches and iron lanterns that turn to watch whoever passes. Autumn leaves gather around an old dry well.', photo_index: -1 },
    { name: 'The Whispering Library', description: 'Seven floors of shelves around a spiral stair. The books murmur when the windows are open.', photo_index: -1 },
    { name: 'Lantern Hall', description: 'The great dining hall, lit by floating paper lanterns that dim whenever someone lies.', photo_index: -1 },
    { name: 'The Clocktower', description: 'A tower of brass gears and pigeons, where the clock runs a few minutes ahead of the truth.', photo_index: -1 },
    { name: 'The Lake Steps', description: 'Worn stone steps down to black water, where the mist sometimes forms letters.', photo_index: -1 },
  ],
  cast: [
    {
      name: 'Callum Thorne',
      role: 'your rival from House Marrowgate',
      look: 'Messy dark hair, a too-sharp grin, a grey-and-green scarf worn loose.',
      personality: 'Clever, competitive and lonelier than he lets anyone see. Teases the people he secretly respects.',
      voice: 'Dry, short sentences; answers questions with questions.',
      wants: 'To find the Vanishing Map before anyone else, to prove his family wrong about him.',
      secret: 'He was the last student to sign the archive register before the map vanished.',
      bond: 'Rival since first year; keeps turning up wherever you go.',
      voice_tone: 'low',
    },
    {
      name: 'Isla Brennan',
      role: 'your closest friend, from House Emberhall',
      look: 'Copper hair in a long braid, freckles, a satchel full of contraband sweets.',
      personality: 'Warm, brave, terrible at keeping quiet. Collects other people’s secrets in order to protect them.',
      voice: 'Fast and bright, full of half-finished sentences.',
      wants: 'For you to finally trust her with whatever you’re hiding.',
      secret: 'She has been sneaking out after curfew to meet someone at the Lake Steps.',
      bond: 'Your best friend; worried about you lately.',
      voice_tone: 'high',
    },
    {
      name: 'Professor Odalys Wren',
      role: 'keeper of the academy archive',
      look: 'Silver hair, half-moon spectacles, a cardigan stitched with tiny maps.',
      personality: 'Kind, precise and far more dangerous than she looks.',
      voice: 'Calm and formal; asks gentle questions that are never gentle.',
      wants: 'The map back before the headmistress notices it is gone.',
      secret: 'She knew your family, and why the archive was sealed years ago.',
      bond: 'Has been watching you with unusual interest.',
      voice_tone: 'medium',
    },
  ],
  threads: [
    'The Vanishing Map is missing from the archive',
    'Callum keeps turning up wherever you go',
    'Isla has been sneaking out after curfew',
  ],
  opening: {
    chapter_title: 'The Vanishing Map',
    time: 'Autumn, Year 5 — late afternoon',
    scene: 0,
    narration:
      'The clocktower bells are still shaking the last of the rain from the roofs when you step into the Courtyard of Lamps. Students drift between the arches in twos and threes, and every lantern turns, very slightly, to follow you.\n\nCallum Thorne is leaning against the old well, exactly where you hoped he wouldn’t be. He looks you over, slow and unimpressed.\n\n“You’re late. Again,” Callum says. “Were you in the library, or just avoiding someone?”',
    choices: ['I was studying. Secretly.', 'Avoiding someone. Successfully.', 'Maybe a bit of both.'],
  },
};
