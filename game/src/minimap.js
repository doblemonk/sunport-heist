// Sunport Heist — minimap (game/src/minimap.js)
//
// A live 2D minimap pinned to the bottom-right corner of the screen.
// It shows the whole city at a glance: the five district tints, the
// road grid, the player, nearby cars, the police and the mission
// marker, with north marked. It never talks to the network and it
// never touches the 3D scene — it is a plain 2D canvas layered over
// the game canvas.
//
// The minimap is built by createMinimap(game) and returns an object
// carrying update. The main loop calls update every frame; the map
// redraws while the state is playing and stays frozen (but visible)
// on the title screen, while paused, after a bust, or on the
// completion screen.

export function createMinimap(game) {
  var config = (game && game.config) || {};
  // config.worldSize is the half-extent: the city spans
  // -worldSize..+worldSize (same as world.bounds), so the full map
  // width is twice that. (Halving it here once showed only the central
  // quarter of the city and pushed markers past +/-210 off the map.)
  var half = config.worldSize || 420;
  var worldSize = half * 2;

  // Canvas size in CSS pixels: small enough to never cover HUD text.
  var SIZE = 180;
  var MARGIN = 8;

  var canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.position = 'absolute';
  canvas.style.right = '14px';
  canvas.style.bottom = '14px';
  canvas.style.width = SIZE + 'px';
  canvas.style.height = SIZE + 'px';
  canvas.style.zIndex = '5';
  canvas.style.pointerEvents = 'none';
  canvas.style.borderRadius = '6px';
  document.body.appendChild(canvas);

  var ctx = canvas.getContext('2d');

  // District tint colours for the map, keyed by district kind.
  // Beach sand west strip, downtown grey, docks tan-grey,
  // marina green, suburbs green.
  var DISTRICT_COLORS = {
    beach: '#d9c48a',
    downtown: '#8a8f96',
    docks: '#a89a7e',
    marina: '#7fae6e',
    suburbs: '#6fae63'
  };

  function districtColor(district) {
    if (!district) return '#5b7a52';
    var kind = district.kind || district.name || '';
    if (DISTRICT_COLORS[kind]) return DISTRICT_COLORS[kind];
    var name = String(kind).toLowerCase();
    if (name.indexOf('beach') >= 0) return DISTRICT_COLORS.beach;
    if (name.indexOf('downtown') >= 0) return DISTRICT_COLORS.downtown;
    if (name.indexOf('dock') >= 0) return DISTRICT_COLORS.docks;
    if (name.indexOf('marina') >= 0) return DISTRICT_COLORS.marina;
    if (name.indexOf('suburb') >= 0) return DISTRICT_COLORS.suburbs;
    if (district.color) return district.color;
    return '#5b7a52';
  }

  // World x/z -> map pixel. The whole +/-420 city fits with a margin.
  function toMapX(x) {
    return MARGIN + ((x + half) / worldSize) * (SIZE - MARGIN * 2);
  }

  function toMapY(z) {
    // North is negative Z, so negative Z maps to the top of the canvas.
    return MARGIN + ((z + half) / worldSize) * (SIZE - MARGIN * 2);
  }

  function drawDistricts() {
    var districts = [];
    if (game.world && game.world.districts) districts = game.world.districts;
    else if (config.districts) districts = config.districts;
    for (var i = 0; i < districts.length; i++) {
      var d = districts[i];
      if (!d || !d.bounds) continue;
      var b = d.bounds;
      var x0 = toMapX(b.minX !== undefined ? b.minX : (b.x0 !== undefined ? b.x0 : -half));
      var y0 = toMapY(b.minZ !== undefined ? b.minZ : (b.z0 !== undefined ? b.z0 : -half));
      var x1 = toMapX(b.maxX !== undefined ? b.maxX : (b.x1 !== undefined ? b.x1 : half));
      var y1 = toMapY(b.maxZ !== undefined ? b.maxZ : (b.z1 !== undefined ? b.z1 : half));
      ctx.fillStyle = districtColor(d);
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }

  function drawRoads() {
    var spacing = config.roadSpacing || 120;
    ctx.strokeStyle = 'rgba(40, 40, 44, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    var c;
    for (c = -360; c <= 360; c += spacing) {
      ctx.moveTo(toMapX(c), toMapY(-half));
      ctx.lineTo(toMapX(c), toMapY(half));
      ctx.moveTo(toMapX(-half), toMapY(c));
      ctx.lineTo(toMapX(half), toMapY(c));
    }
    ctx.stroke();
  }

  function drawDot(x, z, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(toMapX(x), toMapY(z), radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPlayer() {
    var player = game.player;
    if (!player || !player.position) return;
    var px = toMapX(player.position.x);
    var py = toMapY(player.position.z);
    var heading = player.heading || 0;
    // The map's up is north (negative Z). The triangle points along
    // the player's heading, measured from north.
    var len = 7;
    var wid = 5;
    var tipX = px + Math.sin(heading) * len;
    var tipY = py - Math.cos(heading) * len;
    var leftX = px + Math.sin(heading + 2.5) * wid;
    var leftY = py - Math.cos(heading + 2.5) * wid;
    var rightX = px + Math.sin(heading - 2.5) * wid;
    var rightY = py - Math.cos(heading - 2.5) * wid;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawCars() {
    var i;
    var list = [];
    if (game.vehicles && game.vehicles.list) list = game.vehicles.list;
    for (i = 0; i < list.length; i++) {
      var car = list[i];
      if (!car || !car.position) continue;
      if (game.vehicles.playerCar && car === game.vehicles.playerCar) continue;
      drawDot(car.position.x, car.position.z, 2, car.color || '#cccccc');
    }
    var traffic = [];
    if (game.traffic && game.traffic.cars) traffic = game.traffic.cars;
    for (i = 0; i < traffic.length; i++) {
      var tcar = traffic[i];
      if (!tcar || !tcar.position) continue;
      drawDot(tcar.position.x, tcar.position.z, 2, tcar.color || '#cccccc');
    }
  }

  function drawPolice() {
    var i;
    var police = game.police;
    if (!police) return;
    var cruisers = police.cruisers || [];
    for (i = 0; i < cruisers.length; i++) {
      var cruiser = cruisers[i];
      // A cruiser carries no position of its own; it lives on its vehicle.
      var pos = cruiser && cruiser.vehicle && cruiser.vehicle.position;
      if (!pos) continue;
      drawDot(pos.x, pos.z, 3, '#2f6df6');
    }
    var cops = police.cops || [];
    for (i = 0; i < cops.length; i++) {
      var cop = cops[i];
      // A foot cop's position lives on its mesh.
      var cpos = cop && cop.mesh && cop.mesh.position;
      if (!cpos) continue;
      drawDot(cpos.x, cpos.z, 2, '#1a2f7a');
    }
  }

  function drawMissionMarker(time) {
    var missions = game.missions;
    if (!missions) return;
    if (!missions.current) return;
    var marker = null;
    if (missions.markerPos) {
      marker = typeof missions.markerPos === 'function'
        ? missions.markerPos()
        : missions.markerPos;
    }
    if (!marker) return;
    var mx = marker.x;
    var mz = marker.z;
    if (mx === undefined || mz === undefined) return;
    // Pulsing yellow diamond: the radius breathes with elapsed time.
    var pulse = 5 + Math.sin(time * 4) * 1.5;
    var px = toMapX(mx);
    var py = toMapY(mz);
    ctx.fillStyle = '#ffd21a';
    ctx.strokeStyle = '#7a5c00';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py - pulse);
    ctx.lineTo(px + pulse, py);
    ctx.lineTo(px, py + pulse);
    ctx.lineTo(px - pulse, py);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function drawNorth() {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('N', SIZE / 2, 3);
  }

  function draw(time) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    // Dark translucent background with a border.
    ctx.fillStyle = 'rgba(12, 16, 22, 0.72)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, SIZE - 1.5, SIZE - 1.5);
    // Clip everything inside the frame so dots never spill over it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(1, 1, SIZE - 2, SIZE - 2);
    ctx.clip();
    drawDistricts();
    drawRoads();
    drawCars();
    drawPolice();
    drawMissionMarker(time);
    drawPlayer();
    ctx.restore();
    drawNorth();
  }

  var drawnOnce = false;

  function update(dt) {
    var time = (game && game.time) || 0;
    var state = game && game.state;
    if (state === 'playing') {
      draw(time);
      drawnOnce = true;
    } else if (!drawnOnce) {
      // Title, paused, busted or complete: keep the map visible but
      // static — draw it once from the starting state and leave it.
      draw(time);
      drawnOnce = true;
    }
    void dt;
  }

  return {
    canvas: canvas,
    update: update
  };
}
