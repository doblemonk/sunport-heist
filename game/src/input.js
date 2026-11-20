// Sunport Heist — keyboard and mouse input.
// Listens on the window and keeps three kinds of state: keys held down
// right now, keys that went down on this exact frame, and the mouse.
// The main loop calls postUpdate after every frame's updates, which
// clears the per-frame state so pressed() and clicked() are true for
// exactly one frame.

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
  'KeyE', 'KeyF', 'KeyJ', 'KeyK', 'KeyP', 'KeyM', 'KeyC',
  'Enter', 'Escape', 'Tab',
]);

export function createInput(game) {
  const held = new Set();
  const pressedSet = new Set();

  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function canvasRect() {
    const canvas = game && game.renderer && game.renderer.domElement;
    if (canvas && canvas.getBoundingClientRect) return canvas.getBoundingClientRect();
    return null;
  }

  function onKeyDown(event) {
    // Keep the page from scrolling or tabbing away while playing.
    if (GAME_KEYS.has(event.code)) event.preventDefault();
    if (!event.repeat) pressedSet.add(event.code);
    held.add(event.code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onMouseMove(event) {
    const rect = canvasRect();
    if (rect) {
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
    } else {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    }
  }

  function onMouseDown(event) {
    onMouseMove(event);
    if (!mouse.down) mouse.clicked = true;
    mouse.down = true;
  }

  function onMouseUp() {
    mouse.down = false;
  }

  function onBlur() {
    // A lost window must never leave a key stuck down.
    held.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);

  return {
    mouse,

    // True while the key with this KeyboardEvent.code is held.
    down(code) {
      return held.has(code);
    },

    // True only on the frame the key went down.
    pressed(code) {
      return pressedSet.has(code);
    },

    // True if any key went down on this frame.
    get anyKey() {
      return pressedSet.size > 0;
    },

    // Called by the main loop after all updates each frame: clears the
    // per-frame pressed set and the mouse click flag.
    postUpdate() {
      pressedSet.clear();
      mouse.clicked = false;
    },
  };
}
