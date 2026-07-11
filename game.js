/**
 * DEFENDER — Williams Electronics style (1981)
 * Horizontally scrolling rescue shooter: thrust/reverse flight, long lasers,
 * smart bombs, hyperspace, humanoid rescue, classic alien cast.
 */
(() => {
  "use strict";

  // ── Canvas / layout ──────────────────────────────────────────────────────
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const VW = 896; // wide Williams-ish playfield
  const VH = 672;
  canvas.width = VW;
  canvas.height = VH;

  const SCAN_H = 56; // radar band
  const PLAY_TOP = SCAN_H + 4;
  const GROUND_BASE = VH - 48;
  const WORLD = 4096; // planet circumference (world units)

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

  // Size CSS board to canvas aspect
  document.documentElement.style.setProperty("--board-w", VW + "px");

  // ── Audio (arcade-ish synth) ─────────────────────────────────────────────
  let AC = null;
  let muted = false;
  let thrustOsc = null;
  let thrustGain = null;

  function unlockAudio() {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (AC.state === "suspended") AC.resume();
  }

  function tone(freq, dur, type = "square", vol = 0.045, when = 0, slideTo) {
    if (muted || !AC) return;
    const t0 = AC.currentTime + when;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(AC.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.05, when = 0, filterFreq = 1200) {
    if (muted || !AC) return;
    const n = Math.floor(AC.sampleRate * dur);
    const buf = AC.createBuffer(1, n, AC.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = AC.createBufferSource();
    src.buffer = buf;
    const f = AC.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = filterFreq;
    const g = AC.createGain();
    const t0 = AC.currentTime + when;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(AC.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function setThrust(on) {
    if (muted || !AC) {
      if (thrustOsc) {
        try { thrustOsc.stop(); } catch (_) {}
        thrustOsc = null;
        thrustGain = null;
      }
      return;
    }
    if (on) {
      if (thrustOsc) return;
      thrustOsc = AC.createOscillator();
      thrustGain = AC.createGain();
      thrustOsc.type = "sawtooth";
      thrustOsc.frequency.value = 55;
      thrustGain.gain.value = 0.018;
      const f = AC.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 280;
      thrustOsc.connect(f);
      f.connect(thrustGain);
      thrustGain.connect(AC.destination);
      thrustOsc.start();
    } else if (thrustOsc) {
      try { thrustOsc.stop(); } catch (_) {}
      thrustOsc = null;
      thrustGain = null;
    }
  }

  function sfx(name) {
    unlockAudio();
    if (muted || !AC) return;
    if (name === "fire") {
      tone(880, 0.05, "square", 0.03);
      tone(440, 0.08, "square", 0.02, 0.02);
    } else if (name === "bomb") {
      noise(0.35, 0.1, 0, 400);
      tone(120, 0.4, "sawtooth", 0.06, 0, 40);
    } else if (name === "die") {
      noise(0.4, 0.08, 0, 600);
      tone(300, 0.5, "sawtooth", 0.05, 0, 40);
    } else if (name === "explode") {
      noise(0.18, 0.07, 0, 900);
      tone(200, 0.15, "square", 0.04, 0, 60);
    } else if (name === "abduct") {
      tone(220, 0.12, "sine", 0.04);
      tone(330, 0.18, "sine", 0.035, 0.1);
      tone(440, 0.22, "sine", 0.03, 0.22);
    } else if (name === "mutant") {
      tone(160, 0.08, "square", 0.05);
      tone(90, 0.2, "sawtooth", 0.045, 0.06);
    } else if (name === "rescue") {
      tone(523, 0.08, "square", 0.04);
      tone(659, 0.1, "square", 0.04, 0.08);
      tone(784, 0.14, "square", 0.04, 0.16);
    } else if (name === "land") {
      tone(392, 0.1, "square", 0.04);
      tone(523, 0.14, "square", 0.04, 0.1);
    } else if (name === "hyper") {
      tone(100, 0.35, "sawtooth", 0.05, 0, 900);
      noise(0.25, 0.05, 0, 2000);
    } else if (name === "start" || name === "wave") {
      [392, 440, 523, 659].forEach((f, i) => tone(f, 0.1, "square", 0.04, i * 0.09));
    } else if (name === "alert") {
      tone(660, 0.08, "square", 0.05);
      tone(440, 0.12, "square", 0.05, 0.1);
    } else if (name === "planet") {
      noise(0.8, 0.12, 0, 300);
      tone(80, 1.0, "sawtooth", 0.08, 0, 30);
    } else if (name === "extra") {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, "square", 0.045, i * 0.08));
    } else if (name === "materialize") {
      tone(200, 0.15, "sine", 0.04, 0, 600);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
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
    return Math.max(a, Math.min(b, v));
  }
  function pad(n) {
    return String(Math.floor(n)).padStart(2, "0");
  }
  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }
  function chance(p) {
    return Math.random() < p;
  }

  // ── State ────────────────────────────────────────────────────────────────
  let state = "title"; // title | ready | play | die | clear | over | planet
  let score = 0;
  let high = Number(localStorage.getItem("defender_high_v2") || 0);
  let wave = 1;
  let lives = 3;
  let bombs = 3;
  let extrasAt = 0; // score milestones claimed (10000 each)

  let ship = null;
  let camX = 0;
  let humans = [];
  let enemies = [];
  let lasers = []; // long beam segments
  let mines = []; // bomber mines
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
  let landerSpawnQueue = [];
  let landerSpawnT = 0;
  let materializeT = 0;

  // input
  const keys = Object.create(null);
  let thrustHeld = false;
  let fireHeld = false;

  // ── Terrain ──────────────────────────────────────────────────────────────
  function buildTerrain() {
    terrain = [];
    let h = 40;
    for (let x = 0; x < WORLD; x += 16) {
      h += rnd(-12, 12);
      h = clamp(h, 18, 110);
      // mountain peaks
      if (chance(0.04)) h = clamp(h + rnd(20, 50), 18, 130);
      terrain.push({ x, h });
    }
  }

  function groundAt(wx) {
    wx = wrap(wx);
    const step = 16;
    const i = Math.floor(wx / step) % terrain.length;
    const j = (i + 1) % terrain.length;
    const t = (wx % step) / step;
    const h = terrain[i].h * (1 - t) + terrain[j].h * t;
    return GROUND_BASE - h;
  }

  // ── HUD / overlay ────────────────────────────────────────────────────────
  function hud() {
    $score.textContent = pad(score);
    $high.textContent = pad(high);
    $wave.textContent = String(wave);
    $bombs.textContent = String(bombs);
    if ($lives) {
      $lives.textContent = "SHIPS " + "▲".repeat(Math.max(0, lives));
    }
    if ($humans) {
      const n = humans.filter((h) => h.state === "ground" || h.state === "captured" || h.state === "falling" || h.state === "carried").length;
      $humans.textContent = planetAlive ? "HUMANS " + n : "SPACE";
    }
  }

  function addScore(n) {
    score += n;
    if (score > high) {
      high = score;
      localStorage.setItem("defender_high_v2", String(high));
    }
    // Extra ship + bomb every 10,000 (Williams default)
    while (score >= (extrasAt + 1) * 10000) {
      extrasAt++;
      lives++;
      bombs = Math.min(bombs + 1, 9);
      sfx("extra");
    }
    hud();
  }

  function showOV(title, sub, hint) {
    overlay.classList.remove("hidden");
    $title.textContent = title;
    $sub.textContent = sub || "";
    if ($hint) $hint.textContent = hint || "";
  }
  function hideOV() {
    overlay.classList.add("hidden");
  }

  // ── Entities ─────────────────────────────────────────────────────────────
  function spawnShip(safeX) {
    const x = safeX != null ? safeX : WORLD * 0.25;
    ship = {
      x,
      y: (PLAY_TOP + GROUND_BASE) * 0.45,
      vx: 0,
      vy: 0,
      face: 1, // 1 right, -1 left
      alive: true,
      inv: 2000,
      carrying: null,
    };
    camX = ship.x;
    materializeT = 400;
    sfx("materialize");
  }

  function makeHuman(x) {
    return {
      x: wrap(x),
      y: 0,
      state: "ground", // ground | captured | falling | carried | dead | gone
      captor: null,
      carrier: null,
      vy: 0,
      walk: Math.random() * 200,
    };
  }

  function queueWave(n) {
    enemies = [];
    lasers = [];
    mines = [];
    particles = [];
    landerSpawnQueue = [];
    landerSpawnT = 0;
    planetAlive = true;

    // Classic-ish counts that ramp
    const nLanders = Math.min(15 + n * 3, 40);
    const nBombers = n >= 2 ? Math.min(Math.floor(n / 2) + 1, 8) : 0;
    const nPods = n >= 3 ? Math.min(Math.floor((n - 2) / 2) + 1, 5) : 0;

    // Stagger lander teleports (Williams style)
    for (let i = 0; i < nLanders; i++) {
      landerSpawnQueue.push({
        delay: 200 + i * (420 - Math.min(200, n * 12)) + Math.random() * 200,
        x: Math.random() * WORLD,
        y: PLAY_TOP + 40 + Math.random() * 160,
      });
    }
    for (let i = 0; i < nBombers; i++) {
      enemies.push({
        type: "bomber",
        x: Math.random() * WORLD,
        y: PLAY_TOP + 60 + Math.random() * 120,
        vx: (chance(0.5) ? -1 : 1) * (70 + n * 6),
        vy: 0,
        dropT: rnd(600, 1600),
        hp: 1,
        bob: Math.random() * 100,
        shootT: 0,
        materialize: 300,
      });
    }
    for (let i = 0; i < nPods; i++) {
      enemies.push({
        type: "pod",
        x: Math.random() * WORLD,
        y: PLAY_TOP + 80 + Math.random() * 160,
        vx: rnd(-40, 40),
        vy: rnd(-30, 30),
        hp: 1,
        bob: 0,
        materialize: 300,
      });
    }

    // Humanoids on surface
    const nHum = Math.max(4, 10 - Math.floor((n - 1) / 2));
    humans = [];
    for (let i = 0; i < nHum; i++) {
      const x = ((i + 0.5) / nHum) * WORLD + rnd(-40, 40);
      const h = makeHuman(x);
      h.y = groundAt(h.x) - 6;
      humans.push(h);
    }

    baiterTimer = Math.max(18000, 55000 - n * 3500);
  }

  function beginWave(n) {
    wave = n;
    queueWave(n);
    spawnShip();
    state = "ready";
    readyT = 1600;
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
    for (let i = 0; i < 120; i++) {
      stars.push({
        x: Math.random() * WORLD,
        y: PLAY_TOP + Math.random() * (GROUND_BASE - PLAY_TOP - 40),
        b: 0.25 + Math.random() * 0.75,
        s: Math.random() < 0.15 ? 2 : 1,
      });
    }
    beginWave(1);
  }

  function burst(x, y, color, n = 12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 160;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 250 + Math.random() * 450,
        color,
        size: 1 + (Math.random() * 2) | 0,
      });
    }
  }

  // ── Combat ───────────────────────────────────────────────────────────────
  function fireLaser() {
    if (!ship || !ship.alive || fireCD > 0 || state !== "play") return;
    fireCD = 70; // rapid fire like arcade
    // Long horizontal beam ahead of ship (Williams hallmark)
    const len = 320;
    lasers.push({
      x: ship.x + ship.face * 14,
      y: ship.y,
      face: ship.face,
      len,
      life: 70,
      dmgLeft: true, // hits once per enemy pass tracked via enemy id set
      hit: new Set(),
    });
    sfx("fire");
  }

  function smartBomb() {
    if (!ship || !ship.alive || bombs <= 0 || state !== "play") return;
    bombs--;
    hud();
    flashT = 280;
    sfx("bomb");

    // Destroy every enemy currently visible on screen
    const left = camX - VW * 0.15;
    const right = left + VW;

    function onScreen(wx) {
      const sx = screenX(wx);
      return sx > -20 && sx < VW + 20;
    }

    for (const e of enemies) {
      if (e.dead) continue;
      if (onScreen(e.x)) killEnemy(e, true);
    }
    // Mines on screen
    mines = mines.filter((m) => {
      if (onScreen(m.x)) {
        burst(m.x, m.y, "#ff0", 6);
        return false;
      }
      return true;
    });
  }

  function hyperspace() {
    if (!ship || !ship.alive || state !== "play") return;
    sfx("hyper");
    burst(ship.x, ship.y, "#0ff", 16);
    // Drop carried human (risk)
    if (ship.carrying) {
      const h = ship.carrying;
      h.state = "falling";
      h.carrier = null;
      h.vy = 30;
      ship.carrying = null;
    }
    ship.x = Math.random() * WORLD;
    ship.y = PLAY_TOP + 40 + Math.random() * (GROUND_BASE - PLAY_TOP - 100);
    ship.vx = 0;
    ship.vy = 0;
    ship.inv = 1200;
    materializeT = 350;
    // ~25% bad jump (arcade is famously risky)
    if (chance(0.22)) {
      killShip();
      return;
    }
    // materialize into enemy / mine
    for (const e of enemies) {
      if (e.dead) continue;
      if (Math.abs(wrapDelta(ship.x, e.x)) < 18 && Math.abs(ship.y - e.y) < 16) {
        killShip();
        return;
      }
    }
    for (const m of mines) {
      if (Math.abs(wrapDelta(ship.x, m.x)) < 14 && Math.abs(ship.y - m.y) < 14) {
        killShip();
        return;
      }
    }
    burst(ship.x, ship.y, "#0f0", 12);
  }

  function killEnemy(e, fromBomb) {
    if (e.dead) return;
    e.dead = true;

    let pts = 150;
    if (e.type === "lander") pts = 150;
    else if (e.type === "mutant") pts = 150;
    else if (e.type === "bomber") pts = 250;
    else if (e.type === "pod") pts = 1000;
    else if (e.type === "swarmer") pts = 150;
    else if (e.type === "baiter") pts = 200;
    addScore(pts);

    // Drop carried human
    if (e.carrying) {
      const h = e.carrying;
      h.state = "falling";
      h.captor = null;
      h.vy = 20;
      e.carrying = null;
    }

    // Pod → Swarmers
    if (e.type === "pod") {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.random();
        enemies.push({
          type: "swarmer",
          x: e.x,
          y: e.y,
          vx: Math.cos(a) * 120,
          vy: Math.sin(a) * 120,
          hp: 1,
          bob: 0,
          life: 20000,
          materialize: 0,
        });
      }
    }

    const col =
      e.type === "mutant" ? "#f0f" : e.type === "baiter" ? "#f44" : "#0f0";
    burst(e.x, e.y, col, fromBomb ? 8 : 14);
    sfx("explode");
  }

  function killShip() {
    if (!ship || !ship.alive) return;
    if (ship.carrying) {
      const h = ship.carrying;
      h.state = "falling";
      h.carrier = null;
      h.vy = 40;
      ship.carrying = null;
    }
    burst(ship.x, ship.y, "#fff", 18);
    burst(ship.x, ship.y, "#0f0", 10);
    sfx("die");
    ship.alive = false;
    setThrust(false);
    lives--;
    hud();
    state = "die";
    dieT = 1600;
  }

  function destroyPlanet() {
    if (!planetAlive) return;
    planetAlive = false;
    sfx("planet");
    // All remaining ground humans die; captives become mutants immediately
    for (const h of humans) {
      if (h.state === "ground" || h.state === "falling") {
        h.state = "dead";
        burst(h.x, h.y, "#f80", 5);
      } else if (h.state === "captured" && h.captor) {
        h.state = "gone";
        h.captor.carrying = null;
        h.captor.type = "mutant";
        h.captor.vx = rnd(-100, 100);
        h.captor.vy = rnd(-80, 80);
      } else if (h.state === "carried") {
        h.state = "dead";
        if (ship) ship.carrying = null;
      }
    }
    // Remaining landers mutate
    for (const e of enemies) {
      if (e.type === "lander") {
        if (e.carrying) {
          e.carrying.state = "gone";
          e.carrying = null;
        }
        e.type = "mutant";
      }
    }
    // Terrain flash / flatten feel
    for (const t of terrain) t.h = Math.max(4, t.h * 0.15);
    state = "planet";
    planetT = 1400;
    showOV("PLANET DESTROYED", "MUTANT ATTACK", "");
  }

  // ── Screen mapping ───────────────────────────────────────────────────────
  // Ship stays ~35% from facing-forward edge so you see ahead
  function updateCamera() {
    if (!ship) return;
    // Keep ship near horizontal center-left/right depending on face
    const desired = ship.face > 0 ? VW * 0.32 : VW * 0.68;
    // camX is world-x that maps to screen 0... actually we use screenX with cam as ship.x - offset
    camX = ship.x;
  }

  function screenX(wx) {
    // Place ship at fixed screen position based on facing (see ahead)
    const shipScreen =
      ship && ship.alive ? (ship.face > 0 ? VW * 0.32 : VW * 0.68) : VW * 0.4;
    const origin = (ship ? ship.x : camX) - shipScreen;
    let sx = wx - origin;
    while (sx < -WORLD * 0.5) sx += WORLD;
    while (sx > WORLD * 0.5) sx -= WORLD;
    return sx;
  }

  // ── Update systems ───────────────────────────────────────────────────────
  function updateShip(dt) {
    if (!ship || !ship.alive) return;
    const thr =
      thrustHeld ||
      keys["ShiftLeft"] ||
      keys["ShiftRight"] ||
      keys["KeyZ"] ||
      keys["z"] ||
      keys["Z"];
    const up = keys["ArrowUp"] || keys["w"] || keys["W"] || keys["KeyW"] || keys._up;
    const dn = keys["ArrowDown"] || keys["s"] || keys["S"] || keys["KeyS"] || keys._down;
    const rev =
      keys["ArrowLeft"] ||
      keys["a"] ||
      keys["A"] ||
      keys["KeyA"] ||
      keys._rev;
    // Right / FWD is face-right only (not thrust) — arcade reverse is separate
    const faceR =
      keys["ArrowRight"] ||
      keys["d"] ||
      keys["D"] ||
      keys["KeyD"] ||
      keys._fwd;

    // Reverse / face
    if (rev) ship.face = -1;
    if (faceR) ship.face = 1;

    // Thrust: accelerate along face — heavy inertia (Williams feel)
    const maxSpeed = 380;
    if (thr) {
      ship.vx += ship.face * 520 * (dt / 1000);
      setThrust(true);
    } else {
      setThrust(false);
      // slight vacuum drag
      ship.vx *= Math.pow(0.92, dt / 16);
    }
    // Vertical is direct but with lag (joystick elevation)
    const vertAcc = 700;
    if (up) ship.vy -= vertAcc * (dt / 1000);
    if (dn) ship.vy += vertAcc * (dt / 1000);
    if (!up && !dn) ship.vy *= Math.pow(0.85, dt / 16);

    ship.vx = clamp(ship.vx, -maxSpeed, maxSpeed);
    ship.vy = clamp(ship.vy, -300, 300);

    ship.x = wrap(ship.x + ship.vx * (dt / 1000));
    ship.y += ship.vy * (dt / 1000);

    // Bounds
    const gY = planetAlive ? groundAt(ship.x) - 12 : GROUND_BASE + 20;
    if (ship.y > gY) {
      ship.y = gY;
      ship.vy = Math.min(0, ship.vy);
    }
    if (ship.y < PLAY_TOP + 16) {
      ship.y = PLAY_TOP + 16;
      ship.vy = Math.max(0, ship.vy);
    }

    if (ship.inv > 0) ship.inv -= dt;
    if (materializeT > 0) materializeT -= dt;

    // Carry human under ship
    if (ship.carrying) {
      const h = ship.carrying;
      h.x = ship.x;
      h.y = ship.y + 16;
      // Land human: fly low and slow near ground
      if (planetAlive) {
        const ground = groundAt(ship.x) - 6;
        if (ship.y > ground - 28 && Math.abs(ship.vy) < 80 && Math.abs(ship.vx) < 120) {
          h.state = "ground";
          h.carrier = null;
          h.y = ground;
          h.vy = 0;
          ship.carrying = null;
          addScore(500);
          sfx("land");
        }
      }
    }

    // Catch falling humans
    if (!ship.carrying) {
      for (const h of humans) {
        if (h.state !== "falling") continue;
        if (Math.abs(wrapDelta(ship.x, h.x)) < 20 && Math.abs(ship.y - h.y) < 18) {
          h.state = "carried";
          h.carrier = ship;
          h.captor = null;
          h.vy = 0;
          ship.carrying = h;
          addScore(500);
          sfx("rescue");
          break;
        }
      }
    }

    // Continuous fire while held
    if (fireHeld || keys[" "] || keys["Space"] || keys["Spacebar"]) {
      fireLaser();
    }

    updateCamera();
  }

  function updateLasers(dt) {
    for (const L of lasers) {
      L.life -= dt;
      // Beam is instant-ish horizontal volume; move slightly with face
      L.x = wrap(L.x + L.face * 900 * (dt / 1000));

      for (const e of enemies) {
        if (e.dead || L.hit.has(e)) continue;
        // Beam hits if enemy y near beam and x within beam span in face direction
        if (Math.abs(e.y - L.y) > 10) continue;
        const dx = wrapDelta(L.x, e.x);
        // laser extends in face direction from L.x
        if (L.face > 0 && dx >= -8 && dx <= L.len) {
          L.hit.add(e);
          killEnemy(e, false);
        } else if (L.face < 0 && dx <= 8 && dx >= -L.len) {
          L.hit.add(e);
          killEnemy(e, false);
        }
      }
      // Mines
      for (let i = mines.length - 1; i >= 0; i--) {
        const m = mines[i];
        if (Math.abs(m.y - L.y) > 10) continue;
        const dx = wrapDelta(L.x, m.x);
        if ((L.face > 0 && dx >= -8 && dx <= L.len) || (L.face < 0 && dx <= 8 && dx >= -L.len)) {
          burst(m.x, m.y, "#ff0", 6);
          mines.splice(i, 1);
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
        // tiny wander
        h.x = wrap(h.x + Math.sin(h.walk / 400) * 0.015 * dt);
      } else if (h.state === "captured" && h.captor && !h.captor.dead) {
        h.x = h.captor.x;
        h.y = h.captor.y + 14;
      } else if (h.state === "falling") {
        h.vy += 220 * (dt / 1000);
        h.y += h.vy * (dt / 1000);
        if (!planetAlive) {
          // fall forever / die
          if (h.y > VH + 40) h.state = "dead";
          continue;
        }
        const g = groundAt(h.x) - 6;
        if (h.y >= g) {
          if (h.vy > 200) {
            h.state = "dead";
            burst(h.x, h.y, "#f80", 8);
            sfx("explode");
            checkPlanetCollapse();
          } else {
            h.state = "ground";
            h.y = g;
            h.vy = 0;
          }
        }
      } else if (h.state === "carried") {
        // position set by ship
      }
    }
  }

  function checkPlanetCollapse() {
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

  function spawnLander(spec) {
    enemies.push({
      type: "lander",
      x: wrap(spec.x),
      y: spec.y,
      vx: rnd(-30, 30),
      vy: 0,
      target: null,
      carrying: null,
      hp: 1,
      bob: Math.random() * 100,
      shootT: rnd(800, 2200),
      materialize: 280,
    });
    burst(spec.x, spec.y, "#0f0", 6);
  }

  function updateEnemies(dt) {
    // Staggered lander materialization
    if (landerSpawnQueue.length) {
      landerSpawnT += dt;
      while (landerSpawnQueue.length && landerSpawnT >= landerSpawnQueue[0].delay) {
        const spec = landerSpawnQueue.shift();
        spawnLander(spec);
      }
    }

    const freeHumans = humans.filter((h) => h.state === "ground");

    for (const e of enemies) {
      if (e.dead) continue;
      e.bob += dt;
      if (e.materialize > 0) e.materialize -= dt;

      if (e.type === "lander") {
        if (e.carrying) {
          // Climb to top of sky → mutate
          e.vy = -70 - wave * 2;
          e.vx *= 0.98;
          e.y += e.vy * (dt / 1000);
          e.x = wrap(e.x + e.vx * (dt / 1000));
          if (e.y <= PLAY_TOP + 18) {
            // Mutate
            const h = e.carrying;
            h.state = "gone";
            h.captor = null;
            e.carrying = null;
            e.type = "mutant";
            e.vx = rnd(-140, 140);
            e.vy = rnd(-100, 100);
            sfx("mutant");
            checkPlanetCollapse();
          }
        } else {
          // Seek human if planet alive
          if (planetAlive && freeHumans.length) {
            if (!e.target || e.target.state !== "ground") {
              // nearest free human
              let best = null;
              let bestD = 1e9;
              for (const h of freeHumans) {
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
              const ty = e.target.y - 22;
              e.vx += Math.sign(dx) * 90 * (dt / 1000);
              e.vy += Math.sign(ty - e.y) * 70 * (dt / 1000);
              if (Math.abs(dx) < 14 && Math.abs(e.y - ty) < 14) {
                e.carrying = e.target;
                e.target.state = "captured";
                e.target.captor = e;
                e.target = null;
                sfx("abduct");
              }
            }
          } else {
            // Hunt ship if no humans
            if (ship && ship.alive) {
              const dx = wrapDelta(e.x, ship.x);
              const dy = ship.y - e.y;
              e.vx += Math.sign(dx) * 70 * (dt / 1000);
              e.vy += Math.sign(dy) * 50 * (dt / 1000);
            } else {
              e.vx += rnd(-20, 20) * (dt / 1000);
              e.vy += rnd(-15, 15) * (dt / 1000);
            }
          }
          e.vx = clamp(e.vx, -100 - wave * 3, 100 + wave * 3);
          e.vy = clamp(e.vy, -90, 90);
          e.x = wrap(e.x + e.vx * (dt / 1000));
          e.y += e.vy * (dt / 1000);
          const gY = planetAlive ? groundAt(e.x) - 18 : GROUND_BASE;
          if (e.y > gY) {
            e.y = gY;
            e.vy = -30;
          }
          if (e.y < PLAY_TOP + 30) e.vy = Math.abs(e.vy);
        }
        // Shoot at ship (slow projectiles)
        e.shootT -= dt;
        if (e.shootT <= 0 && ship && ship.alive && Math.abs(wrapDelta(e.x, ship.x)) < VW * 0.7) {
          e.shootT = 1400 + Math.random() * 2000 - wave * 40;
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          mines.push({
            // reuse mines array for enemy shots with flag
            x: e.x,
            y: e.y,
            vx: (dx / len) * 160,
            vy: (dy / len) * 160,
            life: 2500,
            shot: true,
          });
        }
      } else if (e.type === "mutant") {
        // Aggressive pursuit — faster than landers
        if (ship && ship.alive) {
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          e.vx += Math.sign(dx) * 200 * (dt / 1000);
          e.vy += Math.sign(dy) * 170 * (dt / 1000);
          // lead slightly
          e.vx += (ship.vx * 0.02);
        }
        e.vx = clamp(e.vx, -220 - wave * 4, 220 + wave * 4);
        e.vy = clamp(e.vy, -200, 200);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), PLAY_TOP + 20, GROUND_BASE - 10);
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 16 && Math.abs(e.y - ship.y) < 14) killShip();
        }
        e.shootT = (e.shootT || 600) - dt;
        if (e.shootT <= 0 && ship && ship.alive) {
          e.shootT = 700 + Math.random() * 500;
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          mines.push({
            x: e.x,
            y: e.y,
            vx: (dx / len) * 220,
            vy: (dy / len) * 220,
            life: 1800,
            shot: true,
          });
        }
      } else if (e.type === "bomber") {
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y += Math.sin(e.bob / 180) * 0.4;
        e.y = clamp(e.y, PLAY_TOP + 40, GROUND_BASE - 80);
        e.dropT -= dt;
        if (e.dropT <= 0) {
          e.dropT = 900 + Math.random() * 1400;
          mines.push({
            x: e.x,
            y: e.y + 8,
            vx: 0,
            vy: 0,
            life: 12000,
            shot: false,
            mine: true,
          });
        }
      } else if (e.type === "pod") {
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y += e.vy * (dt / 1000);
        if (e.y < PLAY_TOP + 40 || e.y > GROUND_BASE - 40) e.vy *= -1;
        // slow drift toward ship
        if (ship && ship.alive) {
          e.vx += Math.sign(wrapDelta(e.x, ship.x)) * 10 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -60, 60);
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
          e.vx += (dx / len) * 280 * (dt / 1000);
          e.vy += (dy / len) * 280 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -260, 260);
        e.vy = clamp(e.vy, -260, 260);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), PLAY_TOP + 20, GROUND_BASE - 12);
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 12 && Math.abs(e.y - ship.y) < 12) killShip();
        }
      } else if (e.type === "baiter") {
        // Fastest pursuit craft — punishes stalling
        if (ship && ship.alive) {
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          e.vx += Math.sign(dx) * 320 * (dt / 1000);
          e.vy += Math.sign(dy) * 280 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -340, 340);
        e.vy = clamp(e.vy, -300, 300);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), PLAY_TOP + 20, GROUND_BASE - 12);
        e.shootT = (e.shootT || 400) - dt;
        if (e.shootT <= 0 && ship && ship.alive) {
          e.shootT = 450;
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          mines.push({
            x: e.x,
            y: e.y,
            vx: (dx / len) * 280,
            vy: (dy / len) * 280,
            life: 1400,
            shot: true,
          });
        }
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 15 && Math.abs(e.y - ship.y) < 13) killShip();
        }
      }

      // Collide landers/bombers/pods with ship
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

    // Wave clear when no enemies and spawn queue empty
    if (
      state === "play" &&
      enemies.length === 0 &&
      landerSpawnQueue.length === 0
    ) {
      state = "clear";
      clearT = 2200;
      sfx("wave");
      showOV("ATTACK WAVE " + wave, "COMPLETED", "");
    }

    // Baiter if taking too long
    if (state === "play") {
      baiterTimer -= dt;
      if (baiterTimer <= 0) {
        baiterTimer = 12000 - Math.min(5000, wave * 400);
        enemies.push({
          type: "baiter",
          x: wrap(ship ? ship.x + WORLD * 0.35 : Math.random() * WORLD),
          y: PLAY_TOP + 50 + Math.random() * 150,
          vx: 0,
          vy: 0,
          hp: 1,
          bob: 0,
          shootT: 300,
          materialize: 200,
        });
        sfx("alert");
      }
    }
  }

  function updateMines(dt) {
    for (const m of mines) {
      if (m.shot) {
        m.x = wrap(m.x + m.vx * (dt / 1000));
        m.y += m.vy * (dt / 1000);
        m.life -= dt;
      } else {
        // static mine drifts slowly
        m.life -= dt;
      }
      if (ship && ship.alive && ship.inv <= 0) {
        if (Math.abs(wrapDelta(m.x, ship.x)) < 12 && Math.abs(m.y - ship.y) < 12) {
          m.life = 0;
          killShip();
        }
      }
    }
    mines = mines.filter(
      (m) => m.life > 0 && m.y > PLAY_TOP - 20 && m.y < VH + 40
    );
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x = wrap(p.x + p.vx * (dt / 1000));
      p.y += p.vy * (dt / 1000);
      p.life -= dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function update(dt) {
    if (fireCD > 0) fireCD -= dt;
    if (flashT > 0) flashT -= dt;

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
          readyT = 1200;
          showOV("GET READY", "SHIPS LEFT " + lives, "");
        }
      }
      return;
    }

    if (state === "clear") {
      clearT -= dt;
      updateParticles(dt);
      if (clearT <= 0) {
        // Restore humans for next wave if planet still alive
        beginWave(wave + 1);
      }
      return;
    }

    if (state === "planet") {
      planetT -= dt;
      updateParticles(dt);
      if (planetT <= 0) {
        state = "play";
        hideOV();
      }
      return;
    }

    if (state !== "play") return;

    updateShip(dt);
    updateLasers(dt);
    updateHumans(dt);
    updateEnemies(dt);
    updateMines(dt);
    updateParticles(dt);
    hud();
  }

  // ── Drawing ──────────────────────────────────────────────────────────────
  function drawScanner() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VW, SCAN_H);
    ctx.strokeStyle = "#0a0";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, VW - 1, SCAN_H - 1);

    // Mid line
    ctx.strokeStyle = "#040";
    ctx.beginPath();
    ctx.moveTo(0, SCAN_H / 2);
    ctx.lineTo(VW, SCAN_H / 2);
    ctx.stroke();

    const scaleX = VW / WORLD;

    // Terrain silhouette
    if (planetAlive) {
      ctx.beginPath();
      ctx.strokeStyle = "#060";
      ctx.lineWidth = 1;
      for (let i = 0; i < terrain.length; i++) {
        const t = terrain[i];
        const sx = t.x * scaleX;
        const sy = SCAN_H - 6 - t.h * 0.22;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();
    }

    // Humans
    ctx.fillStyle = "#ff0";
    for (const h of humans) {
      if (h.state === "dead" || h.state === "gone") continue;
      const hy =
        h.state === "ground"
          ? SCAN_H - 8
          : 6 + (h.y / VH) * (SCAN_H - 14);
      ctx.fillRect(h.x * scaleX - 1, hy, 2, 3);
    }

    // Enemies
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.type === "mutant") ctx.fillStyle = "#f0f";
      else if (e.type === "baiter") ctx.fillStyle = "#f00";
      else if (e.type === "bomber") ctx.fillStyle = "#0ff";
      else if (e.type === "pod" || e.type === "swarmer") ctx.fillStyle = "#0f8";
      else ctx.fillStyle = "#0f0";
      const ey = 6 + (e.y / VH) * (SCAN_H - 14);
      ctx.fillRect(e.x * scaleX - 1.5, ey, 3, 3);
    }

    // Mines
    ctx.fillStyle = "#ff0";
    for (const m of mines) {
      if (!m.mine) continue;
      ctx.fillRect(m.x * scaleX - 1, 6 + (m.y / VH) * (SCAN_H - 14), 2, 2);
    }

    // Ship
    if (ship && ship.alive) {
      ctx.fillStyle = "#fff";
      const sy = 6 + (ship.y / VH) * (SCAN_H - 14);
      ctx.fillRect(ship.x * scaleX - 2, sy, 4, 3);
    }

    // View bracket
    if (ship) {
      const shipScreen = ship.face > 0 ? VW * 0.32 : VW * 0.68;
      const origin = ship.x - shipScreen;
      let vb = (origin / WORLD) * VW;
      while (vb < 0) vb += VW;
      while (vb > VW) vb -= VW;
      ctx.strokeStyle = "#0f0";
      ctx.lineWidth = 1;
      const viewW = Math.max(8, (VW / WORLD) * VW);
      ctx.strokeRect(vb, 2, viewW, SCAN_H - 4);
    }
  }

  function drawStars() {
    for (const s of stars) {
      const x = screenX(s.x);
      if (x < -4 || x > VW + 4) continue;
      ctx.fillStyle = `rgba(180,255,180,${s.b * 0.55})`;
      ctx.fillRect(x, s.y, s.s, s.s);
    }
  }

  function drawTerrain() {
    if (!planetAlive) {
      // Destroyed planet — faint debris line
      ctx.strokeStyle = "#030";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_BASE + 10);
      ctx.lineTo(VW, GROUND_BASE + 10);
      ctx.stroke();
      return;
    }

    const origin = ship && ship.alive
      ? ship.x - (ship.face > 0 ? VW * 0.32 : VW * 0.68)
      : camX - VW * 0.4;

    // Fill
    ctx.beginPath();
    ctx.fillStyle = "#010";
    let started = false;
    for (let wx = origin - 40; wx < origin + VW + 60; wx += 12) {
      const x = screenX(wrap(wx));
      const y = groundAt(wx);
      if (!started) {
        ctx.moveTo(x, VH);
        ctx.lineTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.lineTo(VW + 20, VH);
    ctx.closePath();
    ctx.fill();

    // Colored mountain ridge (Williams multi-hue feel)
    const colors = ["#0f0", "#0c0", "#080", "#0a4"];
    ctx.lineWidth = 2;
    ctx.shadowColor = "#0f0";
    ctx.shadowBlur = 3;
    ctx.beginPath();
    started = false;
    let ci = 0;
    for (let wx = origin - 40; wx < origin + VW + 60; wx += 12) {
      const x = screenX(wrap(wx));
      const y = groundAt(wx);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
      if (((wx / 12) | 0) % 20 === 0) {
        ctx.strokeStyle = colors[ci++ % colors.length];
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
    ctx.strokeStyle = "#0f0";
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawShip() {
    if (!ship || !ship.alive) return;
    if (ship.inv > 0 && Math.floor(ship.inv / 70) % 2 === 0) return;
    const x = screenX(ship.x);
    const y = ship.y;
    const f = ship.face;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);

    // Williams-like defender ship: pointed nose, rear pods
    ctx.fillStyle = "#cfc";
    ctx.shadowColor = "#0f0";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-4, -7);
    ctx.lineTo(-10, -3);
    ctx.lineTo(-14, -8);
    ctx.lineTo(-16, -2);
    ctx.lineTo(-16, 2);
    ctx.lineTo(-14, 8);
    ctx.lineTo(-10, 3);
    ctx.lineTo(-4, 7);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = "#0f0";
    ctx.fillRect(2, -2, 6, 4);

    // Thrust
    const thr =
      thrustHeld ||
      keys["ShiftLeft"] ||
      keys["ShiftRight"] ||
      keys["KeyZ"] ||
      keys["z"];
    if (thr) {
      const flick = Math.random() * 10;
      ctx.fillStyle = "#ff0";
      ctx.beginPath();
      ctx.moveTo(-16, -3);
      ctx.lineTo(-26 - flick, 0);
      ctx.lineTo(-16, 3);
      ctx.fill();
      ctx.fillStyle = "#f80";
      ctx.beginPath();
      ctx.moveTo(-16, -1.5);
      ctx.lineTo(-22 - flick * 0.5, 0);
      ctx.lineTo(-16, 1.5);
      ctx.fill();
    }

    // Materialize flash
    if (materializeT > 0) {
      ctx.strokeStyle = `rgba(0,255,255,${materializeT / 400})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(-20, -12, 40, 24);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawHuman(h) {
    if (h.state === "dead" || h.state === "gone") return;
    const x = screenX(h.x);
    if (x < -20 || x > VW + 20) return;
    const y = h.y;
    ctx.fillStyle = "#ff0";
    ctx.shadowColor = "#ff0";
    ctx.shadowBlur = 3;
    // Head
    ctx.fillRect(x - 2, y - 10, 4, 4);
    // Body
    ctx.fillRect(x - 2, y - 6, 4, 7);
    // Arms
    ctx.fillRect(x - 5, y - 5, 3, 2);
    ctx.fillRect(x + 2, y - 5, 3, 2);
    // Legs
    const leg = Math.sin(h.walk / 90) * 2;
    ctx.fillRect(x - 3, y + 1, 2, 5 + leg);
    ctx.fillRect(x + 1, y + 1, 2, 5 - leg);
    ctx.shadowBlur = 0;
  }

  function drawEnemy(e) {
    if (e.dead) return;
    const x = screenX(e.x);
    if (x < -50 || x > VW + 50) return;
    let y = e.y + Math.sin(e.bob / 140) * 2;
    if (e.materialize > 0 && Math.floor(e.materialize / 40) % 2 === 0) {
      // blink in
      ctx.globalAlpha = 0.5;
    }
    ctx.shadowBlur = 5;

    if (e.type === "lander") {
      // Classic lander: dome + body + legs
      ctx.fillStyle = "#0f0";
      ctx.shadowColor = "#0f0";
      ctx.beginPath();
      ctx.ellipse(x, y, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8f8";
      ctx.beginPath();
      ctx.arc(x, y - 5, 7, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = "#0f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 3);
      ctx.lineTo(x - 12, y + 12);
      ctx.moveTo(x + 8, y + 3);
      ctx.lineTo(x + 12, y + 12);
      ctx.moveTo(x, y + 4);
      ctx.lineTo(x, y + 11);
      ctx.stroke();
      if (e.carrying) {
        ctx.strokeStyle = "#ff0";
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    } else if (e.type === "mutant") {
      // Angular mutant
      ctx.fillStyle = "#f0f";
      ctx.shadowColor = "#f0f";
      ctx.beginPath();
      ctx.moveTo(x, y - 11);
      ctx.lineTo(x + 11, y + 2);
      ctx.lineTo(x + 6, y + 10);
      ctx.lineTo(x - 6, y + 10);
      ctx.lineTo(x - 11, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 4, y - 2, 3, 3);
      ctx.fillRect(x + 1, y - 2, 3, 3);
    } else if (e.type === "bomber") {
      ctx.fillStyle = "#0ff";
      ctx.shadowColor = "#0ff";
      // diamond / brick bomber
      ctx.beginPath();
      ctx.moveTo(x - 16, y);
      ctx.lineTo(x - 8, y - 7);
      ctx.lineTo(x + 8, y - 7);
      ctx.lineTo(x + 16, y);
      ctx.lineTo(x + 8, y + 7);
      ctx.lineTo(x - 8, y + 7);
      ctx.closePath();
      ctx.fill();
    } else if (e.type === "pod") {
      ctx.strokeStyle = "#0f8";
      ctx.shadowColor = "#0f8";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 11, y - 11, 22, 22);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeRect(x - 4, y - 4, 8, 8);
    } else if (e.type === "swarmer") {
      ctx.fillStyle = "#0f8";
      ctx.shadowColor = "#0f8";
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
    } else if (e.type === "baiter") {
      ctx.fillStyle = "#f44";
      ctx.shadowColor = "#f00";
      ctx.beginPath();
      ctx.ellipse(x, y, 17, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#faa";
      ctx.fillRect(x - 5, y - 3, 10, 6);
      // fins
      ctx.fillStyle = "#f44";
      ctx.fillRect(x - 18, y - 1, 5, 2);
      ctx.fillRect(x + 13, y - 1, 5, 2);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  function drawLasers() {
    for (const L of lasers) {
      const x0 = screenX(L.x);
      const x1 = screenX(wrap(L.x + L.face * L.len));
      // Draw as long horizontal beam
      const alpha = clamp(L.life / 70, 0, 1);
      ctx.strokeStyle = `rgba(180,255,180,${0.9 * alpha})`;
      ctx.shadowColor = "#0f0";
      ctx.shadowBlur = 8;
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Handle wrap: draw from ship-relative
      if (L.face > 0) {
        ctx.moveTo(x0, L.y);
        ctx.lineTo(x0 + L.len, L.y);
      } else {
        ctx.moveTo(x0, L.y);
        ctx.lineTo(x0 - L.len, L.y);
      }
      ctx.stroke();
      // Core
      ctx.strokeStyle = `rgba(255,255,255,${0.7 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (L.face > 0) {
        ctx.moveTo(x0, L.y);
        ctx.lineTo(x0 + L.len * 0.85, L.y);
      } else {
        ctx.moveTo(x0, L.y);
        ctx.lineTo(x0 - L.len * 0.85, L.y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawMines() {
    for (const m of mines) {
      const x = screenX(m.x);
      if (x < -10 || x > VW + 10) continue;
      if (m.mine) {
        ctx.fillStyle = "#ff0";
        ctx.shadowColor = "#ff0";
        ctx.shadowBlur = 4;
        // Plus-shaped mine
        ctx.fillRect(x - 3, m.y - 1, 6, 2);
        ctx.fillRect(x - 1, m.y - 3, 2, 6);
      } else {
        ctx.fillStyle = "#f66";
        ctx.fillRect(x - 2, m.y - 2, 4, 4);
      }
      ctx.shadowBlur = 0;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const x = screenX(p.x);
      ctx.globalAlpha = clamp(p.life / 400, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(x, p.y, p.size || 2, p.size || 2);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VW, VH);

    if (flashT > 0) {
      ctx.fillStyle = `rgba(200,255,200,${0.2 * (flashT / 280)})`;
      ctx.fillRect(0, SCAN_H, VW, VH - SCAN_H);
    }

    drawStars();
    drawTerrain();
    for (const h of humans) drawHuman(h);
    for (const e of enemies) drawEnemy(e);
    drawMines();
    drawLasers();
    drawParticles();
    drawShip();
    drawScanner(); // on top so radar is always readable

    // Scanner separator
    ctx.fillStyle = "#0a0";
    ctx.fillRect(0, SCAN_H - 1, VW, 2);
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  let last = 0;
  function tick(ts) {
    if (!last) last = ts;
    let dt = ts - last;
    last = ts;
    dt = Math.min(dt, 40);
    update(dt);
    render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ── Input ────────────────────────────────────────────────────────────────
  function togglePauseOrStart() {
    unlockAudio();
    if (state === "title" || state === "over") beginGame();
    else if (state === "play") {
      state = "pause";
      setThrust(false);
      showOV("PAUSED", "PRESS SPACE OR TAP", "");
    } else if (state === "pause") {
      state = "play";
      hideOV();
    }
  }

  // Fix: state pause support
  // (update ignores pause)

  function toggleMute() {
    muted = !muted;
    if (muted) setThrust(false);
  }

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
        toggleMute();
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

  // Touch controls
  function bindHold(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (ev) => {
      ev.preventDefault();
      unlockAudio();
      onDown();
    };
    const up = (ev) => {
      ev.preventDefault();
      onUp();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
  }

  bindHold(
    "btn-up",
    () => {
      keys._up = true;
    },
    () => {
      keys._up = false;
    }
  );
  bindHold(
    "btn-down",
    () => {
      keys._down = true;
    },
    () => {
      keys._down = false;
    }
  );
  bindHold(
    "btn-thrust",
    () => {
      thrustHeld = true;
    },
    () => {
      thrustHeld = false;
    }
  );
  bindHold(
    "btn-reverse",
    () => {
      keys._rev = true;
      if (ship) ship.face = -1;
    },
    () => {
      keys._rev = false;
    }
  );
  bindHold(
    "btn-fire",
    () => {
      fireHeld = true;
      if (state === "title" || state === "over") beginGame();
      else if (state === "pause") {
        state = "play";
        hideOV();
      }
    },
    () => {
      fireHeld = false;
    }
  );
  bindHold(
    "btn-bomb",
    () => {
      smartBomb();
    },
    () => {}
  );
  bindHold(
    "btn-hyper",
    () => {
      hyperspace();
    },
    () => {}
  );
  bindHold(
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
  bindHold(
    "btn-mute",
    () => {
      toggleMute();
    },
    () => {}
  );

  // Touch: FWD faces right (REV already faces left)
  bindHold(
    "btn-forward",
    () => {
      if (ship) ship.face = 1;
      keys._fwd = true;
    },
    () => {
      keys._fwd = false;
    }
  );

  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  overlay.style.pointerEvents = "auto";
  overlay.addEventListener("click", () => {
    unlockAudio();
    if (state === "title" || state === "over") beginGame();
    else if (state === "pause") {
      state = "play";
      hideOV();
    }
  });

  hud();
  showOV("DEFENDER", "INSERT COIN", "PRESS SPACE OR TAP TO START");
  $high.textContent = pad(high);
})();
