// Sunport Heist — minimap
// Draws a top-down map of Solmar on the 180x180 canvas: district blocks,
// a road grid, the player arrow, traffic and parked cars, police and the
// pulsing mission marker, with north at the top.

export function createMinimap(game) {
  const canvas = document.getElementById('minimap');
  const ctx = canvas ? canvas.getContext('2d') : null;
  const SIZE = 180;
  const HALF = SIZE / 2;

  // Muted palette for the districts, cycled when config names no colour.
  const PALETTE = ['#2e4a3f', '#3f3a2e', '#33404f', '#4a2f3a', '#2f3a4a', '#453d2a'];

  function bounds() {
    const c = game.config || {};
    const min = c.worldMin == null ? -420 : c.worldMin;
    const max = c.worldMax == null ? 420 : c.worldMax;
    return { min, max, span: Math.max(1, max - min) };
  }

  function toMap(x, z, b) {
    return [
      ((x - b.min) / b.span) * SIZE,
      ((z - b.min) / b.span) * SIZE,
    ];
  }

  function drawDistricts(b) {
    const districts = game.config && game.config.districts;
    if (Array.isArray(districts) && districts.length) {
      districts.forEach((d, i) => {
        const [px, py] = toMap(d.x0 != null ? d.x0 : 0, d.z0 != null ? d.z0 : 0, b);
        const [qx, qy] = toMap(d.x1 != null ? d.x1 : 0, d.z1 != null ? d.z1 : 0, b);
        ctx.fillStyle = d.color || PALETTE[i % PALETTE.length];
        ctx.fillRect(px, py, qx - px, qy - py);
      });
      return;
    }
    // Fallback: a quiet 3x3 block layout when config carries no districts.
    for (let gx = 0; gx < 3; gx++) {
      for (let gz = 0; gz < 3; gz++) {
        ctx.fillStyle = PALETTE[(gx * 3 + gz) % PALETTE.length];
        const px = 12 + gx * 56;
        const py = 12 + gz * 56;
        ctx.fillRect(px, py, 48, 48);
      }
    }
  }

  function drawRoads(b) {
    const roads = game.config && game.config.roads;
    ctx.strokeStyle = 'rgba(220, 220, 205, 0.55)';
    ctx.lineWidth = 1;
    if (Array.isArray(roads) && roads.length) {
      roads.forEach((r) => {
        const [x1, y1] = toMap(r.x1 != null ? r.x1 : r.x, r.z1 != null ? r.z1 : r.z, b);
        const [x2, y2] = toMap(r.x2 != null ? r.x2 : r.x, r.z2 != null ? r.z2 : r.z, b);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });
      return;
    }
    // Fallback grid: avenues every 84 world units.
    for (let v = -336; v <= 336; v += 84) {
      const [ax, ay] = toMap(v, b.min, b);
      const [bx, by] = toMap(v, b.max, b);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const [cx, cy] = toMap(b.min, v, b);
      const [dx, dy] = toMap(b.max, v, b);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(dx, dy);
      ctx.stroke();
    }
  }

  function dot(x, z, b, color, r) {
    const [px, py] = toMap(x, z, b);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStar(px, py, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const sx = px + Math.cos(ang) * rad;
      const sy = py + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.closePath();
    ctx.fill();
  }

  function update(dt) {
    if (!ctx) return;
    const b = bounds();

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#101c26';
    ctx.fillRect(0, 0, SIZE, SIZE);

    drawDistricts(b);
    drawRoads(b);

    // Traffic and parked cars as grey dots.
    const cars = [];
    if (game.vehicles && Array.isArray(game.vehicles.list)) cars.push(...game.vehicles.list);
    if (game.traffic && Array.isArray(game.traffic.cars)) cars.push(...game.traffic.cars);
    cars.forEach((car) => {
      const x = car.x != null ? car.x : car.position ? car.position.x : 0;
      const z = car.z != null ? car.z : car.position ? car.position.z : 0;
      dot(x, z, b, '#9aa3a8', 1.6);
    });

    // Police cruisers and foot cops as blue dots.
    if (game.police) {
      (game.police.cruisers || []).forEach((c) => {
        const x = c.x != null ? c.x : c.position ? c.position.x : 0;
        const z = c.z != null ? c.z : c.position ? c.position.z : 0;
        dot(x, z, b, '#3fa9ff', 2.2);
      });
      (game.police.cops || []).forEach((c) => {
        const x = c.x != null ? c.x : c.position ? c.position.x : 0;
        const z = c.z != null ? c.z : c.position ? c.position.z : 0;
        dot(x, z, b, '#7cc4ff', 1.8);
      });
    }

    // Mission marker: a pulsing yellow star.
    const marker = game.missions ? game.missions.markerPos : null;
    if (marker) {
      const mx = marker.x != null ? marker.x : marker.position ? marker.position.x : 0;
      const mz = marker.z != null ? marker.z : marker.position ? marker.position.z : 0;
      const [px, py] = toMap(mx, mz, b);
      const pulse = 4 + Math.sin((game.time || 0) * 5) * 1.4;
      drawStar(px, py, pulse + 2, '#ffd23f');
    }

    // Player as a white triangle rotated by heading.
    if (game.player) {
      const px0 = game.player.x != null ? game.player.x : game.player.position ? game.player.position.x : 0;
      const pz0 = game.player.z != null ? game.player.z : game.player.position ? game.player.position.z : 0;
      const [px, py] = toMap(px0, pz0, b);
      const h = game.player.heading || 0;
      // Canvas angle: forward (sin h, cos h) in canvas (x, y-down)
      // coordinates. A triangle drawn pointing up (0,-6) rotated by
      // angle t points at (sin t, -cos t), so t = PI - h faces forward.
      const ang = Math.PI - h;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#101c26';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // North mark at the top.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', HALF, 3);
  }

  return { update };
}
