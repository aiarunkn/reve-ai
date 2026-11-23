/** Small canvas helpers for preparing photos before they are sent to the narrator. */

export function drawFit(img, maxSide) {
  const w0 = img.naturalWidth || img.width;
  const h0 = img.naturalHeight || img.height;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * s));
  c.height = Math.max(1, Math.round(h0 * s));
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}


export function loadImage(source) {
  if (source instanceof HTMLCanvasElement || source instanceof HTMLImageElement) return Promise.resolve(source);
  return new Promise((resolve, reject) => {
    const img = new Image();
    let url;
    img.onload = () => { if (url) URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { if (url) URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    if (source instanceof Blob) { url = URL.createObjectURL(source); img.src = url; }
    else { if (/^https?:/.test(source)) img.crossOrigin = 'anonymous'; img.src = source; }
  });
}
