/**
 * DEFENDER — Williams Electronics 1981 style recreation
 * Multi-color raster look (not green vector monochrome).
 */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  // Near original aspect; scaled up for modern screens
  const VW = 896;
  const VH = 672;
  canvas.width = VW;
  canvas.height = VH;

  const SCAN_H = 52;
  const PLAY_TOP = SCAN_H + 2;
  const GROUND_Y = VH - 40;
  const WORLD = 3600;

  // Williams-ish 16-color palette (bright arcade primaries)
  const C = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff2020",
    orange: "#ff8800",
    yellow: "#ffff00",
    lime: "#80ff00",
    green: "#00e000",
    cyan: "#00ffff",
    blue: "#2060ff",
    purple: "#c040ff",
    magenta: "#ff00ff",
    pink: "#ff80c0",
    tan: "#c08040",
    brown: "#804000",
    gray: "#808080",
    dark: "#101018",
  };

  // Terrain palette rotation (classic multi-color mountains)
  const TERRAIN_COLS = [
    C.red, C.orange, C.yellow, C.lime, C.green, C.cyan, C.blue, C.purple, C.magenta, C.pink,
  ];

  const overlay = document.getElementById("overlay");
  const $title = document.getElementById("overlay-title");
  const $sub = document.getElementById("overlay-sub");
  const $hint = document.getElementById("overlay-hint");
  const $score = document.getElementById("score");
  const $high = document.getElementById("high-score");
  const $wave = document.getElementById("wave");
  const $bombs = document.getElementById("bombs");
  const $lives = document.getElementById("lives");
  const $humans = document.getElementById("humans-left");

  document.documentElement.style.setProperty("--board-w", VW + "px");

  // ── Audio ────────────────────────────────────────────────────────────────
  let AC = null;
  let muted = false;
  let thrustNodes = null;

  function unlockAudio() {
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === "suspended") AC.resume();
    } catch (_) {}
  }

  function tone(freq, dur, type = "square", vol = 0.04, when = 0, slideTo) {
    if (muted || !AC) return;
    try {
      const t0 = AC.currentTime + when;
      const o = AC.createOscillator();
      const g = AC.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(AC.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.03);
    } catch (_) {}
  }

  function noise(dur, vol = 0.05, when = 0, ff = 1000) {
    if (muted || !AC) return;
    try {
      const n = Math.floor(AC.sampleRate * dur);
      const buf = AC.createBuffer(1, n, AC.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = AC.createBufferSource();
      src.buffer = buf;
      const f = AC.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = ff;
      const g = AC.createGain();
      const t0 = AC.currentTime + when;
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(AC.destination);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    } catch (_) {}
  }

  function setThrust(on) {
    if (!AC || muted) {
      if (thrustNodes) {
        try { thrustNodes.o.stop(); } catch (_) {}
        thrustNodes = null;
      }
      return;
    }
    if (on) {
      if (thrustNodes) return;
      try {
        const o = AC.createOscillator();
        const g = AC.createGain();
        const f = AC.createBiquadFilter();
        o.type = "sawtooth";
        o.frequency.value = 58;
        f.type = "lowpass";
        f.frequency.value = 300;
        g.gain.value = 0.015;
        o.connect(f);
        f.connect(g);
        g.connect(AC.destination);
        o.start();
        thrustNodes = { o, g };
      } catch (_) {}
    } else if (thrustNodes) {
      try { thrustNodes.o.stop(); } catch (_) {}
      thrustNodes = null;
    }
  }

  function sfx(name) {
    unlockAudio();
    if (muted || !AC) return;
    if (name === "fire") {
      tone(920, 0.04, "square", 0.028);
      tone(460, 0.07, "square", 0.018, 0.02);
    } else if (name === "bomb") {
      noise(0.4, 0.1, 0, 350);
      tone(100, 0.45, "sawtooth", 0.06, 0, 35);
    } else if (name === "die") {
      noise(0.45, 0.09, 0, 500);
      tone(280, 0.55, "sawtooth", 0.05, 0, 40);
    } else if (name === "explode") {
      noise(0.16, 0.07, 0, 800);
      tone(180, 0.12, "square", 0.035, 0, 50);
    } else if (name === "abduct") {
      tone(240, 0.1, "sine", 0.04);
      tone(360, 0.14, "sine", 0.035, 0.1);
      tone(480, 0.18, "sine", 0.03, 0.2);
    } else if (name === "mutant") {
      tone(150, 0.1, "square", 0.05);
      tone(80, 0.22, "sawtooth", 0.04, 0.08);
    } else if (name === "rescue") {
      tone(523, 0.07, "square", 0.04);
      tone(659, 0.09, "square", 0.04, 0.07);
      tone(784, 0.12, "square", 0.04, 0.14);
    } else if (name === "land") {
      tone(392, 0.09, "square", 0.04);
      tone(523, 0.12, "square", 0.04, 0.09);
    } else if (name === "hyper") {
      tone(90, 0.35, "sawtooth", 0.05, 0, 900);
      noise(0.25, 0.05, 0, 2000);
    } else if (name === "start" || name === "wave") {
      [330, 392, 523, 659].forEach((f, i) => tone(f, 0.09, "square", 0.038, i * 0.08));
    } else if (name === "alert") {
      tone(700, 0.07, "square", 0.05);
      tone(400, 0.12, "square", 0.05, 0.09);
    } else if (name === "planet") {
      noise(0.9, 0.12, 0, 280);
      tone(70, 1.0, "sawtooth", 0.07, 0, 25);
    } else if (name === "extra") {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, "square", 0.04, i * 0.07));
    } else if (name === "spawn") {
      tone(200, 0.08, "sine", 0.03, 0, 500);
    }
  }

  // ── Math ─────────────────────────────────────────────────────────────────
  function wrap(x) {
    x %= WORLD;
    if (x < 0) x += WORLD;
    return x;
  }
  function wrapDelta(from, to) {
    let d = to - from;
    if (d > WORLD / 2) d -= WORLD;
    if (d < -WORLD / 2) d += WORLD;
    return d;
  }
  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }
  function pad(n) {
    return String(Math.floor(n) | 0).padStart(2, "0");
  }
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function chance(p) {
    return Math.random() < p;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let state = "title";
  let score = 0;
  let high = 0;
  try {
    high = Number(localStorage.getItem("defender_hi_v3") || 0);
  } catch (_) {}
  let wave = 1;
  let lives = 3;
  let bombs = 3;
  let extrasAt = 0;

  let ship = null;
  let humans = [];
  let enemies = [];
  let lasers = [];
  let shots = []; // enemy bullets + mines
  let particles = [];
  let terrain = [];
  let stars = [];
  let planetAlive = true;

  let fireCD = 0;
  let flashT = 0;
  let readyT = 0;
  let dieT = 0;
  let clearT = 0;
  let planetT = 0;
  let baiterTimer = 0;
  let landerQueue = [];
  let landerClock = 0;
  let materializeT = 0;
  let animT = 0;

  const keys = Object.create(null);
  let thrustHeld = false;
  let fireHeld = false;
  let faceLeftHeld = false;
  let faceRightHeld = false;
  let upHeld = false;
  let downHeld = false;

  // ── Terrain (color segments) ─────────────────────────────────────────────
  function buildTerrain() {
    terrain = [];
    let h = 50;
    for (let x = 0; x < WORLD; x += 12) {
      h += rnd(-10, 10);
      if (chance(0.035)) h += rnd(15, 45);
      h = clamp(h, 20, 120);
      const col = TERRAIN_COLS[((x / 48) | 0) % TERRAIN_COLS.length];
      terrain.push({ x, h, col });
    }
  }

  function groundAt(wx) {
    wx = wrap(wx);
    const step = 12;
    const i = Math.floor(wx / step) % terrain.length;
    const j = (i + 1) % terrain.length;
    const t = (wx % step) / step;
    const h = terrain[i].h * (1 - t) + terrain[j].h * t;
    return GROUND_Y - h;
  }

  function terrainColorAt(wx) {
    wx = wrap(wx);
    const i = Math.floor(wx / 12) % terrain.length;
    return terrain[i] ? terrain[i].col : C.green;
  }

  // ── HUD ──────────────────────────────────────────────────────────────────
  function hud() {
    if ($score) $score.textContent = pad(score);
    if ($high) $high.textContent = pad(high);
    if ($wave) $wave.textContent = String(wave);
    if ($bombs) $bombs.textContent = String(bombs);
    if ($lives) {
      let s = "";
      for (let i = 0; i < Math.max(0, lives); i++) s += "▲ ";
      $lives.textContent = s || "—";
    }
    if ($humans) {
      const n = humans.filter((h) =>
        h.state === "ground" || h.state === "captured" || h.state === "falling" || h.state === "carried"
      ).length;
      $humans.textContent = planetAlive ? "HUMANS " + n : "SPACE";
    }
  }

  function addScore(n) {
    score += n;
    if (score > high) {
      high = score;
      try {
        localStorage.setItem("defender_hi_v3", String(high));
      } catch (_) {}
    }
    while (score >= (extrasAt + 1) * 10000) {
      extrasAt++;
      lives++;
      bombs = Math.min(bombs + 1, 9);
      sfx("extra");
    }
    hud();
  }

  function showOV(title, sub, hint) {
    if (!overlay) return;
    overlay.classList.remove("hidden");
    if ($title) $title.textContent = title;
    if ($sub) $sub.textContent = sub || "";
    if ($hint) $hint.textContent = hint || "";
  }
  function hideOV() {
    if (overlay) overlay.classList.add("hidden");
  }

  // ── Spawn ────────────────────────────────────────────────────────────────
  function spawnShip(atX) {
    ship = {
      x: atX != null ? atX : WORLD * 0.2,
      y: (PLAY_TOP + GROUND_Y) * 0.42,
      vx: 0,
      vy: 0,
      face: 1,
      alive: true,
      inv: 2200,
      carrying: null,
    };
    materializeT = 450;
    sfx("spawn");
  }

  function queueWave(n) {
    enemies = [];
    lasers = [];
    shots = [];
    particles = [];
    landerQueue = [];
    landerClock = 0;
    planetAlive = true;

    // Rebuild colorful mountains each wave if planet was destroyed
    if (!terrain.length || terrain[0].h < 10) buildTerrain();

    const nLanders = Math.min(12 + n * 3, 36);
    const nBombers = n >= 2 ? Math.min(1 + ((n / 2) | 0), 7) : 0;
    const nPods = n >= 3 ? Math.min(1 + (((n - 2) / 2) | 0), 4) : 0;

    for (let i = 0; i < nLanders; i++) {
      landerQueue.push({
        t: 180 + i * Math.max(180, 380 - n * 15) + Math.random() * 120,
        x: Math.random() * WORLD,
        y: PLAY_TOP + 50 + Math.random() * 140,
      });
    }
    for (let i = 0; i < nBombers; i++) {
      enemies.push({
        type: "bomber",
        x: Math.random() * WORLD,
        y: PLAY_TOP + 70 + Math.random() * 100,
        vx: (chance(0.5) ? -1 : 1) * (65 + n * 5),
        vy: 0,
        dropT: rnd(500, 1400),
        bob: Math.random() * 100,
        shootT: 0,
        mat: 200,
        id: Math.random(),
      });
    }
    for (let i = 0; i < nPods; i++) {
      enemies.push({
        type: "pod",
        x: Math.random() * WORLD,
        y: PLAY_TOP + 90 + Math.random() * 140,
        vx: rnd(-35, 35),
        vy: rnd(-25, 25),
        bob: 0,
        mat: 200,
        id: Math.random(),
      });
    }

    const nHum = Math.max(5, 10 - ((n - 1) / 2) | 0);
    humans = [];
    for (let i = 0; i < nHum; i++) {
      const x = wrap(((i + 0.5) / nHum) * WORLD + rnd(-30, 30));
      humans.push({
        x,
        y: groundAt(x) - 6,
        state: "ground",
        captor: null,
        vy: 0,
        walk: Math.random() * 200,
        id: Math.random(),
      });
    }

    baiterTimer = Math.max(16000, 50000 - n * 3200);
  }

  function beginWave(n) {
    wave = n;
    queueWave(n);
    spawnShip();
    state = "ready";
    readyT = 1500;
    fireCD = 0;
    flashT = 0;
    hud();
    showOV("ATTACK WAVE " + wave, "DEFEND THE HUMANOIDS", "GET READY");
    sfx(n === 1 ? "start" : "wave");
  }

  function beginGame() {
    unlockAudio();
    score = 0;
    lives = 3;
    bombs = 3;
    wave = 1;
    extrasAt = 0;
    buildTerrain();
    stars = [];
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * WORLD,
        y: PLAY_TOP + 8 + Math.random() * (GROUND_Y - PLAY_TOP - 50),
        b: 0.35 + Math.random() * 0.65,
        c: chance(0.15) ? C.cyan : chance(0.1) ? C.yellow : C.white,
        s: chance(0.2) ? 2 : 1,
      });
    }
    beginWave(1);
  }

  function burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 180;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 200 + Math.random() * 500,
        color,
        size: 1 + ((Math.random() * 2) | 0),
      });
    }
  }

  // ── Combat ───────────────────────────────────────────────────────────────
  function fireLaser() {
    if (!ship || !ship.alive || fireCD > 0 || state !== "play") return;
    fireCD = 65;
    lasers.push({
      x: ship.x + ship.face * 16,
      y: ship.y,
      face: ship.face,
      len: 340,
      life: 55,
      hitIds: Object.create(null),
    });
    sfx("fire");
  }

  function smartBomb() {
    if (!ship || !ship.alive || bombs <= 0 || state !== "play") return;
    bombs--;
    hud();
    flashT = 300;
    sfx("bomb");
    for (const e of enemies) {
      if (e.dead) continue;
      const sx = screenX(e.x);
      if (sx > -30 && sx < VW + 30) killEnemy(e, true);
    }
    shots = shots.filter((m) => {
      const sx = screenX(m.x);
      if (sx > -20 && sx < VW + 20) {
        burst(m.x, m.y, C.yellow, 5);
        return false;
      }
      return true;
    });
  }

  function hyperspace() {
    if (!ship || !ship.alive || state !== "play") return;
    sfx("hyper");
    burst(ship.x, ship.y, C.cyan, 16);
    if (ship.carrying) {
      const h = ship.carrying;
      h.state = "falling";
      h.vy = 40;
      ship.carrying = null;
    }
    ship.x = Math.random() * WORLD;
    ship.y = PLAY_TOP + 50 + Math.random() * (GROUND_Y - PLAY_TOP - 120);
    ship.vx = 0;
    ship.vy = 0;
    ship.inv = 1000;
    materializeT = 350;
    if (chance(0.22)) {
      killShip();
      return;
    }
    for (const e of enemies) {
      if (!e.dead && Math.abs(wrapDelta(ship.x, e.x)) < 18 && Math.abs(ship.y - e.y) < 16) {
        killShip();
        return;
      }
    }
    burst(ship.x, ship.y, C.white, 10);
  }

  function killEnemy(e, fromBomb) {
    if (e.dead) return;
    e.dead = true;
    let pts = 150;
    if (e.type === "bomber") pts = 250;
    else if (e.type === "pod") pts = 1000;
    else if (e.type === "baiter") pts = 200;
    addScore(pts);

    if (e.carrying) {
      e.carrying.state = "falling";
      e.carrying.captor = null;
      e.carrying.vy = 15;
      e.carrying = null;
    }
    if (e.type === "pod") {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        enemies.push({
          type: "swarmer",
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 130,
          vy: Math.sin(a) * 130,
          bob: 0,
          life: 18000,
          mat: 0,
          id: Math.random(),
        });
      }
    }
    const col =
      e.type === "mutant"
        ? C.magenta
        : e.type === "baiter"
          ? C.red
          : e.type === "bomber"
            ? C.blue
            : e.type === "pod" || e.type === "swarmer"
              ? C.orange
              : C.lime;
    burst(e.x, e.y, col, fromBomb ? 8 : 14);
    sfx("explode");
  }

  function killShip() {
    if (!ship || !ship.alive) return;
    if (ship.carrying) {
      ship.carrying.state = "falling";
      ship.carrying.vy = 50;
      ship.carrying = null;
    }
    burst(ship.x, ship.y, C.white, 20);
    burst(ship.x, ship.y, C.cyan, 10);
    sfx("die");
    ship.alive = false;
    setThrust(false);
    lives--;
    hud();
    state = "die";
    dieT = 1500;
  }

  function destroyPlanet() {
    if (!planetAlive) return;
    planetAlive = false;
    sfx("planet");
    for (const h of humans) {
      if (h.state === "ground" || h.state === "falling") {
        h.state = "dead";
        burst(h.x, h.y, C.orange, 6);
      } else if (h.state === "captured" && h.captor) {
        h.state = "gone";
        h.captor.carrying = null;
        h.captor.type = "mutant";
      } else if (h.state === "carried") {
        h.state = "dead";
        if (ship) ship.carrying = null;
      }
    }
    for (const e of enemies) {
      if (e.type === "lander") {
        if (e.carrying) {
          e.carrying.state = "gone";
          e.carrying = null;
        }
        e.type = "mutant";
      }
    }
    for (const t of terrain) t.h = Math.max(3, t.h * 0.12);
    state = "planet";
    planetT = 1300;
    showOV("PLANET DESTROYED", "MUTANT ATTACK", "");
  }

  function checkPlanet() {
    if (!planetAlive) return;
    const any = humans.some(
      (h) =>
        h.state === "ground" ||
        h.state === "captured" ||
        h.state === "falling" ||
        h.state === "carried"
    );
    if (!any) destroyPlanet();
  }

  // Camera: ship fixed on screen, look ahead in face direction
  function shipScreenX() {
    return ship && ship.alive ? (ship.face > 0 ? VW * 0.3 : VW * 0.7) : VW * 0.4;
  }

  function screenX(wx) {
    const origin = (ship ? ship.x : 0) - shipScreenX();
    let sx = wx - origin;
    while (sx < -WORLD * 0.5) sx += WORLD;
    while (sx > WORLD * 0.5) sx -= WORLD;
    return sx;
  }

  // ── Update ───────────────────────────────────────────────────────────────
  function updateShip(dt) {
    if (!ship || !ship.alive) return;

    const thr =
      thrustHeld ||
      keys.ShiftLeft ||
      keys.ShiftRight ||
      keys.KeyZ ||
      keys.z ||
      keys.Z;
    const up = upHeld || keys.ArrowUp || keys.KeyW || keys.w || keys.W;
    const dn = downHeld || keys.ArrowDown || keys.KeyS || keys.s || keys.S;
    const rev =
      faceLeftHeld || keys.ArrowLeft || keys.KeyA || keys.a || keys.A;
    const fwd =
      faceRightHeld || keys.ArrowRight || keys.KeyD || keys.d || keys.D;

    if (rev) ship.face = -1;
    if (fwd) ship.face = 1;

    // Thrust + inertia
    if (thr) {
      ship.vx += ship.face * 540 * (dt / 1000);
      setThrust(true);
    } else {
      setThrust(false);
      ship.vx *= Math.pow(0.93, dt / 16);
    }
    if (up) ship.vy -= 720 * (dt / 1000);
    if (dn) ship.vy += 720 * (dt / 1000);
    if (!up && !dn) ship.vy *= Math.pow(0.86, dt / 16);

    ship.vx = clamp(ship.vx, -400, 400);
    ship.vy = clamp(ship.vy, -320, 320);
    ship.x = wrap(ship.x + ship.vx * (dt / 1000));
    ship.y += ship.vy * (dt / 1000);

    const gY = planetAlive ? groundAt(ship.x) - 14 : GROUND_Y + 30;
    if (ship.y > gY) {
      ship.y = gY;
      ship.vy = Math.min(0, ship.vy);
    }
    if (ship.y < PLAY_TOP + 18) {
      ship.y = PLAY_TOP + 18;
      ship.vy = Math.max(0, ship.vy);
    }

    if (ship.inv > 0) ship.inv -= dt;
    if (materializeT > 0) materializeT -= dt;

    // Carry / land human
    if (ship.carrying) {
      const h = ship.carrying;
      h.x = ship.x;
      h.y = ship.y + 18;
      if (planetAlive) {
        const g = groundAt(ship.x) - 6;
        if (ship.y > g - 30 && Math.abs(ship.vy) < 90 && Math.abs(ship.vx) < 140) {
          h.state = "ground";
          h.y = g;
          h.vy = 0;
          ship.carrying = null;
          addScore(500);
          sfx("land");
        }
      }
    } else {
      for (const h of humans) {
        if (h.state !== "falling") continue;
        if (Math.abs(wrapDelta(ship.x, h.x)) < 22 && Math.abs(ship.y - h.y) < 20) {
          h.state = "carried";
          h.vy = 0;
          ship.carrying = h;
          addScore(500);
          sfx("rescue");
          break;
        }
      }
    }

    if (
      fireHeld ||
      keys.Space ||
      keys[" "] ||
      keys.Spacebar
    ) {
      fireLaser();
    }
  }

  function updateLasers(dt) {
    for (const L of lasers) {
      L.life -= dt;
      L.x = wrap(L.x + L.face * 950 * (dt / 1000));
      for (const e of enemies) {
        if (e.dead || L.hitIds[e.id]) continue;
        if (Math.abs(e.y - L.y) > 12) continue;
        const dx = wrapDelta(L.x, e.x);
        const hit =
          (L.face > 0 && dx >= -10 && dx <= L.len) ||
          (L.face < 0 && dx <= 10 && dx >= -L.len);
        if (hit) {
          L.hitIds[e.id] = 1;
          killEnemy(e, false);
        }
      }
      for (let i = shots.length - 1; i >= 0; i--) {
        const m = shots[i];
        if (Math.abs(m.y - L.y) > 12) continue;
        const dx = wrapDelta(L.x, m.x);
        if (
          (L.face > 0 && dx >= -10 && dx <= L.len) ||
          (L.face < 0 && dx <= 10 && dx >= -L.len)
        ) {
          burst(m.x, m.y, C.yellow, 5);
          shots.splice(i, 1);
        }
      }
    }
    lasers = lasers.filter((L) => L.life > 0);
  }

  function updateHumans(dt) {
    for (const h of humans) {
      h.walk += dt;
      if (h.state === "ground") {
        h.y = groundAt(h.x) - 6;
        h.x = wrap(h.x + Math.sin(h.walk / 450) * 0.012 * dt);
      } else if (h.state === "captured" && h.captor && !h.captor.dead) {
        h.x = h.captor.x;
        h.y = h.captor.y + 16;
      } else if (h.state === "falling") {
        h.vy += 240 * (dt / 1000);
        h.y += h.vy * (dt / 1000);
        if (!planetAlive) {
          if (h.y > VH + 50) h.state = "dead";
          continue;
        }
        const g = groundAt(h.x) - 6;
        if (h.y >= g) {
          if (h.vy > 210) {
            h.state = "dead";
            burst(h.x, h.y, C.orange, 8);
            sfx("explode");
            checkPlanet();
          } else {
            h.state = "ground";
            h.y = g;
            h.vy = 0;
          }
        }
      }
    }
  }

  function spawnLander(spec) {
    enemies.push({
      type: "lander",
      x: wrap(spec.x),
      y: spec.y,
      vx: rnd(-25, 25),
      vy: 0,
      target: null,
      carrying: null,
      bob: Math.random() * 100,
      shootT: rnd(700, 2000),
      mat: 250,
      id: Math.random(),
    });
    burst(spec.x, spec.y, C.lime, 8);
    sfx("spawn");
  }

  function updateEnemies(dt) {
    if (landerQueue.length) {
      landerClock += dt;
      while (landerQueue.length && landerClock >= landerQueue[0].t) {
        spawnLander(landerQueue.shift());
      }
    }

    const free = humans.filter((h) => h.state === "ground");

    for (const e of enemies) {
      if (e.dead) continue;
      e.bob += dt;
      if (e.mat > 0) e.mat -= dt;

      if (e.type === "lander") {
        if (e.carrying) {
          e.vy = -75 - wave * 2;
          e.vx *= 0.98;
          e.y += e.vy * (dt / 1000);
          e.x = wrap(e.x + e.vx * (dt / 1000));
          if (e.y <= PLAY_TOP + 20) {
            e.carrying.state = "gone";
            e.carrying.captor = null;
            e.carrying = null;
            e.type = "mutant";
            e.vx = rnd(-150, 150);
            e.vy = rnd(-110, 110);
            sfx("mutant");
            checkPlanet();
          }
        } else {
          if (planetAlive && free.length) {
            if (!e.target || e.target.state !== "ground") {
              let best = null;
              let bestD = 1e9;
              for (const h of free) {
                const d = Math.abs(wrapDelta(e.x, h.x));
                if (d < bestD) {
                  bestD = d;
                  best = h;
                }
              }
              e.target = best;
            }
            if (e.target) {
              const dx = wrapDelta(e.x, e.target.x);
              const ty = e.target.y - 24;
              e.vx += Math.sign(dx || 1) * 95 * (dt / 1000);
              e.vy += Math.sign(ty - e.y || 1) * 75 * (dt / 1000);
              if (Math.abs(dx) < 14 && Math.abs(e.y - ty) < 14) {
                e.carrying = e.target;
                e.target.state = "captured";
                e.target.captor = e;
                e.target = null;
                sfx("abduct");
              }
            }
          } else if (ship && ship.alive) {
            e.vx += Math.sign(wrapDelta(e.x, ship.x) || 1) * 70 * (dt / 1000);
            e.vy += Math.sign(ship.y - e.y || 1) * 50 * (dt / 1000);
          }
          e.vx = clamp(e.vx, -105 - wave * 3, 105 + wave * 3);
          e.vy = clamp(e.vy, -95, 95);
          e.x = wrap(e.x + e.vx * (dt / 1000));
          e.y += e.vy * (dt / 1000);
          const gY = planetAlive ? groundAt(e.x) - 18 : GROUND_Y;
          if (e.y > gY) {
            e.y = gY;
            e.vy = -25;
          }
          if (e.y < PLAY_TOP + 28) e.vy = Math.abs(e.vy);
        }
        e.shootT -= dt;
        if (e.shootT <= 0 && ship && ship.alive && Math.abs(wrapDelta(e.x, ship.x)) < VW * 0.75) {
          e.shootT = 1300 + Math.random() * 1800;
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          shots.push({
            x: e.x,
            y: e.y,
            vx: (dx / len) * 170,
            vy: (dy / len) * 170,
            life: 2400,
            mine: false,
          });
        }
      } else if (e.type === "mutant") {
        if (ship && ship.alive) {
          e.vx += Math.sign(wrapDelta(e.x, ship.x) || 1) * 210 * (dt / 1000);
          e.vy += Math.sign(ship.y - e.y || 1) * 180 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -230 - wave * 4, 230 + wave * 4);
        e.vy = clamp(e.vy, -210, 210);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), PLAY_TOP + 22, GROUND_Y - 8);
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 16 && Math.abs(e.y - ship.y) < 14) killShip();
        }
        e.shootT = (e.shootT || 500) - dt;
        if (e.shootT <= 0 && ship && ship.alive) {
          e.shootT = 650;
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          shots.push({
            x: e.x,
            y: e.y,
            vx: (dx / len) * 230,
            vy: (dy / len) * 230,
            life: 1700,
            mine: false,
          });
        }
      } else if (e.type === "bomber") {
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y += Math.sin(e.bob / 160) * 0.35;
        e.y = clamp(e.y, PLAY_TOP + 40, GROUND_Y - 90);
        e.dropT -= dt;
        if (e.dropT <= 0) {
          e.dropT = 800 + Math.random() * 1200;
          shots.push({
            x: e.x,
            y: e.y + 8,
            vx: 0,
            vy: 0,
            life: 14000,
            mine: true,
          });
        }
      } else if (e.type === "pod") {
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y += e.vy * (dt / 1000);
        if (e.y < PLAY_TOP + 40 || e.y > GROUND_Y - 40) e.vy *= -1;
        if (ship && ship.alive) e.vx += Math.sign(wrapDelta(e.x, ship.x) || 1) * 12 * (dt / 1000);
        e.vx = clamp(e.vx, -55, 55);
      } else if (e.type === "swarmer") {
        e.life = (e.life || 15000) - dt;
        if (e.life <= 0) {
          e.dead = true;
          continue;
        }
        if (ship && ship.alive) {
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          e.vx += (dx / len) * 300 * (dt / 1000);
          e.vy += (dy / len) * 300 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -270, 270);
        e.vy = clamp(e.vy, -270, 270);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), PLAY_TOP + 20, GROUND_Y - 10);
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 12 && Math.abs(e.y - ship.y) < 12) killShip();
        }
      } else if (e.type === "baiter") {
        if (ship && ship.alive) {
          e.vx += Math.sign(wrapDelta(e.x, ship.x) || 1) * 340 * (dt / 1000);
          e.vy += Math.sign(ship.y - e.y || 1) * 300 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -360, 360);
        e.vy = clamp(e.vy, -320, 320);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), PLAY_TOP + 20, GROUND_Y - 10);
        e.shootT = (e.shootT || 350) - dt;
        if (e.shootT <= 0 && ship && ship.alive) {
          e.shootT = 420;
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          shots.push({
            x: e.x,
            y: e.y,
            vx: (dx / len) * 290,
            vy: (dy / len) * 290,
            life: 1300,
            mine: false,
          });
        }
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 15 && Math.abs(e.y - ship.y) < 13) killShip();
        }
      }

      if (
        ship &&
        ship.alive &&
        ship.inv <= 0 &&
        (e.type === "lander" || e.type === "bomber" || e.type === "pod")
      ) {
        if (Math.abs(wrapDelta(e.x, ship.x)) < 16 && Math.abs(e.y - ship.y) < 14) {
          killEnemy(e, false);
          killShip();
        }
      }
    }

    enemies = enemies.filter((e) => !e.dead);

    if (state === "play" && enemies.length === 0 && landerQueue.length === 0) {
      state = "clear";
      clearT = 2000;
      sfx("wave");
      showOV("ATTACK WAVE " + wave, "COMPLETED", "");
    }

    if (state === "play") {
      baiterTimer -= dt;
      if (baiterTimer <= 0) {
        baiterTimer = Math.max(8000, 12000 - wave * 300);
        enemies.push({
          type: "baiter",
          x: wrap((ship ? ship.x : 0) + WORLD * 0.4),
          y: PLAY_TOP + 60 + Math.random() * 140,
          vx: 0,
          vy: 0,
          bob: 0,
          shootT: 250,
          mat: 150,
          id: Math.random(),
        });
        sfx("alert");
      }
    }
  }

  function updateShots(dt) {
    for (const m of shots) {
      if (!m.mine) {
        m.x = wrap(m.x + m.vx * (dt / 1000));
        m.y += m.vy * (dt / 1000);
      }
      m.life -= dt;
      if (ship && ship.alive && ship.inv <= 0) {
        if (Math.abs(wrapDelta(m.x, ship.x)) < 12 && Math.abs(m.y - ship.y) < 12) {
          m.life = 0;
          killShip();
        }
      }
    }
    shots = shots.filter((m) => m.life > 0 && m.y > PLAY_TOP - 30 && m.y < VH + 40);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x = wrap(p.x + p.vx * (dt / 1000));
      p.y += p.vy * (dt / 1000);
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function update(dt) {
    animT += dt;
    if (fireCD > 0) fireCD -= dt;
    if (flashT > 0) flashT -= dt;

    if (state === "title" || state === "over" || state === "pause") return;

    if (state === "ready") {
      readyT -= dt;
      if (readyT <= 0) {
        state = "play";
        hideOV();
      }
      return;
    }

    if (state === "die") {
      dieT -= dt;
      updateParticles(dt);
      if (dieT <= 0) {
        if (lives <= 0) {
          state = "over";
          setThrust(false);
          showOV("GAME OVER", "SCORE " + pad(score), "PRESS SPACE OR TAP");
        } else {
          spawnShip(ship ? ship.x : undefined);
          state = "ready";
          readyT = 1100;
          showOV("GET READY", "SHIPS " + lives, "");
        }
      }
      return;
    }

    if (state === "clear") {
      clearT -= dt;
      updateParticles(dt);
      if (clearT <= 0) beginWave(wave + 1);
      return;
    }

    if (state === "planet") {
      planetT -= dt;
      updateParticles(dt);
      if (planetT <= 0) {
        state = "play";
        hideOV();
      }
      // still run combat during mutant phase intro
      if (planetT > 400) return;
    }

    if (state !== "play" && state !== "planet") return;

    updateShip(dt);
    updateLasers(dt);
    updateHumans(dt);
    updateEnemies(dt);
    updateShots(dt);
    updateParticles(dt);
    hud();
  }

  // ── Draw (multi-color raster) ────────────────────────────────────────────
  function fillRect(x, y, w, h, col) {
    ctx.fillStyle = col;
    ctx.fillRect(x | 0, y | 0, w, h);
  }

  function drawScanner() {
    fillRect(0, 0, VW, SCAN_H, "#000008");
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 1;
    ctx.strokeRect(1, 1, VW - 2, SCAN_H - 2);

    // center guide
    ctx.strokeStyle = "#1a1a40";
    ctx.beginPath();
    ctx.moveTo(0, SCAN_H / 2);
    ctx.lineTo(VW, SCAN_H / 2);
    ctx.stroke();

    const sx = VW / WORLD;

    if (planetAlive) {
      for (let i = 0; i < terrain.length; i += 2) {
        const t = terrain[i];
        fillRect(t.x * sx, SCAN_H - 5 - t.h * 0.2, Math.max(1, 12 * sx), 2, t.col);
      }
    }

    for (const h of humans) {
      if (h.state === "dead" || h.state === "gone") continue;
      const hy = h.state === "ground" ? SCAN_H - 9 : 5 + (h.y / VH) * (SCAN_H - 12);
      fillRect(h.x * sx - 1, hy, 2, 3, C.yellow);
    }

    for (const e of enemies) {
      if (e.dead) continue;
      let col = C.lime;
      if (e.type === "mutant") col = C.magenta;
      else if (e.type === "baiter") col = C.red;
      else if (e.type === "bomber") col = C.blue;
      else if (e.type === "pod") col = C.orange;
      else if (e.type === "swarmer") col = C.orange;
      fillRect(e.x * sx - 1, 5 + (e.y / VH) * (SCAN_H - 12), 3, 3, col);
    }

    for (const m of shots) {
      if (m.mine) fillRect(m.x * sx, 5 + (m.y / VH) * (SCAN_H - 12), 2, 2, C.yellow);
    }

    if (ship && ship.alive) {
      fillRect(ship.x * sx - 2, 5 + (ship.y / VH) * (SCAN_H - 12), 4, 3, C.white);
    }

    // view window
    if (ship) {
      const origin = ship.x - shipScreenX();
      let vb = (wrap(origin) / WORLD) * VW;
      const vw = (VW / WORLD) * VW;
      ctx.strokeStyle = C.white;
      ctx.strokeRect(vb, 2, Math.max(6, vw), SCAN_H - 4);
    }
  }

  function drawStars() {
    for (const s of stars) {
      const x = screenX(s.x);
      if (x < -2 || x > VW + 2) continue;
      fillRect(x, s.y, s.s, s.s, s.c);
    }
  }

  function drawTerrain() {
    if (!planetAlive) {
      ctx.strokeStyle = C.brown;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 12);
      ctx.lineTo(VW, GROUND_Y + 12);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    const origin = (ship ? ship.x : 0) - shipScreenX();
    const start = origin - 30;
    const end = origin + VW + 40;

    // dark fill under mountains
    ctx.beginPath();
    ctx.fillStyle = "#08040c";
    let first = true;
    for (let wx = start; wx < end; wx += 10) {
      const x = screenX(wrap(wx));
      const y = groundAt(wx);
      if (first) {
        ctx.moveTo(x, VH);
        ctx.lineTo(x, y);
        first = false;
      } else ctx.lineTo(x, y);
    }
    ctx.lineTo(VW + 30, VH);
    ctx.closePath();
    ctx.fill();

    // Multi-color ridge (Williams palette rotation look)
    let prevX = null;
    let prevY = null;
    for (let wx = start; wx < end; wx += 8) {
      const x = screenX(wrap(wx));
      const y = groundAt(wx);
      if (prevX != null) {
        ctx.strokeStyle = terrainColorAt(wx);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY);
        ctx.lineTo(x, y);
        ctx.stroke();
        // secondary highlight
        ctx.strokeStyle = C.white;
        ctx.globalAlpha = 0.15;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(prevX, prevY - 2);
        ctx.lineTo(x, y - 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      prevX = x;
      prevY = y;
    }
  }

  function drawShip() {
    if (!ship || !ship.alive) return;
    if (ship.inv > 0 && ((ship.inv / 60) | 0) % 2 === 0) return;
    const x = screenX(ship.x);
    const y = ship.y;
    const f = ship.face;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);

    // Williams-style multi-color ship body (white/cyan/red accents)
    // Main hull
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-2, -8);
    ctx.lineTo(-12, -4);
    ctx.lineTo(-16, -9);
    ctx.lineTo(-18, -2);
    ctx.lineTo(-18, 2);
    ctx.lineTo(-16, 9);
    ctx.lineTo(-12, 4);
    ctx.lineTo(-2, 8);
    ctx.closePath();
    ctx.fill();

    // Cyan cockpit stripe
    fillRect(0, -3, 10, 6, C.cyan);
    // Red thruster housing
    fillRect(-18, -3, 5, 6, C.red);
    // Blue fin tips
    fillRect(-16, -9, 4, 3, C.blue);
    fillRect(-16, 6, 4, 3, C.blue);
    // Yellow nose tip
    fillRect(14, -2, 5, 4, C.yellow);

    const thr =
      thrustHeld || keys.ShiftLeft || keys.ShiftRight || keys.KeyZ || keys.z;
    if (thr) {
      const flick = Math.random() * 12;
      ctx.fillStyle = C.orange;
      ctx.beginPath();
      ctx.moveTo(-18, -4);
      ctx.lineTo(-28 - flick, 0);
      ctx.lineTo(-18, 4);
      ctx.fill();
      ctx.fillStyle = C.yellow;
      ctx.beginPath();
      ctx.moveTo(-18, -2);
      ctx.lineTo(-24 - flick * 0.5, 0);
      ctx.lineTo(-18, 2);
      ctx.fill();
      ctx.fillStyle = C.white;
      ctx.fillRect(-20, -1, 3, 2);
    }

    if (materializeT > 0) {
      ctx.strokeStyle = C.cyan;
      ctx.globalAlpha = materializeT / 450;
      ctx.lineWidth = 2;
      ctx.strokeRect(-22, -14, 44, 28);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function drawHuman(h) {
    if (h.state === "dead" || h.state === "gone") return;
    const x = screenX(h.x);
    if (x < -20 || x > VW + 20) return;
    const y = h.y | 0;
    // Yellow humanoids (classic)
    fillRect(x - 2, y - 11, 4, 4, C.yellow);
    fillRect(x - 2, y - 7, 4, 7, C.yellow);
    fillRect(x - 5, y - 6, 3, 2, C.orange);
    fillRect(x + 2, y - 6, 3, 2, C.orange);
    const leg = Math.sin(h.walk / 90) * 2;
    fillRect(x - 3, y, 2, 5 + leg, C.yellow);
    fillRect(x + 1, y, 2, 5 - leg, C.yellow);
  }

  function drawEnemy(e) {
    if (e.dead) return;
    const x = screenX(e.x);
    if (x < -50 || x > VW + 50) return;
    const y = e.y + Math.sin(e.bob / 130) * 2;
    if (e.mat > 0 && ((e.mat / 40) | 0) % 2 === 0) ctx.globalAlpha = 0.45;

    if (e.type === "lander") {
      // Green body, red dome, yellow legs — multi-color lander
      ctx.fillStyle = C.green;
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.red;
      ctx.beginPath();
      ctx.arc(x, y - 5, 7, Math.PI, 0);
      ctx.fill();
      fillRect(x - 4, y - 6, 8, 3, C.cyan);
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 4);
      ctx.lineTo(x - 12, y + 13);
      ctx.moveTo(x + 8, y + 4);
      ctx.lineTo(x + 12, y + 13);
      ctx.moveTo(x, y + 5);
      ctx.lineTo(x, y + 12);
      ctx.stroke();
      if (e.carrying) {
        ctx.strokeStyle = C.yellow;
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    } else if (e.type === "mutant") {
      // Magenta/purple aggressive mutant
      ctx.fillStyle = C.magenta;
      ctx.beginPath();
      ctx.moveTo(x, y - 12);
      ctx.lineTo(x + 12, y + 2);
      ctx.lineTo(x + 7, y + 11);
      ctx.lineTo(x - 7, y + 11);
      ctx.lineTo(x - 12, y + 2);
      ctx.closePath();
      ctx.fill();
      fillRect(x - 5, y - 2, 3, 3, C.white);
      fillRect(x + 2, y - 2, 3, 3, C.white);
      fillRect(x - 2, y + 4, 4, 2, C.pink);
    } else if (e.type === "bomber") {
      // Blue bomber with cyan lights
      ctx.fillStyle = C.blue;
      ctx.beginPath();
      ctx.moveTo(x - 18, y);
      ctx.lineTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y - 8);
      ctx.lineTo(x + 18, y);
      ctx.lineTo(x + 8, y + 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.closePath();
      ctx.fill();
      fillRect(x - 6, y - 3, 4, 4, C.cyan);
      fillRect(x + 2, y - 3, 4, 4, C.cyan);
      fillRect(x - 2, y - 2, 4, 4, C.white);
    } else if (e.type === "pod") {
      // Orange/red pod
      ctx.strokeStyle = C.orange;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 12, y - 12, 24, 24);
      ctx.strokeStyle = C.red;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      fillRect(x - 3, y - 3, 6, 6, C.yellow);
    } else if (e.type === "swarmer") {
      ctx.fillStyle = C.orange;
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 7, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 7, y);
      ctx.closePath();
      ctx.fill();
      fillRect(x - 2, y - 2, 4, 4, C.yellow);
    } else if (e.type === "baiter") {
      // Red baiter with yellow cockpit
      ctx.fillStyle = C.red;
      ctx.beginPath();
      ctx.ellipse(x, y, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      fillRect(x - 6, y - 3, 12, 6, C.yellow);
      fillRect(x - 20, y - 1, 6, 2, C.pink);
      fillRect(x + 14, y - 1, 6, 2, C.pink);
    }

    ctx.globalAlpha = 1;
  }

  function drawLasers() {
    for (const L of lasers) {
      const x0 = screenX(L.x);
      const a = clamp(L.life / 55, 0, 1);
      // Outer glow — cyan/white beam (not green monochrome)
      ctx.globalAlpha = 0.85 * a;
      ctx.strokeStyle = C.cyan;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, L.y);
      ctx.lineTo(x0 + L.face * L.len, L.y);
      ctx.stroke();
      ctx.strokeStyle = C.white;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, L.y);
      ctx.lineTo(x0 + L.face * L.len * 0.9, L.y);
      ctx.stroke();
      // nose spark
      fillRect(x0 + L.face * 4 - 1, L.y - 2, 3, 4, C.yellow);
      ctx.globalAlpha = 1;
    }
  }

  function drawShots() {
    for (const m of shots) {
      const x = screenX(m.x);
      if (x < -12 || x > VW + 12) continue;
      if (m.mine) {
        // Yellow mine cross
        fillRect(x - 4, m.y - 1, 8, 3, C.yellow);
        fillRect(x - 1, m.y - 4, 3, 8, C.yellow);
        fillRect(x - 1, m.y - 1, 3, 3, C.red);
      } else {
        fillRect(x - 2, m.y - 2, 5, 5, C.red);
        fillRect(x - 1, m.y - 1, 3, 3, C.pink);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const x = screenX(p.x);
      ctx.globalAlpha = clamp(p.life / 400, 0, 1);
      fillRect(x, p.y, p.size || 2, p.size || 2, p.color);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    // Deep space black (not green tint)
    fillRect(0, 0, VW, VH, C.black);

    if (flashT > 0) {
      ctx.fillStyle = `rgba(255,255,200,${0.25 * (flashT / 300)})`;
      ctx.fillRect(0, SCAN_H, VW, VH - SCAN_H);
    }

    drawStars();
    drawTerrain();
    for (const h of humans) drawHuman(h);
    for (const e of enemies) drawEnemy(e);
    drawShots();
    drawLasers();
    drawParticles();
    drawShip();
    drawScanner();

    // Scanner separator — multi color dashes
    for (let i = 0; i < VW; i += 16) {
      fillRect(i, SCAN_H - 1, 10, 2, TERRAIN_COLS[(i / 16) % TERRAIN_COLS.length]);
    }
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  let last = 0;
  function tick(ts) {
    if (!last) last = ts;
    let dt = ts - last;
    last = ts;
    if (dt > 50) dt = 50;
    try {
      update(dt);
      render();
    } catch (err) {
      console.error(err);
      showOV("ERROR", String(err.message || err), "RELOAD PAGE");
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ── Input ────────────────────────────────────────────────────────────────
  window.addEventListener(
    "keydown",
    (e) => {
      keys[e.code] = true;
      keys[e.key] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
      }
      unlockAudio();

      if (e.key === "m" || e.key === "M") {
        muted = !muted;
        if (muted) setThrust(false);
        return;
      }
      if (e.key === "p" || e.key === "P" || e.key === "Escape") {
        e.preventDefault();
        if (state === "play") {
          state = "pause";
          setThrust(false);
          showOV("PAUSED", "PRESS P OR SPACE", "");
        } else if (state === "pause") {
          state = "play";
          hideOV();
        }
        return;
      }
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        if (state === "title" || state === "over") beginGame();
        else if (state === "pause") {
          state = "play";
          hideOV();
        } else fireHeld = true;
        return;
      }
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        smartBomb();
        return;
      }
      if (e.key === "h" || e.key === "H") {
        e.preventDefault();
        hyperspace();
        return;
      }
    },
    { passive: false }
  );

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    keys[e.key] = false;
    if (e.code === "Space" || e.key === " ") fireHeld = false;
  });

  function bindBtn(id, down, up) {
    const el = document.getElementById(id);
    if (!el) return;
    const d = (ev) => {
      ev.preventDefault();
      unlockAudio();
      down();
    };
    const u = (ev) => {
      ev.preventDefault();
      if (up) up();
    };
    el.addEventListener("pointerdown", d);
    el.addEventListener("pointerup", u);
    el.addEventListener("pointerleave", u);
    el.addEventListener("pointercancel", u);
  }

  bindBtn("btn-up", () => (upHeld = true), () => (upHeld = false));
  bindBtn("btn-down", () => (downHeld = true), () => (downHeld = false));
  bindBtn("btn-thrust", () => (thrustHeld = true), () => (thrustHeld = false));
  bindBtn(
    "btn-reverse",
    () => {
      faceLeftHeld = true;
      if (ship) ship.face = -1;
    },
    () => (faceLeftHeld = false)
  );
  bindBtn(
    "btn-forward",
    () => {
      faceRightHeld = true;
      if (ship) ship.face = 1;
    },
    () => (faceRightHeld = false)
  );
  bindBtn(
    "btn-fire",
    () => {
      fireHeld = true;
      if (state === "title" || state === "over") beginGame();
      else if (state === "pause") {
        state = "play";
        hideOV();
      }
    },
    () => (fireHeld = false)
  );
  bindBtn("btn-bomb", () => smartBomb(), () => {});
  bindBtn("btn-hyper", () => hyperspace(), () => {});
  bindBtn(
    "btn-pause",
    () => {
      if (state === "play") {
        state = "pause";
        setThrust(false);
        showOV("PAUSED", "TAP FIRE TO RESUME", "");
      } else if (state === "pause") {
        state = "play";
        hideOV();
      } else if (state === "title" || state === "over") beginGame();
    },
    () => {}
  );
  bindBtn(
    "btn-mute",
    () => {
      muted = !muted;
      if (muted) setThrust(false);
    },
    () => {}
  );

  if (canvas) {
    canvas.tabIndex = 0;
    canvas.style.outline = "none";
  }
  if (overlay) {
    overlay.style.pointerEvents = "auto";
    overlay.addEventListener("click", () => {
      unlockAudio();
      if (state === "title" || state === "over") beginGame();
      else if (state === "pause") {
        state = "play";
        hideOV();
      }
    });
  }

  hud();
  showOV("DEFENDER", "INSERT COIN", "PRESS SPACE OR TAP TO START");
  if ($high) $high.textContent = pad(high);
})();
