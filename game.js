/**
 * DEFENDER — 1981 Williams Electronics Arcade Classic
 * Side-scrolling rescue shooter: protect humanoids, destroy landers & mutants.
 */
(() => {
  "use strict";

  // ── Display / world ──────────────────────────────────────────────────────
  const VW = 800;   // view width
  const VH = 600;   // view height
  const WORLD = 6400; // wrap-around planet width
  const GROUND_Y = VH - 70;
  const SCAN_H = 48;

  // ── DOM ──────────────────────────────────────────────────────────────────
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = VW;
  canvas.height = VH;
  document.documentElement.style.setProperty("--board-w", VW + "px");

  const $score = document.getElementById("score");
  const $high = document.getElementById("high-score");
  const $wave = document.getElementById("wave");
  const $bombs = document.getElementById("bombs");
  const $lives = document.getElementById("lives");
  const $humans = document.getElementById("humans-left");
  const overlay = document.getElementById("overlay");
  const $title = document.getElementById("overlay-title");
  const $sub = document.getElementById("overlay-sub");
  const $hint = document.getElementById("overlay-hint");
  const $ctrl = document.getElementById("overlay-controls");

  // ── Audio (Williams-style synth approximations) ──────────────────────────
  let audio = null, muted = false, noiseBuf = null, thrustOsc = null, thrustGain = null;
  let fireN = 0;
  function unlockAudio() {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
    if (!noiseBuf && audio) {
      const n = audio.sampleRate * 0.3 | 0;
      noiseBuf = audio.createBuffer(1, n, audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
  }
  function tone(freq, dur, type = "square", vol = 0.04, when = 0, slideTo) {
    if (muted || !audio) return;
    const t = audio.currentTime + when;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(audio.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  function noise(dur, vol = 0.04, when = 0, filterFreq = 1000) {
    if (muted || !audio || !noiseBuf) return;
    const t = audio.currentTime + when;
    const src = audio.createBufferSource();
    src.buffer = noiseBuf;
    const f = audio.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = filterFreq;
    const g = audio.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(audio.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }
  function seq(notes, type = "square", vol = 0.035) {
    let t = 0;
    for (const n of notes) {
      const [f, d, gap = 0] = n;
      if (f > 0) tone(f, d, type, vol, t);
      t += d + gap;
    }
  }
  function setThrust(on) {
    unlockAudio();
    if (!audio) return;
    if (on && !muted) {
      if (!thrustOsc) {
        thrustOsc = audio.createOscillator();
        thrustGain = audio.createGain();
        thrustOsc.type = "sawtooth";
        thrustOsc.frequency.value = 55;
        thrustGain.gain.value = 0.012;
        thrustOsc.connect(thrustGain);
        thrustGain.connect(audio.destination);
        thrustOsc.start();
      }
      thrustGain.gain.setTargetAtTime(0.014, audio.currentTime, 0.05);
      thrustOsc.frequency.setTargetAtTime(70 + Math.random() * 15, audio.currentTime, 0.1);
    } else if (thrustGain) {
      thrustGain.gain.setTargetAtTime(0.0001, audio.currentTime, 0.08);
    }
  }
  function sfx(name) {
    unlockAudio();
    if (muted || !audio) return;
    if (name === "fire") {
      // Rapid laser zip
      const f = 900 + (fireN++ % 3) * 80;
      tone(f, 0.06, "square", 0.03, 0, 200);
      tone(f * 1.5, 0.04, "triangle", 0.015);
    } else if (name === "explode") {
      noise(0.2, 0.07, 0, 600);
      tone(120, 0.18, "sawtooth", 0.04, 0, 40);
      tone(80, 0.15, "square", 0.025, 0.02, 30);
    } else if (name === "bomb") {
      noise(0.35, 0.08, 0, 400);
      tone(60, 0.3, "sine", 0.06, 0, 30);
      tone(200, 0.15, "square", 0.03, 0.05, 80);
      for (let i = 0; i < 5; i++) tone(300 + i * 100, 0.06, "square", 0.02, 0.08 + i * 0.04);
    } else if (name === "hit") {
      tone(180, 0.05, "square", 0.03, 0, 90);
      noise(0.06, 0.03, 0, 1500);
    } else if (name === "rescue") {
      seq([[523, 0.06, 0.01], [659, 0.06, 0.01], [784, 0.1, 0]], "square", 0.035);
    } else if (name === "abduct") {
      tone(200, 0.2, "triangle", 0.025, 0, 600);
      tone(400, 0.15, "sine", 0.015, 0.05, 800);
    } else if (name === "mutant") {
      tone(150, 0.12, "sawtooth", 0.03, 0, 400);
      tone(400, 0.12, "sawtooth", 0.025, 0.08, 120);
    } else if (name === "die") {
      for (let i = 0; i < 12; i++) tone(400 - i * 25, 0.06, "square", 0.03, i * 0.05);
      noise(0.3, 0.05, 0.1, 500);
      setThrust(false);
    } else if (name === "hyper") {
      noise(0.25, 0.05, 0, 2000);
      tone(100, 0.2, "sawtooth", 0.04, 0, 2000);
      tone(2000, 0.15, "square", 0.02, 0.05, 100);
    } else if (name === "start") {
      // Williams Defender-ish fanfare (descending computer tones)
      seq([
        [880, 0.08, 0.02], [740, 0.08, 0.02], [659, 0.08, 0.02], [554, 0.1, 0.04],
        [494, 0.08, 0.02], [440, 0.08, 0.02], [392, 0.08, 0.02], [330, 0.14, 0.05],
        [392, 0.1, 0.02], [494, 0.1, 0.02], [659, 0.16, 0],
      ], "square", 0.034);
    } else if (name === "wave") {
      seq([[330, 0.08, 0.02], [392, 0.08, 0.02], [523, 0.12, 0]], "square", 0.032);
    } else if (name === "1up") {
      seq([[523, 0.07, 0.01], [659, 0.07, 0.01], [784, 0.07, 0.01], [1047, 0.12, 0]], "square", 0.036);
    } else if (name === "alert") {
      tone(880, 0.08, "square", 0.03);
      tone(660, 0.08, "square", 0.03, 0.1);
    } else if (name === "thrust") {
      // one-shot thrust blip if continuous not used
      tone(60, 0.08, "sawtooth", 0.02, 0, 90);
    }
  }

  // ── State ────────────────────────────────────────────────────────────────
  let score = 0;
  let high = +localStorage.getItem("defender_high") || 0;
  let wave = 1, lives = 3, bombs = 3, extra = false;
  let state = "title";
  let readyT = 0, dieT = 0, clearT = 0;
  let time = 0, prev = 0, baiterTimer = 0;
  let camX = 0;
  let ship, bullets, enemies, humans, particles, stars, terrain;
  let keys = {};
  let thrustHeld = false, fireHeld = false, fireCD = 0;
  let flashT = 0;

  function pad(n) { return String(n).padStart(2, "0"); }
  function wrap(x) {
    x %= WORLD;
    if (x < 0) x += WORLD;
    return x;
  }
  function wrapDelta(a, b) {
    let d = b - a;
    if (d > WORLD / 2) d -= WORLD;
    if (d < -WORLD / 2) d += WORLD;
    return d;
  }
  function screenX(wx) {
    let d = wrapDelta(camX, wx);
    return VW * 0.35 + d; // ship sits left-of-center like original feel
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function hud() {
    $score.textContent = pad(score);
    $high.textContent = pad(high);
    $wave.textContent = String(wave);
    $bombs.textContent = String(bombs);
    $lives.innerHTML = "";
    for (let i = 0; i < lives; i++) {
      const d = document.createElement("div");
      d.className = "life-icon";
      $lives.appendChild(d);
    }
    const alive = humans.filter((h) => h.state !== "dead" && h.state !== "gone").length;
    $humans.textContent = "HUMANS " + alive;
  }
  function addScore(n) {
    score += n;
    if (score > high) {
      high = score;
      localStorage.setItem("defender_high", String(high));
    }
    if (!extra && score >= 10000) { extra = true; lives++; sfx("1up"); }
    hud();
  }
  function showOV(title, sub, cls) {
    overlay.classList.remove("hidden", "ready", "paused", "gameover");
    if (cls) overlay.classList.add(cls);
    $title.textContent = title;
    $sub.textContent = sub || "";
    const home = title === "DEFENDER";
    $hint.style.display = home ? "" : "none";
    if ($ctrl) $ctrl.style.display = home ? "" : "none";
  }
  function hideOV() { overlay.classList.add("hidden"); }
  function isTouchPrimary() {
    return window.matchMedia("(pointer: coarse)").matches
      || window.matchMedia("(max-width: 900px)").matches
      || ("ontouchstart" in window);
  }

  // ── Terrain ──────────────────────────────────────────────────────────────
  function buildTerrain() {
    terrain = [];
    let h = 40;
    for (let i = 0; i <= WORLD; i += 20) {
      h += (Math.random() - 0.5) * 18;
      h = clamp(h, 12, 90);
      // smooth valleys
      if (i % 400 < 80) h = Math.max(12, h - 2);
      terrain.push({ x: i, h });
    }
    // close loop
    terrain[terrain.length - 1].h = terrain[0].h;
  }
  function groundAt(wx) {
    wx = wrap(wx);
    const step = 20;
    const i = Math.floor(wx / step) % (terrain.length - 1);
    const t0 = terrain[i], t1 = terrain[i + 1];
    const f = (wx - t0.x) / step;
    const hh = t0.h + (t1.h - t0.h) * f;
    return GROUND_Y - hh;
  }

  // ── Entities ─────────────────────────────────────────────────────────────
  function spawnShip() {
    ship = {
      x: WORLD * 0.2,
      y: VH * 0.45,
      vx: 0, vy: 0,
      face: 1, // 1 right, -1 left
      alive: true,
      inv: 0,
    };
    camX = ship.x;
  }

  function spawnWave(n) {
    enemies = [];
    bullets = [];
    particles = [];
    baiterTimer = 45000 - Math.min(20000, n * 2000);

    const nLanders = Math.min(4 + n * 2, 18);
    const nBombers = Math.min(Math.floor((n - 1) / 2), 6);
    const nPods = n >= 3 ? Math.min(1 + Math.floor(n / 3), 4) : 0;

    for (let i = 0; i < nLanders; i++) {
      enemies.push({
        type: "lander",
        x: Math.random() * WORLD,
        y: 80 + Math.random() * 200,
        vx: (Math.random() - 0.5) * 40,
        vy: 0,
        target: null,
        carrying: null,
        hp: 1,
        bob: Math.random() * 100,
        shootT: 1000 + Math.random() * 2000,
      });
    }
    for (let i = 0; i < nBombers; i++) {
      enemies.push({
        type: "bomber",
        x: Math.random() * WORLD,
        y: 100 + Math.random() * 150,
        vx: (Math.random() < 0.5 ? -1 : 1) * (50 + n * 5),
        vy: 0,
        dropT: 800 + Math.random() * 1500,
        hp: 1,
        bob: 0,
      });
    }
    for (let i = 0; i < nPods; i++) {
      enemies.push({
        type: "pod",
        x: Math.random() * WORLD,
        y: 120 + Math.random() * 180,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 20,
        hp: 1,
        bob: 0,
      });
    }

    // Humans on surface
    humans = [];
    const nHum = Math.max(5, 10 - Math.floor(n / 2));
    for (let i = 0; i < nHum; i++) {
      const x = (i + 0.5) * (WORLD / nHum) + (Math.random() - 0.5) * 80;
      humans.push({
        x: wrap(x),
        y: 0, // set from terrain
        state: "ground", // ground | captured | falling | rescued | dead | gone
        captor: null,
        vy: 0,
        walk: Math.random() * 100,
      });
    }
    for (const h of humans) h.y = groundAt(h.x) - 8;
  }

  function burst(x, y, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 120;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 300 + Math.random() * 400,
        color,
      });
    }
  }

  function beginWave(n) {
    wave = n;
    if (n === 1) bombs = 3;
    else bombs = Math.min(5, bombs + 1);
    spawnShip();
    spawnWave(wave);
    state = "ready";
    readyT = 1800;
    baiterTimer = 40000 - Math.min(25000, wave * 2500);
    fireCD = 0;
    flashT = 0;
    hud();
    showOV("WAVE " + wave, "DEFEND HUMANITY", "ready");
    sfx(n === 1 ? "start" : "wave");
  }

  function beginGame() {
    unlockAudio();
    score = 0; lives = 3; bombs = 3; wave = 1; extra = false;
    buildTerrain();
    // stars
    stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * WORLD,
        y: 20 + Math.random() * (GROUND_Y - 80),
        b: 0.3 + Math.random() * 0.7,
      });
    }
    beginWave(1);
  }

  // ── Combat ───────────────────────────────────────────────────────────────
  function fireLaser() {
    if (!ship || !ship.alive || fireCD > 0) return;
    fireCD = 90;
    bullets.push({
      x: ship.x + ship.face * 18,
      y: ship.y,
      vx: ship.face * 520 + ship.vx * 0.3,
      vy: ship.vy * 0.15,
      life: 450,
      friendly: true,
    });
    sfx("fire");
  }

  function smartBomb() {
    if (!ship || !ship.alive || bombs <= 0 || state !== "play") return;
    bombs--;
    hud();
    flashT = 200;
    sfx("bomb");
    // Destroy enemies near ship (on screen-ish)
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.abs(wrapDelta(ship.x, e.x));
      if (d < VW * 0.7 && Math.abs(e.y - ship.y) < VH) {
        killEnemy(e, true);
      }
    }
    // kill enemy bullets
    bullets = bullets.filter((b) => b.friendly);
  }

  function hyperspace() {
    if (!ship || !ship.alive || state !== "play") return;
    sfx("hyper");
    burst(ship.x, ship.y, "#0ff", 14);
    ship.x = Math.random() * WORLD;
    ship.y = 80 + Math.random() * (GROUND_Y - 160);
    ship.vx = 0;
    ship.vy = 0;
    ship.inv = 1500;
    // risk of death ~15%
    if (Math.random() < 0.12) {
      killShip();
    } else {
      burst(ship.x, ship.y, "#0f0", 10);
    }
  }

  function killEnemy(e, fromBomb) {
    if (e.dead) return;
    e.dead = true;
    let pts = 150;
    if (e.type === "lander") pts = 150;
    else if (e.type === "mutant") pts = 200;
    else if (e.type === "bomber") pts = 250;
    else if (e.type === "pod") pts = 1000;
    else if (e.type === "swarmer") pts = 150;
    else if (e.type === "baiter") pts = 200;
    if (e.carrying) {
      // drop human
      const h = e.carrying;
      h.state = "falling";
      h.captor = null;
      h.vy = 20;
      e.carrying = null;
    }
    if (e.type === "pod") {
      // spawn swarmers
      for (let i = 0; i < 4; i++) {
        enemies.push({
          type: "swarmer",
          x: e.x + (Math.random() - 0.5) * 30,
          y: e.y + (Math.random() - 0.5) * 30,
          vx: (Math.random() - 0.5) * 120,
          vy: (Math.random() - 0.5) * 120,
          hp: 1,
          bob: 0,
          life: 12000,
        });
      }
    }
    addScore(pts);
    burst(e.x, e.y, e.type === "mutant" ? "#f0f" : "#0f0", fromBomb ? 16 : 10);
    sfx("explode");
  }

  function killShip() {
    if (!ship || !ship.alive) return;
    ship.alive = false;
    setThrust(false);
    burst(ship.x, ship.y, "#0f0", 20);
    burst(ship.x, ship.y, "#fff", 10);
    sfx("die");
    lives--;
    hud();
    state = "die";
    dieT = 1800;
  }

  // ── Update ───────────────────────────────────────────────────────────────
  function updateShip(dt) {
    if (!ship || !ship.alive) return;
    const thr = thrustHeld || keys["ShiftLeft"] || keys["ShiftRight"] || keys["KeyZ"] || keys["z"] || keys["Z"];
    const up = keys["ArrowUp"] || keys["w"] || keys["W"] || keys["KeyW"] || keys._up;
    const dn = keys["ArrowDown"] || keys["s"] || keys["S"] || keys["KeyS"] || keys._down;
    const rev = keys["ArrowLeft"] || keys["a"] || keys["A"] || keys["KeyA"] || keys._rev;
    const fwd = keys["ArrowRight"] || keys["d"] || keys["D"] || keys["KeyD"];

    if (rev) ship.face = -1;
    if (fwd) ship.face = 1;

    // Thrust in facing direction
    if (thr) {
      ship.vx += ship.face * 280 * (dt / 1000);
      setThrust(true);
    } else {
      setThrust(false);
      ship.vx *= Math.pow(0.4, dt / 1000); // drag
    }
    if (up) ship.vy -= 320 * (dt / 1000);
    if (dn) ship.vy += 320 * (dt / 1000);
    ship.vy *= Math.pow(0.35, dt / 1000);

    ship.vx = clamp(ship.vx, -320, 320);
    ship.vy = clamp(ship.vy, -260, 260);

    ship.x = wrap(ship.x + ship.vx * (dt / 1000));
    ship.y += ship.vy * (dt / 1000);

    const gY = groundAt(ship.x) - 10;
    if (ship.y > gY) {
      ship.y = gY;
      ship.vy = Math.min(0, ship.vy);
      // crash if hard hit
      if (Math.abs(ship.vy) > 50 || (!thr && Math.abs(ship.vx) > 200)) {
        // gentle slide on ground ok
      }
    }
    if (ship.y < SCAN_H + 20) {
      ship.y = SCAN_H + 20;
      ship.vy = Math.max(0, ship.vy);
    }

    // Camera follow
    const targetCam = ship.x - VW * 0.35 * 0; // screenX uses cam
    camX = wrap(ship.x - 0); // ship world x; screen places it
    // smooth: camX tracks ship
    camX = ship.x;

    if (ship.inv > 0) ship.inv -= dt;

    // Catch falling humans
    for (const h of humans) {
      if (h.state === "falling") {
        if (Math.abs(wrapDelta(ship.x, h.x)) < 22 && Math.abs(ship.y - h.y) < 20) {
          h.state = "ground";
          h.vy = 0;
          h.y = groundAt(h.x) - 8;
          addScore(500);
          sfx("rescue");
        }
      }
    }
  }

  function updateBullets(dt) {
    for (const b of bullets) {
      b.x = wrap(b.x + b.vx * (dt / 1000));
      b.y += b.vy * (dt / 1000);
      b.life -= dt;
    }
    bullets = bullets.filter((b) => b.life > 0 && b.y > SCAN_H && b.y < GROUND_Y + 20);

    // collisions
    for (const b of bullets) {
      if (!b.friendly) {
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(ship.x, b.x)) < 14 && Math.abs(ship.y - b.y) < 10) {
            b.life = 0;
            killShip();
          }
        }
        continue;
      }
      for (const e of enemies) {
        if (e.dead) continue;
        const hitR = e.type === "pod" ? 16 : e.type === "bomber" ? 14 : 12;
        if (Math.abs(wrapDelta(e.x, b.x)) < hitR && Math.abs(e.y - b.y) < hitR) {
          b.life = 0;
          killEnemy(e, false);
          break;
        }
      }
    }
  }

  function updateHumans(dt) {
    for (const h of humans) {
      h.walk += dt;
      if (h.state === "ground") {
        h.y = groundAt(h.x) - 8;
        // slight wander
        h.x = wrap(h.x + Math.sin(h.walk / 500) * 0.02 * dt);
      } else if (h.state === "captured" && h.captor) {
        h.x = h.captor.x;
        h.y = h.captor.y + 16;
        // escaped top?
        if (h.captor.y < SCAN_H + 30) {
          // become mutant
          h.state = "gone";
          h.captor.carrying = null;
          h.captor.type = "mutant";
          h.captor.vx = (Math.random() - 0.5) * 100;
          h.captor.vy = (Math.random() - 0.5) * 80;
          sfx("mutant");
          addScore(0);
        }
      } else if (h.state === "falling") {
        h.vy += 180 * (dt / 1000);
        h.y += h.vy * (dt / 1000);
        const g = groundAt(h.x) - 8;
        if (h.y >= g) {
          if (h.vy > 160) {
            h.state = "dead";
            burst(h.x, h.y, "#f80", 6);
          } else {
            h.state = "ground";
            h.y = g;
            h.vy = 0;
          }
        }
      }
    }
  }

  function updateEnemies(dt) {
    // assign lander targets
    const freeHumans = humans.filter((h) => h.state === "ground");

    for (const e of enemies) {
      if (e.dead) continue;
      e.bob += dt;

      if (e.type === "lander") {
        if (e.carrying) {
          // fly up with human
          e.vy = -55 - wave * 3;
          e.vx *= 0.95;
          e.y += e.vy * (dt / 1000);
          e.x = wrap(e.x + e.vx * (dt / 1000));
        } else {
          // seek a human
          if (!e.target || e.target.state !== "ground") {
            e.target = freeHumans.length
              ? freeHumans[(Math.random() * freeHumans.length) | 0]
              : null;
          }
          if (e.target) {
            const dx = wrapDelta(e.x, e.target.x);
            e.vx += Math.sign(dx) * 50 * (dt / 1000);
            const ty = e.target.y - 30;
            e.vy += Math.sign(ty - e.y) * 40 * (dt / 1000);
            // grab
            if (Math.abs(dx) < 12 && Math.abs(e.y - (e.target.y - 14)) < 14) {
              e.carrying = e.target;
              e.target.state = "captured";
              e.target.captor = e;
              e.target = null;
              sfx("abduct");
            }
          } else {
            e.vx += (Math.random() - 0.5) * 30 * (dt / 1000);
            e.vy += (Math.random() - 0.5) * 20 * (dt / 1000);
          }
          e.vx = clamp(e.vx, -80 - wave * 2, 80 + wave * 2);
          e.vy = clamp(e.vy, -70, 70);
          e.x = wrap(e.x + e.vx * (dt / 1000));
          e.y += e.vy * (dt / 1000);
          const gY = groundAt(e.x) - 20;
          if (e.y > gY) { e.y = gY; e.vy = -20; }
          if (e.y < SCAN_H + 40) e.vy = Math.abs(e.vy);
        }
        // shoot occasionally at ship
        e.shootT -= dt;
        if (e.shootT <= 0 && ship && ship.alive) {
          e.shootT = 1500 + Math.random() * 2500;
          if (Math.abs(wrapDelta(e.x, ship.x)) < VW * 0.6) {
            const dx = wrapDelta(e.x, ship.x);
            const dy = ship.y - e.y;
            const len = Math.hypot(dx, dy) || 1;
            bullets.push({
              x: e.x, y: e.y,
              vx: (dx / len) * 180,
              vy: (dy / len) * 180,
              life: 2000,
              friendly: false,
            });
          }
        }
      } else if (e.type === "mutant") {
        // aggressive chase
        if (ship && ship.alive) {
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          e.vx += Math.sign(dx) * 120 * (dt / 1000);
          e.vy += Math.sign(dy) * 100 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -160, 160);
        e.vy = clamp(e.vy, -140, 140);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), SCAN_H + 30, GROUND_Y - 30);
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 16 && Math.abs(e.y - ship.y) < 14) killShip();
        }
      } else if (e.type === "bomber") {
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y += Math.sin(e.bob / 200) * 0.3;
        e.dropT -= dt;
        if (e.dropT <= 0) {
          e.dropT = 1000 + Math.random() * 1800;
          bullets.push({
            x: e.x, y: e.y + 10,
            vx: 0,
            vy: 90,
            life: 3000,
            friendly: false,
            bomb: true,
          });
        }
      } else if (e.type === "pod") {
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y += e.vy * (dt / 1000);
        if (e.y < SCAN_H + 40 || e.y > GROUND_Y - 40) e.vy *= -1;
      } else if (e.type === "swarmer") {
        e.life -= dt;
        if (e.life <= 0) { e.dead = true; continue; }
        if (ship && ship.alive) {
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          e.vx += (dx / len) * 200 * (dt / 1000);
          e.vy += (dy / len) * 200 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -200, 200);
        e.vy = clamp(e.vy, -200, 200);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), SCAN_H + 25, GROUND_Y - 20);
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 12 && Math.abs(e.y - ship.y) < 12) killShip();
        }
      } else if (e.type === "baiter") {
        if (ship && ship.alive) {
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          e.vx += Math.sign(dx) * 200 * (dt / 1000);
          e.vy += Math.sign(dy) * 180 * (dt / 1000);
        }
        e.vx = clamp(e.vx, -240, 240);
        e.vy = clamp(e.vy, -220, 220);
        e.x = wrap(e.x + e.vx * (dt / 1000));
        e.y = clamp(e.y + e.vy * (dt / 1000), SCAN_H + 25, GROUND_Y - 25);
        e.shootT = (e.shootT || 800) - dt;
        if (e.shootT <= 0 && ship && ship.alive) {
          e.shootT = 600;
          const dx = wrapDelta(e.x, ship.x);
          const dy = ship.y - e.y;
          const len = Math.hypot(dx, dy) || 1;
          bullets.push({
            x: e.x, y: e.y,
            vx: (dx / len) * 260,
            vy: (dy / len) * 260,
            life: 1500,
            friendly: false,
          });
        }
        if (ship && ship.alive && ship.inv <= 0) {
          if (Math.abs(wrapDelta(e.x, ship.x)) < 14 && Math.abs(e.y - ship.y) < 12) killShip();
        }
      }
    }

    enemies = enemies.filter((e) => !e.dead);

    // Wave clear?
    if (state === "play" && enemies.length === 0) {
      state = "clear";
      clearT = 2000;
      sfx("wave");
    }

    // Baiter spawn if taking too long
    if (state === "play") {
      baiterTimer -= dt;
      if (baiterTimer <= 0) {
        baiterTimer = 15000;
        enemies.push({
          type: "baiter",
          x: wrap(ship.x + WORLD * 0.4),
          y: 100 + Math.random() * 200,
          vx: 0, vy: 0,
          hp: 1,
          bob: 0,
          shootT: 500,
        });
        sfx("alert");
      }
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * (dt / 1000);
      p.y += p.vy * (dt / 1000);
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function update(dt) {
    time += dt;
    if (state === "title" || state === "pause" || state === "over") {
      setThrust(false);
      return;
    }
    if (state === "ready") {
      readyT -= dt;
      if (readyT <= 0) { state = "play"; hideOV(); }
      return;
    }
    if (state === "die") {
      dieT -= dt;
      updateParticles(dt);
      if (dieT <= 0) {
        if (lives <= 0) {
          state = "over";
          showOV("GAME OVER", isTouchPrimary() ? "TAP TO RESTART" : "PRESS SPACE", "gameover");
          return;
        }
        spawnShip();
        ship.inv = 2000;
        state = "ready";
        readyT = 1200;
        showOV("READY!", "", "ready");
      }
      return;
    }
    if (state === "clear") {
      clearT -= dt;
      if (clearT <= 0) beginWave(wave + 1);
      return;
    }

    // play
    fireCD -= dt;
    if (flashT > 0) flashT -= dt;
    if (fireHeld || keys["Space"] || keys[" "]) fireLaser();

    updateShip(dt);
    updateBullets(dt);
    updateHumans(dt);
    updateEnemies(dt);
    updateParticles(dt);

    // all humans gone → still can finish enemies
    const humansOk = humans.some((h) => h.state === "ground" || h.state === "captured" || h.state === "falling");
    if (!humansOk && enemies.length === 0 && state === "play") {
      state = "clear";
      clearT = 2000;
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────
  function drawScanner() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VW, SCAN_H);
    ctx.strokeStyle = "#0a0";
    ctx.strokeRect(0.5, 0.5, VW - 1, SCAN_H - 1);

    const scaleX = VW / WORLD;
    // terrain
    ctx.beginPath();
    ctx.strokeStyle = "#060";
    ctx.lineWidth = 1;
    for (let i = 0; i < terrain.length; i++) {
      const t = terrain[i];
      const sx = t.x * scaleX;
      const sy = SCAN_H - 4 - t.h * 0.25;
      if (i === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    // humans
    ctx.fillStyle = "#ff0";
    for (const h of humans) {
      if (h.state === "dead" || h.state === "gone") continue;
      ctx.fillRect(h.x * scaleX - 1, SCAN_H - 8, 2, 3);
    }
    // enemies
    for (const e of enemies) {
      if (e.dead) continue;
      ctx.fillStyle = e.type === "mutant" ? "#f0f" : e.type === "baiter" ? "#f00" : "#0f0";
      ctx.fillRect(e.x * scaleX - 1.5, 8 + (e.y / VH) * (SCAN_H - 16), 3, 3);
    }
    // ship
    if (ship && ship.alive) {
      ctx.fillStyle = "#fff";
      ctx.fillRect(ship.x * scaleX - 2, 6 + (ship.y / VH) * (SCAN_H - 14), 4, 3);
    }
    // view bracket
    ctx.strokeStyle = "#0f0";
    const vb = (camX - VW * 0.15 + WORLD) % WORLD * scaleX;
    ctx.strokeRect(vb, 2, VW * scaleX * 0.9, SCAN_H - 4);
  }

  function drawTerrain() {
    ctx.beginPath();
    ctx.fillStyle = "#020";
    let started = false;
    // draw visible terrain segment
    const startX = camX - VW * 0.4;
    for (let wx = startX - 40; wx < startX + VW + 80; wx += 20) {
      const x = screenX(wrap(wx));
      const y = groundAt(wx);
      if (!started) { ctx.moveTo(x, VH); ctx.lineTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(screenX(wrap(startX + VW + 80)), VH);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#0f0";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    started = false;
    for (let wx = startX - 40; wx < startX + VW + 80; wx += 20) {
      const x = screenX(wrap(wx));
      const y = groundAt(wx);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawStars() {
    for (const s of stars) {
      const x = screenX(s.x);
      if (x < -10 || x > VW + 10) continue;
      ctx.fillStyle = `rgba(0,255,100,${s.b * 0.5})`;
      ctx.fillRect(x, s.y, 2, 2);
    }
  }

  function drawShip() {
    if (!ship || !ship.alive) return;
    if (ship.inv > 0 && Math.floor(ship.inv / 80) % 2 === 0) return;
    const x = screenX(ship.x);
    const y = ship.y;
    const f = ship.face;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);
    // hull
    ctx.fillStyle = "#0f0";
    ctx.shadowColor = "#0f0";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -8);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 8);
    ctx.closePath();
    ctx.fill();
    // cockpit
    ctx.fillStyle = "#8f8";
    ctx.fillRect(-2, -3, 8, 6);
    // thrust flame
    if (thrustHeld || keys["ShiftLeft"] || keys["ShiftRight"] || keys["KeyZ"] || keys["z"]) {
      ctx.fillStyle = "#ff0";
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-22 - Math.random() * 8, 0);
      ctx.lineTo(-12, 4);
      ctx.fill();
      ctx.fillStyle = "#f80";
      ctx.beginPath();
      ctx.moveTo(-12, -2);
      ctx.lineTo(-18 - Math.random() * 4, 0);
      ctx.lineTo(-12, 2);
      ctx.fill();
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
    ctx.shadowBlur = 4;
    // head
    ctx.beginPath();
    ctx.arc(x, y - 8, 3, 0, Math.PI * 2);
    ctx.fill();
    // body
    ctx.fillRect(x - 2, y - 5, 4, 7);
    // legs
    const leg = Math.sin(h.walk / 100) * 2;
    ctx.fillRect(x - 3, y + 2, 2, 4 + leg);
    ctx.fillRect(x + 1, y + 2, 2, 4 - leg);
    ctx.shadowBlur = 0;
  }

  function drawEnemy(e) {
    if (e.dead) return;
    const x = screenX(e.x);
    if (x < -40 || x > VW + 40) return;
    const y = e.y + Math.sin(e.bob / 150) * 2;
    ctx.shadowBlur = 6;

    if (e.type === "lander") {
      ctx.fillStyle = "#0f0";
      ctx.shadowColor = "#0f0";
      // saucer
      ctx.beginPath();
      ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#8f8";
      ctx.beginPath();
      ctx.arc(x, y - 4, 6, Math.PI, 0);
      ctx.fill();
      // legs
      ctx.strokeStyle = "#0f0";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 4); ctx.lineTo(x - 12, y + 12);
      ctx.moveTo(x + 8, y + 4); ctx.lineTo(x + 12, y + 12);
      ctx.stroke();
      if (e.carrying) {
        ctx.strokeStyle = "#ff0";
        ctx.beginPath();
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x, y + 16);
        ctx.stroke();
      }
    } else if (e.type === "mutant") {
      ctx.fillStyle = "#f0f";
      ctx.shadowColor = "#f0f";
      ctx.beginPath();
      ctx.moveTo(x, y - 10);
      ctx.lineTo(x + 10, y + 8);
      ctx.lineTo(x - 10, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(x - 3, y - 2, 2, 2);
      ctx.fillRect(x + 1, y - 2, 2, 2);
    } else if (e.type === "bomber") {
      ctx.fillStyle = "#0f0";
      ctx.shadowColor = "#0f0";
      ctx.fillRect(x - 14, y - 5, 28, 10);
      ctx.fillRect(x - 18, y - 2, 4, 4);
      ctx.fillRect(x + 14, y - 2, 4, 4);
    } else if (e.type === "pod") {
      ctx.strokeStyle = "#0f0";
      ctx.shadowColor = "#0f0";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 12, y - 12, 24, 24);
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
    } else if (e.type === "swarmer") {
      ctx.fillStyle = "#0f0";
      ctx.shadowColor = "#0f0";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === "baiter") {
      ctx.fillStyle = "#f44";
      ctx.shadowColor = "#f00";
      ctx.beginPath();
      ctx.ellipse(x, y, 16, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#faa";
      ctx.fillRect(x - 4, y - 3, 8, 6);
    }
    ctx.shadowBlur = 0;
  }

  function drawBullets() {
    for (const b of bullets) {
      const x = screenX(b.x);
      if (x < -20 || x > VW + 20) continue;
      if (b.friendly) {
        ctx.fillStyle = "#0f0";
        ctx.shadowColor = "#0f0";
        ctx.shadowBlur = 6;
        ctx.fillRect(x - 6, b.y - 1, 12, 2);
      } else if (b.bomb) {
        ctx.fillStyle = "#ff0";
        ctx.beginPath();
        ctx.arc(x, b.y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "#f44";
        ctx.fillRect(x - 2, b.y - 2, 4, 4);
      }
      ctx.shadowBlur = 0;
    }
  }

  function drawParticles() {
    for (const p of particles) {
      const x = screenX(p.x);
      ctx.globalAlpha = clamp(p.life / 400, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(x, p.y, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, VW, VH);

    if (flashT > 0) {
      ctx.fillStyle = `rgba(0,255,0,${0.15 * (flashT / 200)})`;
      ctx.fillRect(0, SCAN_H, VW, VH - SCAN_H);
    }

    drawStars();
    drawTerrain();
    for (const h of humans) drawHuman(h);
    for (const e of enemies) drawEnemy(e);
    drawBullets();
    drawParticles();
    drawShip();
    drawScanner();

    // bottom status line
    ctx.fillStyle = "#0a0";
    ctx.font = "10px 'Press Start 2P', monospace";
    ctx.textAlign = "left";
    if (state === "ready") {
      ctx.fillStyle = "#0f0";
      ctx.font = "16px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText("PLAYER ONE", VW / 2, VH * 0.45);
    }
    if (state === "clear") {
      ctx.fillStyle = "#0f0";
      ctx.font = "14px 'Press Start 2P', monospace";
      ctx.textAlign = "center";
      ctx.fillText("ATTACK WAVE " + wave + " COMPLETED", VW / 2, VH * 0.45);
    }
  }

  // ── Loop ─────────────────────────────────────────────────────────────────
  function tick(ts) {
    if (!prev) prev = ts;
    let dt = ts - prev;
    prev = ts;
    if (dt > 40) dt = 40;
    if (dt < 0) dt = 0;
    update(dt);
    render();
    requestAnimationFrame(tick);
  }

  // ── Input ────────────────────────────────────────────────────────────────
  function togglePauseOrStart() {
    unlockAudio();
    if (state === "title" || state === "over") beginGame();
    else if (state === "play") {
      state = "pause";
      setThrust(false);
      showOV("PAUSED", isTouchPrimary() ? "TAP TO RESUME" : "SPACE TO RESUME", "paused");
    } else if (state === "pause") {
      state = "play";
      hideOV();
    }
  }
  function toggleMute() {
    muted = !muted;
    if (muted) setThrust(false);
    const btn = document.getElementById("btn-mute");
    if (btn) {
      btn.textContent = muted ? "✕" : "♪";
      btn.classList.toggle("active", muted);
    }
  }

  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    keys[e.key] = true;
    if (e.key === "m" || e.key === "M") { toggleMute(); return; }
    if (e.key === "p" || e.key === "P" || e.key === "Escape") {
      e.preventDefault();
      if (state === "play" || state === "pause") togglePauseOrStart();
      return;
    }
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (state === "title" || state === "over" || state === "pause") togglePauseOrStart();
      else fireHeld = true;
      return;
    }
    if (e.key === "b" || e.key === "B") { e.preventDefault(); smartBomb(); return; }
    if (e.key === "h" || e.key === "H") { e.preventDefault(); hyperspace(); return; }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.key === "z" || e.key === "Z") {
      thrustHeld = true;
    }
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    keys[e.key] = false;
    if (e.code === "Space" || e.key === " ") fireHeld = false;
    if (e.code === "ShiftLeft" || e.code === "ShiftRight" || e.key === "z" || e.key === "Z") {
      thrustHeld = false;
      // check other thrust keys
      if (!(keys["ShiftLeft"] || keys["ShiftRight"] || keys["z"] || keys["Z"] || keys["KeyZ"])) {
        setThrust(false);
      }
    }
  });

  canvas.tabIndex = 0;
  canvas.style.outline = "none";
  canvas.addEventListener("pointerdown", () => {
    unlockAudio();
    if (state === "title" || state === "over") beginGame();
    else if (state === "pause") { state = "play"; hideOV(); }
  });

  overlay.style.pointerEvents = "auto";
  overlay.addEventListener("click", () => {
    unlockAudio();
    if (state === "title" || state === "over") beginGame();
    else if (state === "pause") { state = "play"; hideOV(); }
  });

  function bindHold(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add("active");
      el.setPointerCapture?.(e.pointerId);
      unlockAudio();
      onDown();
    };
    const up = (e) => {
      if (!el.classList.contains("active")) return;
      el.classList.remove("active");
      onUp();
    };
    el.addEventListener("pointerdown", down, { passive: false });
    el.addEventListener("pointerup", up, { passive: false });
    el.addEventListener("pointercancel", up, { passive: false });
    el.addEventListener("lostpointercapture", up, { passive: false });
  }

  bindHold("btn-up", () => { keys._up = true; }, () => { keys._up = false; });
  bindHold("btn-down", () => { keys._down = true; }, () => { keys._down = false; });
  bindHold("btn-thrust", () => { thrustHeld = true; }, () => { thrustHeld = false; setThrust(false); });
  bindHold("btn-reverse", () => {
    keys._rev = true;
    if (ship) ship.face *= -1;
  }, () => { keys._rev = false; });
  bindHold("btn-fire", () => { fireHeld = true; if (state === "title" || state === "over") beginGame(); }, () => { fireHeld = false; });
  bindHold("btn-bomb", () => smartBomb(), () => {});
  bindHold("btn-hyper", () => hyperspace(), () => {});
  bindHold("btn-pause", () => togglePauseOrStart(), () => {});
  bindHold("btn-mute", () => toggleMute(), () => {});

  document.getElementById("game-wrapper").addEventListener("touchmove", (e) => {
    e.preventDefault();
  }, { passive: false });

  // Boot
  buildTerrain();
  stars = [];
  for (let i = 0; i < 80; i++) {
    stars.push({ x: Math.random() * WORLD, y: 40 + Math.random() * 400, b: Math.random() });
  }
  humans = [];
  enemies = [];
  bullets = [];
  particles = [];
  ship = null;
  $high.textContent = pad(high);
  hud();
  $lives.innerHTML = "";
  showOV("DEFENDER", "INSERT COIN", null);
  state = "title";
  prev = 0;
  requestAnimationFrame(tick);
})();
