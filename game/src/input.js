// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. `pressed` reports keys tapped since the last frame, so a tap of
// B, R or a digit fires once even when the frame rate wobbles.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0, wheel: 0 };

  function setKey(event, down) {
    if (down) {
      if (!keys.has(event.code)) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
    if (event.code === 'Space') event.preventDefault();
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => { keys.clear(); pressed.clear(); });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  window.addEventListener('wheel', (event) => {
    if (state.locked) state.wheel += Math.sign(event.deltaY);
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      // Pointer lock returns a promise in newer Chrome; a headless or denied
      // lock must never surface as an unhandled rejection.
      try {
        const result = canvas.requestPointerLock();
        if (result && typeof result.catch === 'function') result.catch(() => {});
      } catch { /* lock unavailable; the game still runs */ }
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    takeWheel() {
      const w = state.wheel;
      state.wheel = 0;
      return w;
    },
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
