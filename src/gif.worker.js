import { GIFEncoder, quantize, applyPalette } from 'gifenc';
let gif;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'finish') {
      gif.finish(); const bytes = gif.bytes();
      self.postMessage({ bytes }, [bytes.buffer]); return;
    }
    if (!gif) gif = GIFEncoder();
    const rgba = new Uint8Array(data.rgba), palette = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, palette), data.width, data.height, { palette, delay: data.delay, repeat: 0 });
    self.postMessage({ done: true });
  } catch (error) { self.postMessage({ error: error.message }); }
};
