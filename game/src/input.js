export function createInput(game) {
  const keys = {};
  const input = {
    mouseX: 0,
    mouseY: 0,
    clicked: false,
    down(code) {
      return !!keys[code];
    },
    postUpdate() {
      input.clicked = false;
    },
  };

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' || e.code === 'Space') {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });
  window.addEventListener('mousemove', (e) => {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
  });
  window.addEventListener('mousedown', (e) => {
    input.mouseX = e.clientX;
    input.mouseY = e.clientY;
    input.clicked = true;
  });

  return input;
}
