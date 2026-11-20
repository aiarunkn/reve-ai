import { useEffect, useState } from 'react';
import { renderSeedImage } from '../services/seedScenes';

/** Resolves a memory's image: the stored stylized photo, or a painted seed scene. */
export function useMemoryImage(memory) {
  const [src, setSrc] = useState(memory?.image || null);

  useEffect(() => {
    if (!memory) return;
    if (memory.image) {
      setSrc(memory.image);
      return;
    }
    if (!memory.scene) return;
    let alive = true;
    renderSeedImage(memory.scene, memory.mood).then((s) => alive && setSrc(s));
    return () => {
      alive = false;
    };
  }, [memory?.id, memory?.image, memory?.scene, memory?.mood]);

  return src;
}

export function formatMemoryDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}
