/**
 * Runs Depth Anything V2 (small) entirely in the browser via transformers.js.
 * The model (~27 MB, quantized) downloads once from Hugging Face and is cached by the browser.
 */
import { pipeline, RawImage, env } from '@huggingface/transformers';

env.allowLocalModels = false;

const MODEL = 'onnx-community/depth-anything-v2-small';
let estimatorPromise;

function getEstimator(onProgress) {
  if (!estimatorPromise) {
    estimatorPromise = pipeline('depth-estimation', MODEL, {
      device: 'wasm',
      dtype: 'q8',
      progress_callback: onProgress,
    }).catch((err) => {
      estimatorPromise = null;
      throw err;
    });
  }
  return estimatorPromise;
}

// Aggregate per-file download progress into one 0..1 number.
const files = new Map();
function progressReporter(id) {
  return (p) => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0, total = 0;
      files.forEach((f) => { loaded += f.loaded; total += f.total; });
      self.postMessage({ id, type: 'progress', value: total ? loaded / total : 0 });
    }
  };
}

self.onmessage = async (e) => {
  const { id, blob } = e.data;
  try {
    const estimator = await getEstimator(progressReporter(id));
    self.postMessage({ id, type: 'progress', value: 1, stage: 'thinking' });
    const image = await RawImage.fromBlob(blob);
    const { depth } = await estimator(image);
    const data = depth.data instanceof Uint8Array || depth.data instanceof Uint8ClampedArray
      ? depth.data
      : Uint8Array.from(depth.data);
    self.postMessage(
      { id, type: 'done', width: depth.width, height: depth.height, channels: depth.channels, data },
      [data.buffer]
    );
  } catch (err) {
    self.postMessage({ id, type: 'error', message: err?.message || String(err) });
  }
};
