// GPU presentation is independent from the fixed-step JavaScript simulation.
import { createRenderer } from '../assets/renderer.js';
import { createPreflight } from './preflight.js';

if(new URLSearchParams(location.search).get('renderer')==='canvas'){
  window.__ironwakeGraphics=null;
}else try {
  window.__ironwakeGraphics = await createRenderer(document.getElementById('game'));
} catch (error) {
  console.warn('WebGL presentation unavailable; using the Canvas fallback.', error);
  // A failed WebGL initialization may have already claimed the canvas context.
  const old = document.getElementById('game');
  old.replaceWith(old.cloneNode(false));
  window.__ironwakeGraphics = null;
}
await document.fonts?.load('10px DepartureMono');
window.__ironwakePreflight = createPreflight();
await import('./game.js');
