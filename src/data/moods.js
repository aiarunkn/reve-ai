import { Lamp, Sparkles, CloudFog, Zap, Sunrise } from 'lucide-react';

/**
 * A feeling is the single source of truth for how a memory looks and moves:
 * its palette, the weather particles in its room, and its icon.
 * (Image grading lives in services/memoryGenerator.js, sound in services/ambientAudio.js,
 * both keyed by the same mood key.)
 */
export const MOODS = {
  nostalgic: {
    key: 'nostalgic',
    label: 'Nostalgic',
    weather: 'golden rain · warm lantern glow',
    icon: Lamp,
    primary: '#f5b85a',
    secondary: '#c9733a',
    glow: 'rgba(245, 184, 90, 0.55)',
    bg: ['#140c1c', '#2c1a1a', '#4a2a17'],
    particles: ['goldenRain', 'embers'],
  },
  weightless: {
    key: 'weightless',
    label: 'Weightless',
    weather: 'starry night · floating clouds',
    icon: Sparkles,
    primary: '#a9c2ff',
    secondary: '#5b6fd6',
    glow: 'rgba(150, 175, 255, 0.5)',
    bg: ['#05081c', '#0d1640', '#22265c'],
    particles: ['stars', 'clouds'],
  },
  bittersweet: {
    key: 'bittersweet',
    label: 'Bittersweet',
    weather: 'twilight mist · last light',
    icon: CloudFog,
    primary: '#e7a6c4',
    secondary: '#7d5aa8',
    glow: 'rgba(214, 150, 200, 0.5)',
    bg: ['#0d0a1f', '#2a1a40', '#4a2a4f'],
    particles: ['mist', 'fireflies'],
  },
  electric: {
    key: 'electric',
    label: 'Electric',
    weather: 'neon reflections · city rain',
    icon: Zap,
    primary: '#5ff2ff',
    secondary: '#ff4fc8',
    glow: 'rgba(95, 242, 255, 0.5)',
    bg: ['#05021a', '#180a3a', '#36104a'],
    particles: ['neonRain'],
  },
  quietlyHappy: {
    key: 'quietlyHappy',
    label: 'Quietly Happy',
    weather: 'morning sunbeams · drifting dust',
    icon: Sunrise,
    primary: '#ffd99a',
    secondary: '#f0a370',
    glow: 'rgba(255, 217, 154, 0.55)',
    bg: ['#1a1222', '#3d2a2c', '#6b4630'],
    particles: ['sunbeams', 'motes'],
  },
};

export const MOOD_LIST = Object.values(MOODS);

export const getMood = (key) => MOODS[key] || MOODS.nostalgic;
