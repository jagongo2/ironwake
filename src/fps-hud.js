// Count presented game-loop frames, independent of camera zoom and render scale.
(() => {
  const badge = document.createElement('div');
  badge.id = 'fps-counter';
  badge.setAttribute('aria-live', 'off');
  badge.title = 'Game frames per second, averaged over at least 500 ms';
  badge.style.cssText = 'position:fixed;left:12px;top:12px;z-index:10000;pointer-events:none;padding:5px 8px;background:rgba(9,18,14,.82);border:1px solid #6e9273;color:#c5edb5;font:12px/1.25 monospace;font-variant-numeric:tabular-nums;white-space:nowrap;';
  const version = document.querySelector('.version')?.textContent.match(/0\.\d+/)?.[0] || '';
  const label = version + ' | FPS ';
  badge.textContent = label + '—';
  document.body.appendChild(badge);
  let last = null, elapsed = 0, frames = 0;
  window.__ironwakeFPS = {
    frame(now) {
      if (last !== null) {
        const dt = now - last;
        if (dt > 0) { elapsed += dt; frames++; }
        if (elapsed >= 500) {
          const fps = Math.round(frames * 1000 / elapsed);
          badge.textContent = label + fps;
          badge.dataset.fps = String(fps);
          elapsed = 0; frames = 0;
        }
      }
      last = now;
    }
  };
  document.addEventListener('visibilitychange', () => {
    last = null; elapsed = 0; frames = 0;
    badge.textContent = label + '—';
    delete badge.dataset.fps;
  });
})();
