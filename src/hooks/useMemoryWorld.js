import { useEffect, useState } from 'react';
import { useMemoryImage } from './useMemoryImage';
import { getAsset, putAsset, onAsset } from '../services/assetStore';
import { estimateDepth } from '../services/depthEstimator';
import { paintPanorama } from '../services/panoramaService';

/**
 * Everything a memory needs to become a place:
 *   image  – the painted photo (texture for the 3D depth mesh)
 *   depth  – object URL of the AI depth map
 *   pano   – object URL of the 360° world (AI if available, else painted locally)
 */
export function useMemoryWorld(memory) {
  const image = useMemoryImage(memory);
  const [depth, setDepth] = useState(null);
  const [pano, setPano] = useState(null);
  const [panoKind, setPanoKind] = useState(null);
  const [progress, setProgress] = useState(null); // { value 0..1, stage } while the depth model works

  useEffect(() => {
    setDepth(null);
    setPano(null);
    setPanoKind(null);
  }, [memory.id]);

  // depth map
  useEffect(() => {
    if (!image) return;
    let alive = true;
    let url;
    (async () => {
      let blob = await getAsset(memory.id, 'depth');
      if (!blob) {
        setProgress({ value: 0, stage: 'loading' });
        blob = await estimateDepth(image, (value, stage) => alive && setProgress({ value, stage: stage || 'loading' }));
        putAsset(memory.id, 'depth', blob);
      }
      if (!alive) return;
      url = URL.createObjectURL(blob);
      setDepth(url);
      setProgress(null);
    })();
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [memory.id, image]);

  // panorama (AI version wins; it can arrive later while you're inside)
  useEffect(() => {
    if (!image) return;
    let alive = true;
    let url;
    const show = (blob, kind) => {
      if (!alive || !blob) return;
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      setPano(url);
      setPanoKind(kind);
    };
    (async () => {
      const ai = await getAsset(memory.id, 'pano');
      if (ai) return show(ai, 'ai');
      let local = await getAsset(memory.id, 'pano-local');
      if (!local) {
        local = await paintPanorama(image, memory.mood);
        putAsset(memory.id, 'pano-local', local);
      }
      show(local, 'local');
    })();
    const off = onAsset(memory.id, async (kind) => {
      if (kind === 'pano') show(await getAsset(memory.id, 'pano'), 'ai');
    });
    return () => {
      alive = false;
      off();
      if (url) URL.revokeObjectURL(url);
    };
  }, [memory.id, memory.mood, image]);

  return { image, depth, pano, panoKind, progress };
}
