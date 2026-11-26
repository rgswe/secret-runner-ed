(() => {
  // ---------------------------------------------------------------------------
  // Canvas and DOM references
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = 450;
  const H = 800;
  const lanes = [55, 225, 395];

  // Let the road fade into a broad, distant horizon just above the skyline.
  const ROAD_VANISH_Y = 200;
  const ROAD_SPAWN_Y = ROAD_VANISH_Y;
  const ROAD_PLAYER_Y = 570;
  const ROAD_PLAYER_DEPTH = ROAD_PLAYER_Y - ROAD_VANISH_Y;
  const ROAD_HORIZON_SCALE = 0.14;
  const ROAD_BOTTOM_STRETCH = 0;
  const TURN_SWEEP_DISTANCE = 48;

  const scoreEl = document.getElementById('score');
  const coinsEl = document.getElementById('coins');
  const powerEl = document.getElementById('power');
  const overlay = document.getElementById('overlay');
  const startPanel = document.getElementById('startPanel');
  const endPanel = document.getElementById('endPanel');
  const toastEl = document.getElementById('toast');

  const backgroundMusic = new Audio('assets/music.mp3');
  backgroundMusic.loop = true;
  backgroundMusic.preload = 'auto';
  const pausedMusicVolume = 0.08;
  const playingMusicVolume = 0.65;
  const beatDuration = 60 / 145;
  backgroundMusic.volume = pausedMusicVolume;
  backgroundMusic.play().catch(() => {
    // Browsers may block autoplay until the player interacts with the page.
  });

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  let running = false;
  let last = 0;
  let score = 0;
  let coins = 0;
  let lane = 1;
  let visualLane = 1;
  let items = [];
  let particles = [];
  let shockwaves = [];
  let spawn = 0;
  let speed = 235;
  let playerY = ROAD_PLAYER_Y;
  let jump = 0;
  let slide = 0;
  let power = '';
  let powerTime = 0;
  let roadOffset = 0;
  let toastTimer = 0;
  let animTime = 0;
  let escapeOffset = 0;
  let crashing = false;
  let crashTimer = 0;

  // Load local SVG illustrations used by the canvas.
  const art = {};
  const assetPaths = {
    porto: 'assets/collectibles/fcp.svg',
    benfica: 'assets/obstacles/slb.svg',
    sporting: 'assets/obstacles/scp.svg',
    halter: 'assets/powerup/halter.svg',
    car: 'assets/car/audi-a3-8v-rear.svg',
  };

  for (const [name, src] of Object.entries(assetPaths)) {
    const image = new Image();
    image.src = src;
    art[name] = image;
  }

  // ---------------------------------------------------------------------------
  // Small utilities and game lifecycle
  // ---------------------------------------------------------------------------
  const rand = (min, max) => Math.random() * (max - min) + min;
  const horizonBoats = [
    { side: 'left', x: 82, y: 242, phase: rand(0, 6), scale: 0.72, driftRate: rand(0.16, 0.25) },
    { side: 'left', x: 132, y: 310, phase: rand(0, 6), scale: 0.52, driftRate: rand(0.16, 0.25) },
    { side: 'right', x: 366, y: 264, phase: rand(0, 6), scale: 0.66, driftRate: rand(0.16, 0.25) },
    { side: 'right', x: 414, y: 328, phase: rand(0, 6), scale: 0.48, driftRate: rand(0.16, 0.25) },
  ];
  const powerRays = Array.from({ length: 130 }, () => ({
    angle: rand(Math.PI, Math.PI * 2),
    phase: rand(0, 1),
    speed: rand(0.45, 0.82),
    length: rand(48, 120),
    color: Math.random() < 0.5 ? '#43f5f2' : '#ff4fc8',
  }));
  const lowerPowerRays = Array.from({ length: 130 }, () => ({
    angle: rand(0, Math.PI),
    phase: rand(0, 1),
    speed: rand(0.45, 0.82),
    length: rand(48, 120),
    color: Math.random() < 0.5 ? '#43f5f2' : '#ff4fc8',
  }));
  const horizonPowerRays = Array.from({ length: 32 }, () => ({
    direction: Math.random() < 0.5 ? -1 : 1,
    phase: rand(0, 1),
    speed: rand(0.45, 0.82),
    length: rand(48, 120),
    color: Math.random() < 0.5 ? '#43f5f2' : '#ff4fc8',
  }));
  const allPowerRays = [...powerRays, ...lowerPowerRays, ...horizonPowerRays];
  let powerRaysDraining = false;
  const roadProjectX = (x, y) => {
    const progress = Math.max(0, (y - ROAD_VANISH_Y) / ROAD_PLAYER_DEPTH);
    const beyondPlayer = Math.max(0, progress - 1);
    const perspective = ROAD_HORIZON_SCALE
      + (1 - ROAD_HORIZON_SCALE) * progress
      + ROAD_BOTTOM_STRETCH * beyondPlayer;
    // Keep the selected lane under the car near the bottom, while the distant
    // escape point moves opposite the steering direction.
    const laneShift = lanes[0] + (lanes[1] - lanes[0]) * visualLane - 225;
    // Shift the escape point and gently bend the road toward the selected lane.
    const turnSweep = escapeOffset * (1 - progress);
    const curveProgress = Math.max(
      0,
      Math.min(1, (y - ROAD_VANISH_Y) / (H - ROAD_VANISH_Y)),
    );
    const turnCurve = (1 - visualLane) * 10 * 4 * curveProgress * (1 - curveProgress);
    return 225 + (x - 225 - laneShift) * perspective + turnSweep + turnCurve;
  };

  function traceRoadLine(x) {
    for (let y = ROAD_VANISH_Y + 16; y <= H; y += 16) {
      ctx.lineTo(roadProjectX(x, y), y);
    }
    ctx.lineTo(roadProjectX(x, H), H);
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.style.opacity = 1;
    toastTimer = 1.1;
  }

  function reset() {
    score = 0;
    coins = 0;
    lane = 1;
    visualLane = 1;
    items = [];
    particles = [];
    shockwaves = [];
    spawn = 0.6;
    speed = 235;
    jump = 0;
    slide = 0;
    power = '';
    powerTime = 0;
    powerRaysDraining = false;
    roadOffset = 0;
    playerY = ROAD_PLAYER_Y;
    animTime = 0;
    escapeOffset = 0;
    crashing = false;
    crashTimer = 0;

    scoreEl.textContent = '0';
    coinsEl.textContent = '0';
    powerEl.textContent = '—';
  }

  function start() {
    reset();
    overlay.classList.add('hidden');
    running = true;
    backgroundMusic.currentTime = 0;
    backgroundMusic.volume = playingMusicVolume;
    backgroundMusic.play().catch(() => {
      // Browsers may block playback until a user gesture is received.
    });
    last = performance.now();
    draw();
    requestAnimationFrame(loop);
  }

  function finish() {
    running = false;
    backgroundMusic.volume = pausedMusicVolume;
    document.getElementById('result').textContent =
      `Percorreste ${Math.floor(score)} metros e apanhaste ${coins} emblemas do FC Porto.`;
    overlay.classList.remove('hidden');
    startPanel.classList.add('hidden');
    endPanel.classList.remove('hidden');
  }

  // ---------------------------------------------------------------------------
  // Canvas drawing helpers and visual effects
  // ---------------------------------------------------------------------------
  function rounded(x, y, width, height, radius, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
    ctx.fillStyle = fill;
    ctx.fill();

    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  function burst(x, y, color, count = 12) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = rand(45, 190);
      const life = rand(0.28, 0.62);

      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        max: life,
        size: rand(2, 5),
        color,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += 150 * dt;
      particle.vx *= Math.pow(0.35, dt);

      if (particle.life <= 0) {
        particles.splice(i, 1);
      }
    }

    for (let i = shockwaves.length - 1; i >= 0; i -= 1) {
      const wave = shockwaves[i];
      wave.life -= dt;
      wave.radius += dt * 260;

      if (wave.life <= 0) {
        shockwaves.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const wave of shockwaves) {
      const alpha = Math.max(0, wave.life / wave.max);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = 5 * alpha + 1;
      ctx.shadowColor = wave.color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const particle of particles) {
      const alpha = Math.max(0, particle.life / particle.max);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(
        particle.x,
        particle.y,
        particle.size * (0.65 + 0.5 * alpha),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  function impact(x, y) {
    shockwaves.push({ x, y, radius: 8, life: 0.34, max: 0.34, color: '#b9fff1' });
    shockwaves.push({ x, y, radius: 4, life: 0.26, max: 0.26, color: '#ffd36b' });
    burst(x, y, '#ffd36b', 26);
    burst(x, y, '#ff815c', 18);
    burst(x, y, '#b9fff1', 12);
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#21164f');
    gradient.addColorStop(0.32, '#56306f');
    gradient.addColorStop(0.55, '#f06b83');
    gradient.addColorStop(1, '#251d43');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    // Keep the skyline and sunset above the road's horizon and let them follow
    // the vanishing point as the player steers.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, ROAD_VANISH_Y);
    ctx.clip();

    // Tropical sunset at the road's vanishing point, with the classic striped sun.
    const sunX = 225 + escapeOffset * 0.4;
    const sunY = ROAD_VANISH_Y - 3 + Math.sin(animTime * 1.2) * 4;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 150);
    sunGlow.addColorStop(0, 'rgba(255, 194, 121, 0.72)');
    sunGlow.addColorStop(0.42, 'rgba(255, 91, 151, 0.36)');
    sunGlow.addColorStop(1, 'rgba(255, 91, 151, 0)');
    ctx.fillStyle = sunGlow;
    ctx.fillRect(55, 45, 340, 300);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, 78, Math.PI, 0);
    ctx.lineTo(sunX + 78, sunY + 3);
    ctx.lineTo(sunX - 78, sunY + 3);
    ctx.closePath();
    ctx.clip();
    const sunFill = ctx.createLinearGradient(0, sunY - 78, 0, sunY + 6);
    sunFill.addColorStop(0, '#ffe58a');
    sunFill.addColorStop(0.54, '#ffad70');
    sunFill.addColorStop(1, '#ff5f9c');
    ctx.fillStyle = sunFill;
    ctx.fillRect(sunX - 80, sunY - 80, 160, 88);
    ctx.fillStyle = '#59255f';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillRect(sunX - 82, sunY - 25 + i * 12, 164, 4 + i * 0.7);
    }
    ctx.restore();

    // A low neon skyline frames the sunset while leaving the road clear.
    ctx.save();
    ctx.translate(escapeOffset * 1.1, 0);
    ctx.fillStyle = '#211b49';
    const skyline = [
      [-102, 159, 38, 60], [-62, 137, 31, 82], [-29, 166, 27, 53],
      [0, 151, 42, 68], [42, 168, 36, 51], [82, 143, 30, 76],
      [116, 173, 34, 46], [300, 166, 34, 53], [338, 139, 28, 80],
      [372, 158, 39, 61], [414, 147, 36, 72], [452, 166, 31, 53],
      [485, 142, 37, 77], [524, 157, 34, 62], [560, 134, 42, 85],
    ];
    // Draw the bridge first so the buildings overlap it in the skyline.
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = '#ff4fc8';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#ff68c9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(94, 190);
    ctx.lineTo(356, 190);
    ctx.moveTo(137, 190);
    ctx.lineTo(137, 157);
    ctx.moveTo(313, 190);
    ctx.lineTo(313, 157);
    ctx.moveTo(137, 158);
    ctx.quadraticCurveTo(225, 211, 313, 158);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#54f7f0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(94, 194);
    ctx.lineTo(356, 194);
    for (let x = 153; x <= 297; x += 12) {
      const t = (x - 137) / (313 - 137);
      const cableY = 158 + 106 * t * (1 - t);
      ctx.moveTo(x, cableY);
      ctx.lineTo(x, 190);
    }
    ctx.stroke();
    ctx.restore();

    skyline.forEach(([x, y, width, height]) => {
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = '#ff85bd';
      for (let wy = y + 10; wy < y + height - 4; wy += 13) {
        ctx.fillRect(x + 7, wy, 3, 5);
        if (width > 32) ctx.fillRect(x + width - 10, wy, 3, 5);
      }
      ctx.fillStyle = '#211b49';
    });
    ctx.restore();
    ctx.restore();

    // Distant scenery follows the camera more slowly than the road.
    ctx.save();
    ctx.translate(escapeOffset * 0.2, 0);

    // Snow moves with the road offset to make the scene feel animated.
    ctx.fillStyle = '#eaf5f2';
    for (let i = 0; i < 45; i += 1) {
      const x = (i * 83 + roadOffset * 0.11) % W;
      const y = (i * 137 + roadOffset * 0.35) % H;
      if (y >= ROAD_VANISH_Y) continue;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Keep the distant winter haze behind the road surface.
    const horizonHaze = ctx.createLinearGradient(0, ROAD_VANISH_Y, 0, 390);
    horizonHaze.addColorStop(0, 'rgba(255, 127, 176, 0.34)');
    horizonHaze.addColorStop(0.42, 'rgba(105, 74, 151, 0.25)');
    horizonHaze.addColorStop(1, 'rgba(105, 74, 151, 0)');
    ctx.fillStyle = horizonHaze;
    ctx.fillRect(0, ROAD_VANISH_Y, W, 260);

    // A quiet river runs beside the road below its vanishing point.
    const water = ctx.createLinearGradient(0, ROAD_VANISH_Y, 0, H);
    water.addColorStop(0, 'rgba(255, 137, 145, 0.72)');
    water.addColorStop(0.24, 'rgba(230, 112, 151, 0.62)');
    water.addColorStop(0.62, 'rgba(77, 119, 153, 0.68)');
    water.addColorStop(1, 'rgba(16, 49, 91, 0.94)');
    ctx.fillStyle = water;
    ctx.fillRect(0, ROAD_VANISH_Y, W, H - ROAD_VANISH_Y);
    const reflection = ctx.createLinearGradient(150, 0, 300, 0);
    reflection.addColorStop(0, 'rgba(255, 168, 121, 0)');
    reflection.addColorStop(0.5, 'rgba(255, 168, 121, 0.28)');
    reflection.addColorStop(1, 'rgba(255, 168, 121, 0)');
    ctx.fillStyle = reflection;
    ctx.fillRect(0, ROAD_VANISH_Y, W, H - ROAD_VANISH_Y);
    ctx.save();
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i += 1) {
      const y = ROAD_VANISH_Y + 12 + i * 12;
      const drift = (animTime * (5 + i % 3) + i * 37) % 450;
      const x = (drift + (i % 2 ? 0 : 225)) % 450;
      ctx.globalAlpha = i % 3 === 0 ? 0.4 : 0.25;
      ctx.strokeStyle = i % 3 === 0 ? '#ffd18c' : '#b9f1e9';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 12 + (i % 4) * 3, y);
      ctx.stroke();
    }
    ctx.restore();

    // The sunset fog sits behind the road and softens the distant join.
    const horizonFog = ctx.createLinearGradient(0, ROAD_VANISH_Y - 20, 0, ROAD_VANISH_Y + 24);
    horizonFog.addColorStop(0, 'rgba(255, 194, 190, 0)');
    horizonFog.addColorStop(0.22, 'rgba(255, 194, 190, 0.38)');
    horizonFog.addColorStop(0.4, 'rgba(255, 194, 190, 0.68)');
    horizonFog.addColorStop(0.5, 'rgba(255, 210, 205, 0.94)');
    horizonFog.addColorStop(0.6, 'rgba(222, 174, 202, 0.68)');
    horizonFog.addColorStop(0.78, 'rgba(222, 174, 202, 0.38)');
    horizonFog.addColorStop(1, 'rgba(169, 187, 214, 0)');
    ctx.save();
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = horizonFog;
    ctx.fillRect(0, ROAD_VANISH_Y - 28, W, 60);
    ctx.restore();

    // Road edges and lane dividers end across the same fogged horizon band.
    ctx.fillStyle = '#17152f';
    ctx.beginPath();
    ctx.moveTo(roadProjectX(505, ROAD_VANISH_Y), ROAD_VANISH_Y);
    traceRoadLine(505);
    for (let y = H; y > ROAD_VANISH_Y; y -= 16) {
      ctx.lineTo(roadProjectX(-55, y), y);
    }
    ctx.lineTo(roadProjectX(-55, ROAD_VANISH_Y), ROAD_VANISH_Y);
    ctx.lineTo(roadProjectX(505, ROAD_VANISH_Y), ROAD_VANISH_Y);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#292043';
    ctx.beginPath();
    ctx.moveTo(roadProjectX(-55, ROAD_VANISH_Y), ROAD_VANISH_Y);
    traceRoadLine(-20);
    for (let y = H; y > ROAD_VANISH_Y; y -= 16) {
      ctx.lineTo(roadProjectX(-55, y), y);
    }
    ctx.lineTo(roadProjectX(-55, ROAD_VANISH_Y), ROAD_VANISH_Y);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(roadProjectX(505, ROAD_VANISH_Y), ROAD_VANISH_Y);
    traceRoadLine(505);
    for (let y = H; y > ROAD_VANISH_Y; y -= 16) {
      ctx.lineTo(roadProjectX(470, y), y);
    }
    ctx.lineTo(roadProjectX(470, ROAD_VANISH_Y), ROAD_VANISH_Y);
    ctx.lineTo(roadProjectX(505, ROAD_VANISH_Y), ROAD_VANISH_Y);
    ctx.closePath();
    ctx.fill();

    // Boats drift gently and independently along the riverbanks. Their paths
    // stay outside the road even as the player steers.
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, ROAD_VANISH_Y);
    for (let y = ROAD_VANISH_Y; y <= 430; y += 10) {
      ctx.lineTo(roadProjectX(-55, y), y);
    }
    ctx.lineTo(0, 430);
    ctx.closePath();
    ctx.moveTo(W, ROAD_VANISH_Y);
    for (let y = ROAD_VANISH_Y; y <= 430; y += 10) {
      ctx.lineTo(roadProjectX(505, y), y);
    }
    ctx.lineTo(W, 430);
    ctx.closePath();
    ctx.clip();
    for (const boat of horizonBoats) {
      const drift = Math.sin(animTime * boat.driftRate + boat.phase);
      const bob = Math.sin(animTime * 0.7 + boat.phase) * 1.5;
      const x = boat.x + drift * (boat.side === 'left' ? 5 : -5);
      const y = boat.y + bob;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(boat.scale, boat.scale);
      ctx.fillStyle = '#30204f';
      ctx.beginPath();
      ctx.moveTo(-15, 8);
      ctx.lineTo(15, 8);
      ctx.lineTo(10, 13);
      ctx.lineTo(-10, 13);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, 6);
      ctx.lineTo(-2, -12);
      ctx.lineTo(-12, 5);
      ctx.closePath();
      ctx.moveTo(1, 4);
      ctx.lineTo(1, -9);
      ctx.lineTo(10, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ffd78a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-17, 16);
      ctx.quadraticCurveTo(0, 13, 17, 16);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // Lane dividers scroll down the screen as the car advances.
    // Neon road edges and lane dividers, with a soft bloom under crisp cores.
    ctx.save();
    ctx.lineCap = 'round';
    for (const x of [-20, 140, 310, 470]) {
      ctx.beginPath();
      ctx.moveTo(roadProjectX(x, ROAD_VANISH_Y), ROAD_VANISH_Y);
      traceRoadLine(x);
      const roadEdge = x === -20 || x === 470;
      ctx.setLineDash(roadEdge ? [] : [24, 32]);
      ctx.lineDashOffset = roadEdge ? 0 : -roadOffset % 56;
      ctx.strokeStyle = roadEdge ? '#ff4fc8' : '#43f5f2';
      ctx.lineWidth = roadEdge ? 5 : 4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 16;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffe2fa';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // Christmas garland above the road.
    ctx.strokeStyle = '#d9b75d';
    ctx.lineWidth = 3;
    const garlandBob = Math.sin(animTime * 1.25) * 10;
    ctx.beginPath();
    ctx.moveTo(0, 225 + garlandBob * 0.35);
    ctx.quadraticCurveTo(225, 275 + garlandBob, 450, 225 + garlandBob * 0.35);
    ctx.stroke();

    for (let i = 0; i < 11; i += 1) {
      const x = i * 45;
      const sway = Math.sin(animTime * 1.8 + i * 0.65) * 3;
      const y = 225 + Math.sin(i / 10 * Math.PI) * 24
        + garlandBob * Math.sin(i / 10 * Math.PI) + sway;
      const lights = [
        { color: '#d94e4e', rgb: '217, 78, 78' },
        { color: '#f3d46b', rgb: '243, 212, 107' },
        { color: '#4ba879', rgb: '75, 168, 121' },
      ];
      const light = lights[i % lights.length];
      const pulse = (Math.sin(animTime * 3.2 + i * 2.17) + 1) / 2;
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 27);
      glow.addColorStop(0, `rgba(${light.rgb}, ${0.35 + pulse * 0.4})`);
      glow.addColorStop(0.24, `rgba(${light.rgb}, ${0.16 + pulse * 0.24})`);
      glow.addColorStop(1, `rgba(${light.rgb}, 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 27, 0, Math.PI * 2);
      ctx.fill();

      // A bright, steady-sized core makes the colored bloom read as light.
      ctx.save();
      ctx.shadowColor = light.color;
      ctx.shadowBlur = 8 + pulse * 14;
      ctx.fillStyle = light.color;
      ctx.beginPath();
      ctx.arc(x, y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawWindEffect() {
    ctx.save();
    ctx.lineCap = 'round';
    // Keep the original gentle streaks running all the time.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(roadProjectX(505, ROAD_VANISH_Y), ROAD_VANISH_Y);
    for (let y = ROAD_VANISH_Y + 12; y <= H; y += 12) {
      ctx.lineTo(roadProjectX(505, y), y);
    }
    for (let y = H; y >= ROAD_VANISH_Y; y -= 12) {
      ctx.lineTo(roadProjectX(-55, y), y);
    }
    ctx.closePath();
    ctx.clip('evenodd');
    for (let i = 0; i < 22; i += 1) {
      const targetX = (i * 97) % W;
      const progress = (i * 0.19 + animTime * 0.7) % 1;
      const endProgress = Math.min(1, progress + 0.025 + progress * 0.055);
      const centerX = 225 + escapeOffset;
      const startX = centerX + (targetX - centerX) * progress;
      const startY = ROAD_VANISH_Y + (H - ROAD_VANISH_Y) * progress;
      const endX = centerX + (targetX - centerX) * endProgress;
      const endY = ROAD_VANISH_Y + (H - ROAD_VANISH_Y) * endProgress;
      ctx.globalAlpha = 0.11 + (i % 3) * 0.035;
      ctx.strokeStyle = i % 2 ? '#43f5f2' : '#d8f7ff';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
    ctx.restore();

    const raysStillDraining = powerRaysDraining && allPowerRays.some(
      (ray) => animTime * ray.speed + ray.phase < ray.drainAt,
    );
    if ((powerTime <= 0 && !raysStillDraining) || crashing) {
      ctx.restore();
      return;
    }

    const pulse = 0.75 + Math.sin(animTime * 8) * 0.12;
    const centerX = 225 + escapeOffset * 0.4;
    const centerY = ROAD_VANISH_Y - 3 + Math.sin(animTime * 1.2) * 4;

    // Blur a band of light around the moving horizon point.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(centerX - 78, centerY + 3);
    ctx.arc(centerX, centerY, 78, Math.PI, 0);
    ctx.lineTo(centerX + 78, centerY + 3);
    ctx.closePath();
    ctx.clip('evenodd');
    ctx.filter = 'blur(15px)';
    const horizonGlow = ctx.createRadialGradient(centerX, centerY, 4, centerX, centerY, 230);
    horizonGlow.addColorStop(0, `rgba(255, 193, 132, ${0.34 * pulse})`);
    horizonGlow.addColorStop(0.45, `rgba(255, 79, 200, ${0.18 * pulse})`);
    horizonGlow.addColorStop(1, 'rgba(67, 245, 242, 0)');
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, centerY - 50, W, 50);
    ctx.restore();

    // Mask the road so the burst stays on the sky and riverbanks.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(roadProjectX(505, ROAD_VANISH_Y), ROAD_VANISH_Y);
    for (let y = ROAD_VANISH_Y + 12; y <= H; y += 12) {
      ctx.lineTo(roadProjectX(505, y), y);
    }
    for (let y = H; y >= ROAD_VANISH_Y; y -= 12) {
      ctx.lineTo(roadProjectX(-55, y), y);
    }
    ctx.closePath();
    ctx.clip('evenodd');

    // Exclude the sun disk so the light appears to pass from behind it.
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.moveTo(centerX - 78, centerY + 3);
    ctx.arc(centerX, centerY, 78, Math.PI, 0);
    ctx.lineTo(centerX + 78, centerY + 3);
    ctx.closePath();
    ctx.clip('evenodd');

    // Short, bright ray segments travel outward from the moving escape point.
    ctx.filter = 'blur(2px)';
    for (const ray of powerRays) {
      const cycle = animTime * ray.speed + ray.phase;
      if (powerRaysDraining && cycle >= ray.drainAt) continue;
      const dx = Math.cos(ray.angle);
      const dy = Math.sin(ray.angle);
      const reach = Math.min(
        dx > 0 ? (W - centerX) / dx : dx < 0 ? -centerX / dx : Infinity,
        dy > 0 ? (H - centerY) / dy : dy < 0 ? -centerY / dy : Infinity,
      );
      const progress = cycle % 1;
      const start = progress * reach;
      const end = Math.min(reach, start + ray.length);

      ctx.globalAlpha = (0.72 + ray.phase * 0.26) * pulse;
      ctx.strokeStyle = ray.color;
      ctx.shadowColor = ray.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 1.4 + ray.phase * 1.4;
      ctx.beginPath();
      ctx.moveTo(centerX + dx * start, centerY + dy * start);
      ctx.lineTo(centerX + dx * end, centerY + dy * end);
      ctx.stroke();
    }

    // A matching fan travels down from the road's moving vanishing point.
    for (const ray of lowerPowerRays) {
      const cycle = animTime * ray.speed + ray.phase;
      if (powerRaysDraining && cycle >= ray.drainAt) continue;
      const dx = Math.cos(ray.angle);
      const dy = Math.sin(ray.angle);
      const reach = Math.min(
        dx > 0 ? (W - centerX) / dx : dx < 0 ? -centerX / dx : Infinity,
        (H - centerY) / dy,
      );
      const progress = cycle % 1;
      const start = progress * reach;
      const end = Math.min(reach, start + ray.length);

      ctx.globalAlpha = (0.72 + ray.phase * 0.26) * pulse;
      ctx.strokeStyle = ray.color;
      ctx.shadowColor = ray.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 1.4 + ray.phase * 1.4;
      ctx.beginPath();
      ctx.moveTo(centerX + dx * start, centerY + dy * start);
      ctx.lineTo(centerX + dx * end, centerY + dy * end);
      ctx.stroke();
    }

    // A few rays travel horizontally along the vanishing line itself.
    for (const ray of horizonPowerRays) {
      const cycle = animTime * ray.speed + ray.phase;
      if (powerRaysDraining && cycle >= ray.drainAt) continue;
      const reach = ray.direction > 0 ? W - centerX : centerX;
      const progress = cycle % 1;
      const start = progress * reach;
      const end = Math.min(reach, start + ray.length);

      ctx.globalAlpha = (0.72 + ray.phase * 0.26) * pulse;
      ctx.strokeStyle = ray.color;
      ctx.shadowColor = ray.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 1.4 + ray.phase * 1.4;
      ctx.beginPath();
      ctx.moveTo(centerX + ray.direction * start, ROAD_VANISH_Y);
      ctx.lineTo(centerX + ray.direction * end, ROAD_VANISH_Y);
      ctx.stroke();
    }

    // Let the horizon fog sit in front of the rays without washing out the road.
    ctx.filter = 'blur(5px)';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    const rayFog = ctx.createLinearGradient(0, ROAD_VANISH_Y - 20, 0, ROAD_VANISH_Y + 24);
    rayFog.addColorStop(0, 'rgba(255, 194, 190, 0)');
    rayFog.addColorStop(0.22, 'rgba(255, 194, 190, 0.38)');
    rayFog.addColorStop(0.4, 'rgba(255, 194, 190, 0.68)');
    rayFog.addColorStop(0.5, 'rgba(255, 210, 205, 0.94)');
    rayFog.addColorStop(0.6, 'rgba(222, 174, 202, 0.68)');
    rayFog.addColorStop(0.78, 'rgba(222, 174, 202, 0.38)');
    rayFog.addColorStop(1, 'rgba(169, 187, 214, 0)');
    ctx.fillStyle = rayFog;
    ctx.fillRect(0, ROAD_VANISH_Y - 28, W, 60);
    ctx.filter = 'none';
    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawAsset(name, x, y, width, height, rotation = 0) {
    const image = art[name];
    if (!image?.complete || !image.naturalWidth) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // A soft ground shadow gives the flat SVGs a little depth without changing hitboxes.
    ctx.shadowColor = '#020a10aa';
    ctx.shadowBlur = Math.max(4, width * 0.13);
    ctx.shadowOffsetY = Math.max(3, height * 0.055);
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function drawCar(x, y) {
    const width = 142;
    // Correct most of the import stretch while keeping the car's road presence.
    const height = 130;
    const carY = y - 8
      + (jump ? -Math.sin(jump * Math.PI) * 95 : 0)
      + Math.sin(animTime * 4) * 0.8;
    const shake = crashing ? Math.sin(animTime * 65) * 7 : 0;
    const drawY = carY + (crashing ? Math.sin(animTime * 40) * 3 : 0);
    const rotation = Math.sin(animTime * 2) * 0.006
      + (crashing ? Math.sin(animTime * 24) * 0.1 : 0);

    if (crashing && Math.floor(animTime * 18) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    drawAsset('car', x + shake, drawY, width, height, rotation);
    ctx.globalAlpha = 1;

    if (powerTime > 0 && !crashing) {
      drawNitro(x + shake, drawY, rotation, height);
    }
  }

  function drawNitro(x, y, rotation, carHeight) {
    const flicker = Math.sin(animTime * 31) * 2.5 + Math.sin(animTime * 19) * 1.5;

    // The Audi's twin exhausts sit on the left side of its rear bumper.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    for (const offset of [-34, -28]) {
      const baseY = 52 * (carHeight / 145);
      const length = 25 + flicker;

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.shadowColor = '#36d9ff';
      ctx.shadowBlur = 13;
      ctx.fillStyle = '#39dfff';
      ctx.beginPath();
      ctx.moveTo(offset - 3, baseY);
      ctx.quadraticCurveTo(offset - 5, baseY + length * 0.48, offset, baseY + length);
      ctx.quadraticCurveTo(offset + 5, baseY + length * 0.48, offset + 3, baseY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#e8fdff';
      ctx.beginPath();
      ctx.moveTo(offset - 1.2, baseY);
      ctx.quadraticCurveTo(offset - 2, baseY + length * 0.38, offset, baseY + length * 0.72);
      ctx.quadraticCurveTo(offset + 2, baseY + length * 0.38, offset + 1.2, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawItem(item) {
    const progress = Math.max(0, (item.y - ROAD_VANISH_Y) / ROAD_PLAYER_DEPTH);
    const scale = 0.28 + Math.min(1, progress) * 0.82;
    // Project the lane center at the item's depth so it stays inside the
    // narrowing road from spawn through the player area.
    const x = roadProjectX(lanes[item.lane], item.y);
    const size = item.type === 'halter' ? 78 : 62;
    const height = item.type === 'halter' ? size * 0.72 : size * 1.15;
    const bob = Math.sin(animTime * 2.8 + item.lane * 1.7 + item.y * 0.008)
      * Math.min(1.5, 0.5 + scale * 0.5);
    const tilt = Math.sin(animTime * 1.8 + item.y * 0.006 + item.lane) * 0.025;

    drawAsset(item.type, x, item.y + bob, size * scale, height * scale, tilt);
  }

  function draw() {
    drawBackground();
    drawWindEffect();
    items.sort((a, b) => a.y - b.y).forEach(drawItem);
    drawCar(225, playerY);
    drawParticles();

    // A brief, low-opacity glow on each beat, phased to the playing track.
    const beatPhase = backgroundMusic.currentTime % beatDuration;
    const beatProgress = beatPhase / beatDuration;
    const fadeOut = Math.exp(-beatPhase / 0.8);
    const beatEnvelope = 0.3 + 0.7 * fadeOut;
    const beatGlow = 0.07 * beatEnvelope;
    ctx.fillStyle = `rgba(145, 55, 255, ${beatGlow})`;
    ctx.fillRect(0, 0, W, H);

    const vignette = ctx.createRadialGradient(
      W / 2, H / 2, H * 0.2,
      W / 2, H / 2, H * 0.72,
    );
    vignette.addColorStop(0, 'rgba(24, 0, 55, 0)');
    vignette.addColorStop(1, `rgba(24, 0, 55, ${beatEnvelope * 0.72})`);
    ctx.save();
    ctx.filter = 'blur(5px)';
    ctx.fillStyle = vignette;
    ctx.fillRect(-15, -15, W + 30, H + 30);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Items, scoring, collisions, and frame updates
  // ---------------------------------------------------------------------------
  function spawnItem() {
    const roll = Math.random();
    const itemLane = Math.floor(rand(0, 3));
    let type;

    if (roll < 0.4) type = 'porto';
    else if (roll < 0.64) type = 'benfica';
    else if (roll < 0.88) type = 'sporting';
    else type = 'halter';

    items.push({ lane: itemLane, y: ROAD_SPAWN_Y, type, passed: false });
  }

  function update(dt) {
    animTime += dt;
    speed = Math.min(400, 235 + score * 0.2);
    const gameSpeed = speed * (powerTime > 0 ? 2 : 1);
    score += dt * gameSpeed / 30;

    const roadMotion = crashing
      ? Math.max(0, Math.min(1, (crashTimer - 0.4) / 0.22))
      : 1;
    roadOffset += gameSpeed * dt * roadMotion;

    // Ease the road beneath the car toward the selected lane. A damped,
    // frame-rate independent response removes the abrupt snap on steering.
    visualLane += (lane - visualLane) * (1 - Math.exp(-dt * 8));

    const escapeTarget = (1 - lane) * TURN_SWEEP_DISTANCE;
    escapeOffset += (escapeTarget - escapeOffset) * (1 - Math.exp(-dt * 3.5));
    updateParticles(dt);

    if (crashing) {
      crashTimer -= dt;
      if (crashTimer <= 0) finish();
      return;
    }

    spawn -= dt;
    if (spawn <= 0) {
      spawnItem();
      spawn = rand(0.55, 0.95) * Math.max(0.55, 330 / gameSpeed);
    }

    if (powerTime > 0) {
      powerTime -= dt;
      if (powerTime <= 0) {
        power = '';
        powerEl.textContent = '—';
        powerRaysDraining = true;
        for (const ray of allPowerRays) {
          ray.drainAt = Math.ceil(animTime * ray.speed + ray.phase);
        }
      }
    }

    if (jump > 0) jump = Math.max(0, jump - dt * 1.65);
    if (slide > 0) slide = Math.max(0, slide - dt * 1.8);

    for (let i = items.length - 1; i >= 0; i -= 1) {
      const item = items[i];
      item.y += gameSpeed * dt;

      if (
        item.y > playerY - 50
        && item.y < playerY + 60
        && item.lane === lane
        && !item.passed
      ) {
        item.passed = true;
        items.splice(i, 1);

        if (item.type === 'porto') {
          coins += 1;
          score += 25;
          burst(225, item.y, '#38bdf8', 14);
          toast('+25 · FC PORTO');
        } else if (item.type === 'halter') {
          power = 'GYM';
          powerTime = 5;
          powerRaysDraining = false;
          burst(225, item.y, '#f3d46b', 18);
          toast('POWER-UP · GYM 💪');
        } else if (powerTime > 0) {
          impact(225, playerY - 8);
          toast('POWER-UP SALVOU-TE!');
        } else {
          crashing = true;
          crashTimer = 0.62;
          burst(225, playerY - 8, '#ff805c', 26);
          burst(225, playerY - 8, '#f3d46b', 12);
          return;
        }
      }

      if (item.y > 850) {
        items.splice(i, 1);
      }
    }

    scoreEl.textContent = Math.floor(score);
    coinsEl.textContent = coins;
    powerEl.textContent = power ? `${power} ${Math.ceil(powerTime)}s` : '—';

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.style.opacity = 0;
    }
  }

  function loop(now) {
    if (!running) return;

    const dt = Math.min(0.035, (now - last) / 1000);
    last = now;
    update(dt);

    if (running) {
      draw();
      requestAnimationFrame(loop);
    }
  }

  // ---------------------------------------------------------------------------
  // Controls and button handlers
  // ---------------------------------------------------------------------------
  function move(direction) {
    if (!running) return;

    if (direction === 'left') {
      lane = Math.max(0, lane - 1);
    }
    if (direction === 'right') {
      lane = Math.min(2, lane + 1);
    }
    if (direction === 'up' && jump === 0) jump = 1;
    if (direction === 'down') slide = 0.8;
  }

  const startBtn = document.getElementById('startBtn');
  startBtn.addEventListener('click', start);

  const againBtn = document.getElementById('againBtn');
  const replay = () => {
    startPanel.classList.remove('hidden');
    endPanel.classList.add('hidden');
    start();
  };
  againBtn.addEventListener('click', replay);

  window.addEventListener('keydown', (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(event.key)) {
      event.preventDefault();
    }

    if (event.key === 'ArrowLeft' || event.key === 'a') move('left');
    if (event.key === 'ArrowRight' || event.key === 'd') move('right');
    if (event.key === 'ArrowUp' || event.key === 'w' || event.key === ' ') move('up');
    if (event.key === 'ArrowDown' || event.key === 's') move('down');
  });

  let startX = 0;
  let startY = 0;

  canvas.addEventListener('pointerdown', (event) => {
    startX = event.clientX;
    startY = event.clientY;
  });

  canvas.addEventListener('pointerup', (event) => {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx < 0 ? 'left' : 'right');
    } else {
      move(dy < 0 ? 'up' : 'down');
    }
  });

  // Draw the static scene before the player starts.
  draw();
})();
