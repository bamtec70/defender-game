/* DEFENDER — Williams 1981 web recreation for the WTP Arcade.
   Native 292x240 raster. All sprites are hand-authored pixel data below and all
   sound is synthesized with Web Audio. No ROM data, samples or extracted images. */
(() => {
"use strict";
const W = 292, H = 240;
const cv = document.getElementById("game"), g = cv.getContext("2d", { alpha: false });
g.imageSmoothingEnabled = false;
const WORLD = 2048;               // world wraps; scanner shows it at 1/16
const TOP = 36, GROUND = 216;     // playfield top (below scanner divider), terrain baseline
const HUM_Y = 229;                // humanoid feet line
const SC_X0 = 82, SC_X1 = 213, SC_Y1 = 32;
const SCAN_COLS = ["#2a10b0", "#00ac00", "#fd0000", "#d75202", "#faae01"]; /* df_ref3/4 waves 1-5; blue while ship is dead; wave 6+ not seen, cycle assumed */
const BLUE = "#2a10b0", TERR = "#b4581c";
const STEP = 1 / 60;
const qs = new URLSearchParams(location.search);
const DEBUG_WAVE = Math.max(0, parseInt(qs.get("wave") || "0", 10) || 0);

/* ---------------- font (hand-authored 5x7) ---------------- */
const FONT = {
  A:"0E11111F111111",B:"1E11111E11111E",C:"0E11101010110E",D:"1E11111111111E",E:"1F10101E10101F",F:"1F10101E101010",
  G:"0E1110171111 0F",H:"1111111F111111",I:"0E04040404040E",J:"07020202021 20C",K:"11121418141211",L:"1010101010101F",
  M:"111B1515111111",N:"11111915131111",O:"0E11111111110E",P:"1E11111E101010",Q:"0E11111115120D",R:"1E11111E141211",
  S:"0F10100E01011E",T:"1F040404040404",U:"1111111111110E",V:"1111111111 0A04",W:"1111111515150A",X:"11110A040A1111",
  Y:"1111110A040404",Z:"1F01020408101F","0":"0E111315 19110E","1":"040C040404040E","2":"0E11010204081F","3":"1F020402 01110E",
  "4":"02060A121F0202","5":"1F101E0101110E","6":"0608101E11110E","7":"1F010204080808","8":"0E11110E11110E","9":"0E11110F01020C",
  ":":"000C0C000C0C00",".":"0000000000 0C0C","-":"0000001F000000",",":"00000000 0C0408","!":"04040404040004","?":"0E110102040004",
  "/":"01010204081010","(":"02040808080402",")":"08040202020408","'":"04040800000000","=":"00001F001F0000"," ":"00000000000000"
};
for (const k in FONT) { const s = FONT[k].replace(/ /g, ""); FONT[k] = []; for (let i = 0; i < 7; i++) FONT[k].push(parseInt(s.substr(i * 2, 2), 16)); }
function textW(s, cx, y, col) { /* tally font: 8 px advance, 4 px space, centred (measured) */
  s = String(s).toUpperCase(); let w = 0; for (const ch of s) w += ch === " " ? 4 : 8; let x = Math.round(cx - (w - 2) / 2); g.fillStyle = col;
  for (const ch of s) { const f = FONT[ch]; if (f) for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (f[r] & (16 >> c)) g.fillRect(x + c + (c > 2 ? 1 : 0), y + r, c === 2 ? 2 : 1, 1); x += ch === " " ? 4 : 8; }
}
function text(s, x, y, col, sc = 1, align = "left") {
  s = String(s).toUpperCase();
  const adv = 6 * sc;
  if (align === "center") x -= Math.round((s.length * adv - sc) / 2); else if (align === "right") x -= s.length * adv - sc;
  g.fillStyle = col;
  for (let i = 0; i < s.length; i++) {
    const f = FONT[s[i]]; if (!f) continue;
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (f[r] & (16 >> c)) g.fillRect(x + i * adv + c * sc, y + r * sc, sc, sc);
  }
}

/* ---------------- sprites (hand-authored pixel art) ---------------- */
const PAL = { W:"#ffffff", w:"#c0c0c0", M:"#ff30ff", m:"#a020c0", R:"#ff2020", r:"#a00000", Y:"#ffff20", G:"#20ff20", g:"#10a010",
  C:"#20ffff", B:"#4060ff", O:"#ff9000", P:"#ff80ff", p:"#8020ff", K:"#606060", T:"#e0a060" };
function sprite(rows, map) {
  const h = rows.length, w = rows[0].length, c = document.createElement("canvas"); c.width = w; c.height = h;
  const x = c.getContext("2d");
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== ".") { x.fillStyle = (map && map[ch]) || PAL[ch]; x.fillRect(i, j, 1, 1); } }));
  const f = document.createElement("canvas"); f.width = w; f.height = h; const fx = f.getContext("2d");
  fx.translate(w, 0); fx.scale(-1, 1); fx.drawImage(c, 0, 0);
  return { r: c, l: f, w, h, rows };
}
const SPR = {
  /* build 51 redraw: 1981 Williams proportions (ship 16x6: white hull, magenta stripe, purple fin, blue canopy) */
  ship: sprite([
    "..BB............",
    ".wBBw...........",
    "wwwwwwwwww......",
    "pMMwwMMMwwwwwww.",
    "wwwwwwwwwwwwwwwW",
    "pp.MMMwww.......",
  ]),
  /* lander: green saucer with yellow port lights, three green legs */
  lander: sprite([
    "...GGG...",
    ".GGYGYGG.",
    "GGYGGGYGG",
    ".GGGGGGG.",
    "..G.G.G..",
    ".G..G..G.",
    "G...G...G",
  ]),
  /* mutant: lander frame in magenta/green checker */
  mutant: sprite([
    "...MGM...",
    ".MGMGMGM.",
    "GMGMGMGMG",
    ".MGMGMGM.",
    "..M.G.M..",
    ".M..G..M.",
    "M...M...M",
  ]),
  /* baiter: long flat green saucer */
  baiter: sprite([
    "....GGGGG....",
    "..GGgGgGgGG..",
    "GGGGGGGGGGGGG",
    "..ggggggggg..",
  ]),
  /* bomber: purple box with blue slats */
  bomber: sprite([
    "ppppp",
    "pBBBp",
    "ppppp",
    "pBBBp",
    "ppppp",
  ]),
  /* pod: purple core with red spokes */
  pod: sprite([
    "R..R..R",
    ".R.p.R.",
    "..ppp..",
    "RpppppR",
    "..ppp..",
    ".R.p.R.",
    "R..R..R",
  ]),
  /* swarmer: small red dart with yellow eye */
  swarmer: sprite([
    ".RR..",
    "RRRYR",
    ".RR..",
  ]),
  /* humanoid: green head, magenta body, purple legs (3x8) */
  human: sprite([
    ".G.",
    "MMM",
    "MMM",
    ".M.",
    ".p.",
    "p.p",
    "p.p",
    "p.p",
  ]),
  lifeIcon: sprite([
    "w.......",
    "wMMw....",
    "wwwwwwWW",
  ]),
};
SPR.human.h = 8;

/* ---------------- terrain & stars ---------------- */
let seedN = 1981;
function rnd() { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; }
const terr = new Int16Array(WORLD);
(function buildTerrain() {
  let y = GROUND, x = 0;
  while (x < WORLD) {
    const r = rnd();
    if (r < 0.45) { // flat fuzz
      const n = 20 + (rnd() * 60) | 0;
      for (let i = 0; i < n && x < WORLD; i++, x++) terr[x] = y + ((x >> 1) & 1 ? 0 : 1) + ((x * 7) % 11 === 0 ? 1 : 0);
    } else { // mountain: up then down, 45 degrees
      const hgt = 6 + (rnd() * (r > 0.75 ? 36 : 16)) | 0, up = rnd() < 0.3 ? 2 : 1, dn = rnd() < 0.3 ? 2 : 1;
      for (let i = 0; i < hgt * up && x < WORLD; i++, x++) terr[x] = y - Math.floor(i / up);
      for (let i = hgt * dn; i > 0 && x < WORLD; i--, x++) terr[x] = y - Math.ceil(i / dn);
    }
  }
  // smooth the seam at the wrap
  for (let i = 0; i < 40; i++) terr[WORLD - 40 + i] = Math.round(terr[WORLD - 40 + i] + (terr[0] - terr[WORLD - 40 + i]) * i / 40);
})();
const STAR_COLS = ["#ff2020", "#20ff20", "#2060ff", "#ffff20", "#ff30ff", "#20ffff", "#ffffff", "#ff9000"];
const stars = [];
for (let i = 0; i < 46; i++) stars.push({ x: rnd() * 1024, y: TOP + 4 + rnd() * 150, c: STAR_COLS[(rnd() * 8) | 0], t: rnd() * 100 });

/* ---------------- audio (Web Audio synthesis of the Williams sound board) ---------------- */
/* build 51: sound is ON by default. Older builds stored "defender_mute"; that key is dropped so a stale value can
   never start the game silent. Mute is only on when the player turns it on this build (key defender_mute_v51). */
try { localStorage.removeItem("defender_mute"); } catch (_) {}
let AC = null, master = null, muted = false;
try { muted = localStorage.getItem("defender_mute_v51") === "1"; } catch (_) {}
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = muted ? 0 : 0.32; master.connect(AC.destination); } catch (e) { AC = null; } }
  if (AC && AC.state !== "running" && AC.resume) AC.resume().catch(() => {});
  if (AC && master) master.gain.value = muted ? 0 : 0.32;
  return AC;
}
let noiseBuf = null;
function noise() {
  if (!noiseBuf) { noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate); const d = noiseBuf.getChannelData(0); let v = 0; for (let i = 0; i < d.length; i++) { if (i % 3 === 0) v = Math.random() * 2 - 1; d[i] = v; } }
  const n = AC.createBufferSource(); n.buffer = noiseBuf; n.loop = true; return n;
}
function env(gn, t, a, peak, dur) { gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(peak, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
function tone(type, f0, f1, dur, vol, delay = 0, curve = "exp") {
  if (!audio() || muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), gn = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) curve === "lin" ? o.frequency.linearRampToValueAtTime(f1, t + dur) : o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(gn, t, 0.004, vol, dur); o.connect(gn); gn.connect(master); o.start(t); o.stop(t + dur + 0.03);
}
let laserNode = null;
function laserVoice() {
  if (!audio() || muted) return;
  if (laserNode) { try { laserNode.gn.gain.cancelScheduledValues(AC.currentTime); laserNode.gn.gain.setValueAtTime(0, AC.currentTime); laserNode.n.stop(); } catch (e) {} }
  const t = AC.currentTime, n = noise(), f = AC.createBiquadFilter(), gn = AC.createGain();
  f.type = "lowpass"; f.Q.value = 0.7; f.frequency.setValueAtTime(4400, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.1);
  f.frequency.exponentialRampToValueAtTime(1200, t + 1.0); f.frequency.exponentialRampToValueAtTime(1000, t + 2.0);
  gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(0.32, t + 0.01); gn.gain.exponentialRampToValueAtTime(0.21, t + 1.8); gn.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  n.connect(f); f.connect(gn); gn.connect(master); n.start(t); n.stop(t + 2.25); laserNode = { n, gn };
}
function nburst(dur, vol, fc, q = 1, delay = 0, fc1, type = "bandpass") {
  if (!audio() || muted) return;
  const t = AC.currentTime + delay, n = noise(), f = AC.createBiquadFilter(), gn = AC.createGain();
  f.type = type; f.frequency.setValueAtTime(fc, t); if (fc1) f.frequency.exponentialRampToValueAtTime(fc1, t + dur); f.Q.value = q;
  env(gn, t, 0.003, vol, dur); n.connect(f); f.connect(gn); gn.connect(master); n.start(t); n.stop(t + dur + 0.03);
}
let thrustNode = null;
function thrustSound(on) {
  if (on && !muted && audio()) {
    if (thrustNode) return;
    const n = noise(), f = AC.createBiquadFilter(), f2 = AC.createBiquadFilter(), gn = AC.createGain();
    f.type = "lowpass"; f.frequency.value = 380; f2.type = "peaking"; f2.frequency.value = 260; f2.gain.value = 8;
    gn.gain.setValueAtTime(0.0001, AC.currentTime); gn.gain.linearRampToValueAtTime(0.35, AC.currentTime + 0.08);
    n.connect(f); f.connect(f2); f2.connect(gn); gn.connect(master); n.start();
    thrustNode = { n, gn };
  } else if (thrustNode) {
    const { n, gn } = thrustNode; thrustNode = null;
    try { gn.gain.cancelScheduledValues(AC.currentTime); gn.gain.setValueAtTime(gn.gain.value, AC.currentTime); gn.gain.linearRampToValueAtTime(0.0001, AC.currentTime + 0.12); n.stop(AC.currentTime + 0.15); } catch (e) {}
  }
}
  // -- Audio unlock (sound ON by default): first tap/click/key anywhere resumes Web Audio --
  (function () {
    function silentWav() {
      const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
      const s = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
      s(0, "RIFF"); v.setUint32(4, 36 + n, true); s(8, "WAVEfmt "); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
      v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, "data"); v.setUint32(40, n, true); b.fill(128, 44);
      let str = ""; for (let i = 0; i < b.length; i++) str += String.fromCharCode(b[i]);
      return "data:audio/wav;base64," + btoa(str);
    }
    let tag = null, kicked = null;
    function onGesture() {
      try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch (_) {}
      try { if (!tag) { tag = new Audio(silentWav()); tag.setAttribute("playsinline", ""); tag.loop = true; tag.volume = 0.01; } if (tag.paused) { const p = tag.play(); if (p && p.catch) p.catch(function () {}); } } catch (_) {}
      try { audio(); } catch (_) {}
      try {
        const c = AC;
        if (c) {
          if (c.state !== "running" && c.resume) c.resume().catch(function () {});
          if (kicked !== c) { kicked = c; const sb = c.createBuffer(1, 1, 22050), src = c.createBufferSource(); src.buffer = sb; src.connect(c.destination); src.start(0); }
        }
      } catch (_) {}
    }
    ["pointerdown", "touchstart", "touchend", "mousedown", "click", "keydown"].forEach(function (t) {
      window.addEventListener(t, onGesture, { capture: true, passive: true });
    });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) { try { const c = AC; if (c && c.state === "suspended") c.resume().catch(function () {}); } catch (_) {} } });
    window.__audioInfo = function () { const c = AC; return { ctx: c ? c.state : "none", muted: muted }; };
  })();
// Tuned against df_ref2.mp3 (band energies / peak tracking, see README)
const SFX = {
  // laser: bright click (~1.5 kHz noise) then a stepped tone falling ~780 -> 560 Hz over ~0.16 s
  // laser (df_ref4 isolated taps x5): noise, centroid ~2.2 kHz at onset -> 1.2 kHz @0.1 s -> 600 Hz @1 s -> 500 Hz @1.8 s,
  // level -3.5 dB/s; one voice, a new shot restarts it
  fire() { laserVoice(); },
  // enemy explosion: loud, mostly <500 Hz noise (peaks 200-370 Hz), ~0.8 s
  boom() { nburst(0.8, 0.9, 1400, 0.7, 0, 180, "lowpass"); nburst(0.12, 0.25, 900, 1); },
  smallBoom() { nburst(0.45, 0.6, 1600, 0.7, 0, 220, "lowpass"); },
  // lander materialize: warbling rise
  // materialize (df_ref4: Baiter 513.4 s, hyperspace re-entry 137.7 s): ~1.0 s full-level low noise, peak rising ~100 -> 600 Hz
  materialize() { nburst(1.0, 0.9, 120, 1.5, 0, 650); tone("sawtooth", 90, 520, 1.0, 0.1, 0, "lin"); },
  alarm() { if (!audio() || muted) return; for (let i = 0; i < 6; i++) tone("square", i % 2 ? 1100 : 820, i % 2 ? 1100 : 820, 0.11, 0.07, i * 0.12); },
  scream() { tone("triangle", 2600, 500, 0.9, 0.16); tone("square", 2700, 520, 0.9, 0.05); },
  catchH() { [700, 900, 1200].forEach((f, i) => tone("square", f, f, 0.07, 0.1, i * 0.06)); },
  landH() { [1200, 900, 1200, 1600].forEach((f, i) => tone("square", f, f, 0.06, 0.1, i * 0.06)); },
  // mutant (df_ref4 quiet windows 151, 753, 813, 1050 s): descending chirp ~3.8 kHz -> 1.1 kHz over ~0.75 s, repeats while on screen
  mutant() { tone("square", 3800, 1100, 0.75, 0.05); },
  // enemy shot (Baiter shots 515.4-516.1 s): ~0.17 s full-level low buzz, peak 86-130 Hz
  enemyShot() { tone("square", 120, 95, 0.17, 0.14); nburst(0.17, 0.4, 300, 0.7, 0, 0, "lowpass"); },
  baiter() { if (!audio() || muted) return; for (let i = 0; i < 4; i++) tone("square", 1400, 600, 0.08, 0.06, i * 0.09); },
  // smart bomb: bright 2-3 kHz noise crack (~0.5 s) over a low boom
  // smart bomb (isolated, df_ref4 141/441/621 s): ~0.15 s full-level crack, then ~2.2-2.4 s low rumble peaking 20-100 Hz
  bomb() { nburst(0.15, 0.9, 900, 0.5); nburst(2.3, 0.45, 160, 0.7, 0.12, 0, "lowpass"); },
  // hyperspace (137.3 s): silent while the playfield is blank; the re-entry plays the materialize sound
  // hyperspace: short descending "zip" as the ship vanishes (re-entry plays materialize)
  hyper() { tone("square", 2400, 180, 0.28, 0.08, 0, "exp"); nburst(0.25, 0.35, 2600, 0.8, 0, 400); },
  // humanoid lost: falling wail that thuds into the ground
  humanLost() { tone("triangle", 1800, 160, 0.7, 0.16); tone("square", 1700, 150, 0.7, 0.04); nburst(0.3, 0.5, 400, 0.7, 0.65, 0, "lowpass"); },
  // humanoid saved (set down safely): bright rising arpeggio
  saved() { [880, 1175, 1480, 1760, 2350].forEach((f, i) => tone("square", f, f, 0.06, 0.1, i * 0.055)); },
  // player death: low rumble (>80% energy under 500 Hz) decaying over ~1.8 s, then silence
  death() { nburst(1.8, 0.9, 900, 0.6, 0, 140, "lowpass"); nburst(0.25, 0.4, 2400, 0.7); tone("sawtooth", 220, 40, 1.6, 0.12); },
  // start: ~2 s noisy, warbling harmonic sweep (peaks wander 250 -> 820 -> 1640 -> 2700 Hz)
  start() {
    if (!audio() || muted) return;
    nburst(2.0, 0.25, 3200, 0.5);
    const f = [247, 322, 495, 656, 818, 1636, 495, 247, 2702, 409, 247, 409, 247, 322];
    f.forEach((v, i) => tone("square", v, v * 1.08, 0.14, 0.07, i * 0.145));
  },
  // coin: ~0.85 s bright noise (centroid ~2.4 kHz) over a low 170-280 Hz buzz
  coin() { nburst(0.85, 0.3, 2400, 0.6); tone("square", 280, 170, 0.85, 0.08); },
  extra() { if (!audio() || muted) return; for (let i = 0; i < 8; i++) tone("square", i % 2 ? 1568 : 1046, i % 2 ? 1568 : 1046, 0.07, 0.1, i * 0.08); },
  tally() { tone("square", 1250, 1250, 0.05, 0.11); tone("square", 1875, 1875, 0.04, 0.06, 0.05); },
  planet() { nburst(2.0, 0.8, 1400, 0.3, 0, 300, "lowpass"); tone("sawtooth", 140, 40, 2.0, 0.25); }, /* measured: ~2 s loud, energy <1.5 kHz */
};
// thrust (measured): steady noise with ~98% of energy below 500 Hz, peaks 150-370 Hz, ~40% of explosion level

/* ---------------- state ---------------- */
const keys = {};
let mode = "attract", modeT = 0, credits = 0, paused = false, frame = 0;
let score = 0, lives = 3, bombs = 3, wave = 1, nextExtra = 10000;
let ship, enemies = [], shots = [], beams = [], parts = [], humans = [], mines = [], pops = [];
let planetAlive = true, waveT = 0, landerQueue = 0, batchT = 0, baiterT = 0, waveDone = false;
let tallyCol = 0; const TALLY_COLS = ["#f5ffa0", "#20ffff", "#fa02f6", "#fa0356", "#f6af05", "#8cf808"];
let planetFlash = 0, FLASHC = ["#7020c0", "#d02020", "#20c0c0", "#e08020", "#c020c0", "#2040d0"];
let deadT = 0, flashT = 0, bonusT = 0, bonusShown = 0, planetBoomT = 0, entry = null;
const DEFAULT_TABLE = [["DRJ", 21270], ["SAM", 18315], ["LED", 15920], ["PGD", 14285], ["CRB", 12520], ["MRS", 11035], ["SSR", 8265], ["TMH", 6010]];
let table;
try { table = JSON.parse(localStorage.getItem("defender_table_v1")) || DEFAULT_TABLE.slice(); } catch (e) { table = DEFAULT_TABLE.slice(); }
let high = Math.max(Number(localStorage.getItem("defender_hi_v3") || 0), table[0][1]);

const wrap = x => { const r = ((x % WORLD) + WORLD) % WORLD; return r >= WORLD ? r - WORLD : r; };
const camX = () => wrap(ship.x - ship.sx);
function rel(x) { let d = wrap(x - camX()); if (d > WORLD - 64) d -= WORLD; return d; } // screen x
function onScreen(x, m = 0) { const s = rel(x); return s > -m && s < W + m; }
function dxTo(a, b) { let d = wrap(b - a); if (d > WORLD / 2) d -= WORLD; return d; }

function waveCfg(w) {
  const k = Math.min(w, 12);
  return {
    landers: w === 1 ? 15 : 20, batch: 5, bombers: Math.min(2 + w, 6), pods: w === 1 ? 1 : Math.min(2 + (w >> 1), 6),
    baiterDelay: Math.max(20, 89 - 5 * (w - 1)) /* wave1 89 s measured df_ref3 */, baiterEvery: Math.max(4, 13 - w), speed: 1 + 0.1 * (k - 1), fire: 1 + 0.14 * (k - 1),
    swarm: Math.min(3 + (w >> 1), 7),
  };
}

function newShip() { return { x: 300, y: 120, vx: 0, dir: 1, sx: 47, slide: false, alive: true, hyperT: 0, carry: null }; }
function addScore(n) {
  score += n;
  if (score >= nextExtra) { nextExtra += 10000; lives = Math.min(lives + 1, 9); bombs = Math.min(bombs + 1, 9); SFX.extra(); }
  if (score > high) { high = score; localStorage.setItem("defender_hi_v3", String(high)); }
}
function pop(x, y, txt) { pops.push({ x, y, txt, t: 60 }); }

function resetHumans() {
  humans = [];
  for (let i = 0; i < 10; i++) humans.push({ x: wrap(i * 205 + 60 + rnd() * 80), y: HUM_Y - (rnd() * 4 | 0), state: "walk", vx: (rnd() < 0.5 ? -1 : 1) * 0.12, vy: 0, by: null, fallFrom: 0 });
}

function startGame() {
  if (window.WTPShare) WTPShare.hide();
  score = 0; lives = 3; bombs = 3; nextExtra = 10000; wave = DEBUG_WAVE || 1;
  ship = newShip(); planetAlive = true; resetHumans();
  if (qs.get("planet") === "0") { planetAlive = false; humans = []; }
  mode = "play"; modeT = 0; SFX.start(); startWave();
}
function startWave() {
  const c = waveCfg(wave);
  if (wave > 1 && wave % 5 === 0 && (!planetAlive || humans.length < 10)) { planetAlive = true; resetHumans(); }
  enemies = []; shots = []; beams = []; mines = []; waveDone = false;
  for (const h of humans) { h.by = null; if (h.state === "carried" || h.state === "fall") { h.state = "walk"; h.y = HUM_Y - 1; h.vy = 0; } }
  landerQueue = c.landers; batchT = 60; waveT = 0; baiterT = c.baiterDelay * 60;
  for (let i = 0; i < c.bombers; i++) spawn("bomber", wrap(ship.x + 500 + i * 140 + rnd() * 60), 70 + rnd() * 100, false);
  for (let i = 0; i < c.pods; i++) spawn("pod", wrap(ship.x + 700 + i * 260 + rnd() * 100), 60 + rnd() * 120, false);
  ship.vx = 0;
}
function spawn(type, x, y, mat = true) {
  const e = { type, x, y, vx: 0, vy: 0, t: 0, mat: mat ? 40 : 0, fireT: 60 + rnd() * 120, target: null, carry: null, ph: rnd() * 6.28 };
  if (type === "lander") { e.vx = (rnd() < 0.5 ? -1 : 1) * 0.67; e.hover = 150 + rnd() * 40; }
  if (type === "bomber") { e.vx = (rnd() < 0.5 ? -1 : 1) * 0.5; e.baseY = y; }
  if (type === "pod") { e.vx = (rnd() < 0.5 ? -1 : 1) * 0.3; e.vy = (rnd() < 0.5 ? -1 : 1) * 0.25; }
  if (type === "swarmer") { e.vx = (rnd() < 0.5 ? -1 : 1) * 2; e.vy = 0; }
  enemies.push(e);
  if (mat && onScreen(x, 20)) SFX.materialize();
  return e;
}
const SIZES = { lander: SPR.lander, mutant: SPR.mutant, baiter: SPR.baiter, bomber: SPR.bomber, pod: SPR.pod, swarmer: SPR.swarmer };
const POINTS = { lander: 150, mutant: 150, baiter: 200, bomber: 250, pod: 1000, swarmer: 150 };

function burst(x, y, spr, n = 18, speed = 1.6) {
  // Williams-style: the sprite's pixels fly apart as a widening grid (~30 px across, ~0.6 s)
  const cols = []; spr.rows.forEach(r => [...r].forEach(ch => { if (ch !== ".") cols.push(PAL[ch]); }));
  const cx = x + spr.w / 2, cy = y + spr.h / 2;
  for (let j = -2; j <= 2; j++) for (let i = -3; i <= 3; i++) {
    if ((i + j) & 1) continue;
    parts.push({ x: cx + i, y: cy + j, vx: i * 0.4 * speed / 1.6, vy: j * 0.45 * speed / 1.6, t: 36, c: cols[(i + 3 + (j + 2) * 7) % cols.length], w: 2 });
  }
}
function killEnemy(e, bySmart) {
  enemies.splice(enemies.indexOf(e), 1);
  addScore(POINTS[e.type]); burst(e.x, e.y, SIZES[e.type]);
  if (e.type === "pod" && !bySmart) { const c = waveCfg(wave); for (let i = 0; i < c.swarm; i++) { const s = spawn("swarmer", wrap(e.x + i * 3), e.y + (i % 3) * 3, false); s.vy = (i - c.swarm / 2) * 0.3; } }
  if (e.carry) { const h = e.carry; h.state = "fall"; h.vy = 0; h.by = null; h.fallFrom = h.y; e.carry = null; SFX.scream(); }
  if (e.target && e.target.by === e) e.target.by = null;
  e.type === "swarmer" ? SFX.smallBoom() : SFX.boom();
}

/* ---------------- update ---------------- */
function input() {
  return {
    up: keys.ArrowUp || keys.KeyW || touch.up, down: keys.ArrowDown || keys.KeyS || touch.down,
    // Left/Right = face that way AND thrust while held; the most recently pressed one wins
    thrust: horizDir() !== 0, dir: horizDir(),
    fire: keys.Space || keys.ControlLeft || keys.ControlRight || touch.fire,
  };
}
let fireLatch = false, firePending = false, testHold = false;
function horizDir() {
  const L = keys.ArrowLeft || keys.KeyA || touch.left, R = keys.ArrowRight || keys.KeyD || touch.right;
  if (L && R) return lastHoriz; return L ? -1 : R ? 1 : 0;
}
let lastHoriz = 1;
function doReverse() { if (mode === "play" && ship && ship.alive && !ship.hyperT) ship.dir = -ship.dir; }
function doBomb() {
  if (mode !== "play" || !ship.alive || bombs <= 0) return;
  bombs--; flashT = 6; SFX.bomb();
  for (const e of enemies.slice()) if (onScreen(e.x, 4) && !e.mat) killEnemy(e, true);
  shots = shots.filter(s => !onScreen(s.x));
}
function doHyper() {
  if (mode !== "play" || !ship.alive || ship.hyperT) return;
  ship.hyperT = 42; SFX.hyper(); thrustSound(false); /* measured: playfield blank 24 frames, then ship re-materializes */
}
function fireLaser() {
  if (beams.length >= 4) return;
  const sx = ship.sx + (ship.dir > 0 ? 17 : -1);
  beams.push({ y: Math.round(ship.y) + 4, x0: sx, head: sx, tail: sx, dir: ship.dir, t: 0, seed: (Math.random() * 1000) | 0 });
  SFX.fire();
}
function shipDie() {
  if (!ship.alive) return;
  ship.alive = false; deadT = 240; thrustSound(false); SFX.death(); flashT = 4;
  const cx = ship.x + 8, cy = ship.y + 3;
  // measured: filled disc of ~110 white fragments, radius ~10 px at 0.3 s and ~42 px at 0.7 s (r = 0.074 t^1.7)
  for (let i = 0; i < 110; i++) { const a = Math.random() * 6.283, f = Math.sqrt(Math.random()); parts.push({ x: cx, y: cy, ox: cx, oy: cy, ca: Math.cos(a) * f, sa: Math.sin(a) * f, age: 0, ring: true, vx: 0, vy: 0, t: 80, c: "#ffffff", w: 2 }); }
  if (ship.carry) { ship.carry.state = "fall"; ship.carry.fallFrom = ship.carry.y; ship.carry = null; }
}

function update() {
  frame++; modeT++;
  if (mode === "play") updatePlay();
  else if (mode === "bonus") updateBonus();
  else if (mode === "planet") { planetBoomT--; if (planetFlash > 0) planetFlash--; updateParts(); if (planetBoomT <= 0) mode = "play"; }
  else if (mode === "over") { if (modeT > 180) { const q = qualifies(); if (q >= 0) { mode = "entry"; entry = { pos: q, letters: [0, 0, 0], i: 0, t: 0 }; firePending = false; fireLatch = true; /* build 52: a fire press/hold from play must not skip initial 1 */ } else { mode = "attract"; modeT = 0; } } }
  else if (mode === "entry") updateEntry();
  for (const p of pops) p.t--; pops = pops.filter(p => p.t > 0);
}

function updatePlay() {
  const c = waveCfg(wave), inp = input();
  waveT++;
  // ship
  if (ship.alive) {
    if (ship.hyperT) {
      ship.hyperT--;
      if (ship.hyperT === 18) { ship.x = wrap(ship.x + 400 + Math.random() * 1200); ship.y = TOP + 10 + Math.random() * 150; ship.vx = 0; SFX.materialize(); }
      if (ship.hyperT === 0 && Math.random() < 0.25) shipDie();
    } else {
      if (inp.dir) ship.dir = inp.dir;
      if (inp.up) ship.y -= 2; if (inp.down) ship.y += 2;
      ship.y = Math.max(TOP + 2, Math.min(HUM_Y - 7, ship.y));
      // measured (df_ref2): thrust ~300 px/s^2 from rest, terminal 5 px/frame (300 px/s), coast tau ~1.7 s
      const thr = inp.thrust ? 1 : 0;
      ship.vx += ship.dir * thr * (300 / 3600); ship.vx -= ship.vx * ((thr ? 1.0 : 0.6) / 60);
      ship.x = wrap(ship.x + ship.vx);
      thrustSound(!!thr && !paused);
      // camera lead: ship slides to the trailing quarter of the screen after reversing
      // measured: reverse slide is a constant 4 px/frame between x~47 and x~214; at speed the
      // ship creeps up to ~40 px further forward on screen
      const base = ship.dir > 0 ? 47 : W - 78;
      const target = base + ship.dir * Math.min(40, Math.abs(ship.vx) * 8);
      const d = target - ship.sx;
      if (Math.abs(d) > 30) ship.slide = true; else if (Math.abs(d) < 1) ship.slide = false;
      ship.sx += Math.sign(d) * Math.min(Math.abs(d), ship.slide ? 4 : 0.4);
      if ((inp.fire && !fireLatch) || firePending) fireLaser();
      fireLatch = !!inp.fire; firePending = false;
      if (ship.carry) { const h = ship.carry; h.x = wrap(ship.x + 7); h.y = ship.y + 7; if (h.y >= HUM_Y - 6) { h.y = HUM_Y - (rnd() * 3 | 0); h.state = "walk"; ship.carry = null; addScore(500); pop(h.x, h.y - 10, "500"); SFX.saved(); } }
    }
  } else {
    deadT--; ship.vx *= 0.9;
    if (deadT === 0) {
      lives--;
      if (lives <= 0) { mode = "over"; modeT = 0; thrustSound(false); if (window.WTPShare) WTPShare.show(score); return; }
      ship.alive = true; ship.vx = 0; ship.y = 120; shots = []; mines = []; beams = [];
      for (const e of enemies) if (onScreen(e.x, 40)) e.x = wrap(e.x + 600);
    }
  }
  // lander batches
  batchT--;
  const landersAlive = enemies.filter(e => e.type === "lander").length;
  if (!testHold && landerQueue > 0 && (batchT <= 0 || landersAlive === 0)) {
    const n = Math.min(c.batch, landerQueue); landerQueue -= n; batchT = 60 * 14;
    for (let i = 0; i < n; i++) spawn(planetAlive ? "lander" : "mutant", wrap(ship.x + 160 + rnd() * (WORLD - 320)), TOP + 20 + rnd() * 50);
  }
  // baiters if you take too long
  baiterT--;
  if (!testHold && baiterT <= 0 && ship.alive) { baiterT = c.baiterEvery * 60; spawn("baiter", wrap(ship.x - ship.dir * 160), ship.y + (rnd() - 0.5) * 60); SFX.baiter(); }
  updateEnemies(c); updateShots(); updateBeams(); updateHumans(); updateParts();
  // wave complete: all landers (and mutants) destroyed
  if (!testHold && ship.alive && landerQueue === 0 && !enemies.some(e => e.type === "lander" || e.type === "mutant")) {
    mode = "bonus"; modeT = 0; bonusShown = 0; tallyCol = (Math.random() * TALLY_COLS.length) | 0; thrustSound(false); parts = []; beams = [];
  }
  if (flashT > 0) flashT--;
  if (frame % 48 === 0 && enemies.some(e => e.type === "mutant" && onScreen(e.x))) SFX.mutant(); /* repeating chirp (measured ~0.75-0.9 s) */
}

function aimShot(e, spd) {
  const dx = dxTo(e.x, ship.x + 8), dy = ship.y + 3 - e.y, d = Math.hypot(dx, dy) || 1;
  shots.push({ x: e.x, y: e.y, vx: dx / d * spd, vy: dy / d * spd, t: 160 }); if (onScreen(e.x)) SFX.enemyShot();
}
function updateEnemies(c) {
  for (const e of enemies.slice()) {
    e.t++;
    if (e.mat > 0) { e.mat--; continue; }
    const vis = onScreen(e.x, 0);
    const dx = dxTo(e.x, ship.x), dy = ship.y - e.y;
    switch (e.type) {
      case "lander": {
        if (e.carry) {
          e.y -= 0.5; /* measured df_ref3 carry climb 0.43-0.56 px/frame */ e.carry.x = wrap(e.x + 3); e.carry.y = e.y + 7;
          if (e.y <= TOP + 2) { // humanoid becomes part of a mutant
            const h = e.carry; humans.splice(humans.indexOf(h), 1); e.carry = null; e.type = "mutant"; SFX.mutant(); SFX.humanLost();
            checkPlanet();
          }
        } else if (e.target) {
          const h = e.target;
          if (!humans.includes(h) || h.state !== "walk") { if (h.by === e) h.by = null; e.target = null; break; }
          const hx = dxTo(e.x, h.x - 3);
          e.x = wrap(e.x + Math.sign(hx) * Math.min(Math.abs(hx), 0.67));
          if (Math.abs(hx) < 2) { e.y += 0.43; if (e.y >= h.y - 8) { e.carry = h; h.state = "carried"; h.by = e; e.target = null; SFX.alarm(); } }
          else e.y += (h.y - 30 - e.y) * 0.02;
        } else {
          e.x = wrap(e.x + e.vx * c.speed);
          { const dyh = (e.hover + Math.sin(e.t / 30 + e.ph) * 10) - e.y; e.y += Math.sign(dyh) * Math.min(Math.abs(dyh), 0.43); }
          if (planetAlive && e.t % 30 === 0 && rnd() < 0.4) {
            const h = humans.find(h => h.state === "walk" && !h.by && Math.abs(dxTo(e.x, h.x)) < 90);
            if (h) { e.target = h; h.by = e; }
          }
        }
        break;
      }
      case "mutant": {
        /* df_ref4 151 s: approach 1.4 px/frame, vertical ~0.55 px/frame, x jitter about +-2 px */
        e.x = wrap(e.x + Math.sign(dx) * Math.min(Math.abs(dx), 1.4 * c.speed) + (rnd() - 0.5) * 3);
        e.y += Math.sign(dy) * Math.min(Math.abs(dy), 0.55);
        break;
      }
      case "baiter": {
        const want = Math.sign(dx) * (Math.abs(ship.vx) + 3.5); /* measured: ~3-4 px/frame relative to ship, overshoots */
        e.vx += (want - e.vx) * 0.05; e.x = wrap(e.x + e.vx); { const dy = ship.y - 10 + Math.sin(e.t / 20) * 25 - e.y; e.y += Math.max(-0.45, Math.min(0.45, dy)); } /* measured vertical ~0.45 px/frame */
        break;
      }
      case "bomber": {
        e.x = wrap(e.x + e.vx * c.speed); e.y = e.baseY + Math.sin(e.t / 50 + e.ph) * 30;
        if (e.t % 45 === 0 && mines.length < 30) mines.push({ x: e.x + 2, y: e.y + 2, t: 360 });
        break;
      }
      case "pod": {
        e.x = wrap(e.x + e.vx); e.y += e.vy; if (e.y < TOP + 4 || e.y > GROUND - 20) e.vy = -e.vy;
        break;
      }
      case "swarmer": {
        if (Math.abs(dx) > 70 || Math.sign(dx) === Math.sign(e.vx)) e.vx += Math.sign(dx) * 0.08;
        e.vx = Math.max(-3 * c.speed, Math.min(3 * c.speed, e.vx)); e.x = wrap(e.x + e.vx);
        e.vy += Math.sign(dy) * 0.05; e.vy = Math.max(-1.5, Math.min(1.5, e.vy)); e.y += e.vy;
        break;
      }
    }
    e.y = Math.max(TOP + 1, Math.min(HUM_Y - 4, e.y));
    // firing
    if (vis && ship.alive && e.type !== "pod" && e.type !== "bomber") {
      e.fireT -= c.fire * (e.type === "baiter" ? 2 : 1);
      if (e.fireT <= 0) { e.fireT = e.type === "baiter" ? 18 : 90 + rnd() * 140; /* Baiter shots every ~0.3 s (measured) */ aimShot(e, 0.4 + rnd() * 0.93); /* measured 0.4-1.33 px/frame */ }
    }
    // collision with ship
    const s = SIZES[e.type];
    if (ship.alive && !ship.hyperT && Math.abs(dxTo(ship.x + 8, e.x + s.w / 2)) < (s.w / 2 + 5) && Math.abs(ship.y + 3 - (e.y + s.h / 2)) < (s.h / 2 + 2)) { killEnemy(e); shipDie(); }
  }
}
function updateShots() {
  for (const s of shots) {
    s.x = wrap(s.x + s.vx); s.y += s.vy; s.t--;
    if (ship.alive && !ship.hyperT && Math.abs(dxTo(ship.x + 8, s.x)) < 6 && Math.abs(ship.y + 3 - s.y) < 3) { s.t = 0; shipDie(); }
  }
  shots = shots.filter(s => s.t > 0 && s.y > TOP && s.y < H && onScreen(s.x, 30));
  for (const m of mines) { m.t--; if (ship.alive && !ship.hyperT && Math.abs(dxTo(ship.x + 8, m.x)) < 6 && Math.abs(ship.y + 3 - m.y) < 3) { m.t = 0; shipDie(); } }
  mines = mines.filter(m => m.t > 0);
}
function updateBeams() {
  for (const b of beams) {
    b.t++;
    b.head += b.dir * 8; if (b.t > 3) b.tail += b.dir * 6;
    // hits: anything between tail and head on this row
    const lo = Math.min(b.head, b.tail), hi = Math.max(b.head, b.tail);
    for (const e of enemies.slice()) {
      if (e.mat) continue;
      const s = SIZES[e.type], ex = rel(e.x);
      if (ex + s.w >= lo && ex <= hi && b.y >= e.y - 1 && b.y <= e.y + s.h + 1) { killEnemy(e); b.dead = true; break; }
    }
  }
  beams = beams.filter(b => !b.dead && ((b.dir > 0 && b.tail < W) || (b.dir < 0 && b.tail > 0)) && b.t < 60);
}
function updateHumans() {
  for (const h of humans.slice()) {
    if (h.state === "walk") {
      h.x = wrap(h.x + h.vx); if (frame % 240 === 0 && rnd() < 0.3) h.vx = -h.vx;
    } else if (h.state === "fall") {
      h.vy = Math.min(h.vy + 0.02, 1.6); h.y += h.vy;
      if (ship.alive && !ship.carry && Math.abs(dxTo(ship.x + 8, h.x)) < 8 && Math.abs(ship.y + 6 - h.y) < 8) {
        h.state = "caught"; ship.carry = h; addScore(500); pop(h.x, h.y - 8, "500"); SFX.catchH(); continue;
      }
      if (h.y >= HUM_Y - 5) {
        if (HUM_Y - h.fallFrom > 110) { humans.splice(humans.indexOf(h), 1); burst(h.x, h.y, SPR.human, 8, 1); SFX.humanLost(); checkPlanet(); }
        else { h.y = HUM_Y - 5; h.state = "walk"; addScore(250); pop(h.x, h.y - 10, "250"); SFX.landH(); }
      }
    }
  }
}
function checkPlanet() {
  if (planetAlive && humans.length === 0) {
    planetAlive = false; mode = "planet"; planetBoomT = 210; planetFlash = 72; SFX.planet();
    /* measured df_ref3: terrain breaks into debris rising ~1.7 px/frame, gone after ~3.5 s */
    const PC = [TERR, TERR, TERR, "#ff2020", "#ffff20", "#20ffff", "#ff30ff", "#ffffff"];
    for (let i = 0; i < 260; i++) { const x = wrap(camX() + Math.random() * W); parts.push({ x, y: GROUND - Math.random() * 57, vx: (Math.random() - 0.5) * 0.6, vy: -(1.4 + Math.random() * 0.6), t: 150 + Math.random() * 60, c: PC[i % PC.length], w: 2 }); }
    for (const e of enemies) if (e.type === "lander") { if (e.carry) e.carry = null; e.type = "mutant"; }
  }
}
function updateParts() {
  for (const p of parts) { if (p.ring) { p.age++; const r = 0.074 * Math.pow(p.age, 1.7); p.x = wrap(p.ox + p.ca * r); p.y = p.oy + p.sa * r; } else { p.x = wrap(p.x + p.vx); p.y += p.vy; } p.t--; }
  parts = parts.filter(p => p.t > 0);
}
function updateBonus() {
  const per = Math.min(5, wave) * 100;
  if (bonusShown < humans.length && modeT % 4 === 0) { bonusShown++; addScore(per); } /* icons every 4 frames, silent (measured) */
  if (modeT > 132 + humans.length * 4 + 24) { wave++; mode = "play"; startWave(); }
}

/* ---------------- high scores ---------------- */
function qualifies() { for (let i = 0; i < table.length; i++) if (score > table[i][1]) return i; return -1; }
const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ ";
function updateEntry() {
  entry.t++;
  const inp = input();
  if (entry.t % 8 === 0) { if (inp.up) entry.letters[entry.i] = (entry.letters[entry.i] + 1) % ABC.length; if (inp.down) entry.letters[entry.i] = (entry.letters[entry.i] + ABC.length - 1) % ABC.length; }
  if (entry.t < 30) { firePending = false; fireLatch = fireLatch && !!inp.fire; return; } /* arm delay ~0.5 s */
  if ((inp.fire && !fireLatch) || firePending) { firePending = false; entryNext(); }
  fireLatch = !!inp.fire;
}
function entryNext() { if (!entry || entry.t < 30) return; entry.i++; SFX.tally(); if (entry.i >= 3) finishEntry(); }
function entryType(ch) { if (!entry || entry.t < 30) return; const k = ABC.indexOf(ch); if (k >= 0) { entry.letters[entry.i] = k; entryNext(); } }
function finishEntry() {
  table.splice(entry.pos, 0, [entry.letters.map(i => ABC[i]).join(""), score]); table.length = 8;
  localStorage.setItem("defender_table_v1", JSON.stringify(table)); entry = null; if (table[0][1] > high) { high = table[0][1]; localStorage.setItem("defender_hi_v3", String(high)); } mode = "attract"; modeT = 600;
}

/* ---------------- drawing ---------------- */
function drawSpr(s, x, y, dir = 1) { g.drawImage(dir > 0 ? s.r : s.l, Math.round(x), Math.round(y)); }
const SCORE_COLS = ["#ff30ff", "#4060ff", "#20ff20", "#20ffff", "#ffff20", "#ff2020"];
function drawHUD() {
  // scanner border and divider
  g.fillStyle = mode === "attract" || mode === "entry" ? BLUE : (ship && !ship.alive ? BLUE : SCAN_COLS[(Math.max(1, wave) - 1) % 5]);
  g.fillRect(0, 33, W, 2);
  g.fillRect(SC_X0, 0, 2, 33); g.fillRect(SC_X1, 0, 2, 33); g.fillRect(SC_X0, 0, SC_X1 - SC_X0 + 2, 1);
  // view brackets (white) at the centre of the scanner
  const cx = 148, half = 8; // measured brackets x140..155
  g.fillStyle = "#fff";
  g.fillRect(cx - half, 0, half * 2, 1); g.fillRect(cx - half, 0, 1, 2); g.fillRect(cx + half - 1, 0, 1, 2);
  g.fillRect(cx - half, 32, half * 2, 1); g.fillRect(cx - half, 31, 1, 2); g.fillRect(cx + half - 1, 31, 1, 2);
  if (!ship) return;
  // scanner contents: world centred on the ship
  const sxw = x => { let d = dxTo(ship.x, x); return cx + Math.round(d / 16); };
  const syw = y => 2 + Math.round((y - TOP) * 28 / (H - TOP));
  if (planetAlive) {
    g.fillStyle = TERR; let py = null;
    for (let i = SC_X0 + 2; i < SC_X1; i++) {
      const w0 = wrap((Math.round(ship.x) >> 4 << 4) + (i - cx) * 16); let mn = 0; for (let k = 0; k < 16; k += 2) mn += terr[(w0 + k) % WORLD] / 8;
      const y = 27 - Math.round((GROUND + 1 - mn) * 0.27);
      if (py === null) py = y; g.fillRect(i, Math.min(y, py), 1, Math.abs(y - py) + 1); py = y;
    }
  }
  for (const h of humans) { g.fillStyle = "#909090"; g.fillRect(sxw(h.x), h.state === "walk" ? 28 : syw(h.y), 2, 2); }
  const SC_COL = { lander: "#20ff20", landerTop: "#ffb000", mutant: "#ff30ff", baiter: "#20ff20", bomber: "#8020ff", pod: "#ff2020", swarmer: "#ff9000" };
  for (const e of enemies) { const x = sxw(e.x); if (x > SC_X0 + 1 && x < SC_X1 - 1) { const y = syw(e.y); g.fillStyle = SC_COL[e.type]; g.fillRect(x, y, 2, 2); if (e.type === "lander") { g.fillStyle = SC_COL.landerTop; g.fillRect(x, y, 2, 1); } } }
  if (ship.alive) { g.fillStyle = "#fff"; g.fillRect(cx - 1, syw(ship.y), 3, 1); g.fillRect(cx, syw(ship.y) - 1, 1, 3); }
  // lives, smart bombs, score (left of scanner)
  for (let i = 0; i < Math.min(lives - 1, 5); i++) drawSpr(SPR.lifeIcon, 4 + i * 10, 8);
  for (let i = 0; i < Math.min(bombs, 5); i++) { g.fillStyle = "#fff"; g.fillRect(72, 24 - i * 4, 5, 1); g.fillRect(73, 23 - i * 4, 3, 3); }
  text(String(score), 66, 22, SCORE_COLS[((frame / 240) | 0) % SCORE_COLS.length], 1, "right");
}
function drawStars() {
  const off = ship ? camX() * 0.5 : 0;
  for (const s of stars) {
    const x = ((s.x - off) % 1024 + 1024) % 1024; if (x >= W) continue;
    if (((frame + s.t) >> 4) % 7 === 0) continue;
    g.fillStyle = s.c; g.fillRect(x | 0, s.y | 0, 1, 1);
  }
}
function drawTerrain() {
  if (!planetAlive) return;
  g.fillStyle = TERR; const c = ship ? camX() | 0 : 0;
  for (let i = 0; i < W; i++) { const y = terr[(c + i) % WORLD]; g.fillRect(i, y, 1, 1); }
}
function drawBeams() {
  // measured: 1px line, one colour per frame (cycling), solid front that grows behind the head,
  // then a broken pattern fixed to the screen that is eaten from the tail end
  const cols = ["#ffffff", "#20ffff", "#ff30ff", "#8060ff", "#ffff20", "#ff9000", "#20ff20"];
  for (const b of beams) {
    g.fillStyle = cols[(b.t + b.seed) % cols.length];
    const lo = Math.max(0, Math.min(b.head, b.tail)), hi = Math.min(W, Math.max(b.head, b.tail));
    const solid = 14 + b.t * 1.5;
    for (let x = Math.floor(lo); x < hi; x++) {
      if (Math.abs(b.head - x) > solid) { const h = ((x * 2654435761) >>> 0) % 7; if (h < 3) continue; }
      g.fillRect(x, b.y, 1, 1);
    }
  }
}
function drawPlay() {
  if (ship.alive && ship.hyperT > 18) return; /* hyperspace: whole playfield blank (measured) */
  drawStars(); drawTerrain();
  // humanoids
  for (const h of humans) { const x = rel(h.x); if (x > -4 && x < W + 2) drawSpr(SPR.human, x, h.y - 7); }
  // mines & shots
  for (const m of mines) { const x = rel(m.x); if (x > -3 && x < W) { g.fillStyle = (frame >> 2) & 1 ? "#ffffff" : "#ff30ff"; g.fillRect(x | 0, m.y | 0, 2, 2); } }
  for (const s of shots) { const x = rel(s.x); g.fillStyle = (frame >> 1) & 1 ? "#ffffff" : "#ffff20"; g.fillRect(x | 0, s.y | 0, 2, 2); }
  // enemies
  for (const e of enemies) {
    const x = rel(e.x), s = SIZES[e.type]; if (x < -s.w - 30 || x > W + 30) continue;
    if (e.mat > 0) { // materialize: pixels converge onto the sprite
      const k = e.mat / 40;
      s.rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === ".") return; g.fillStyle = PAL[ch]; g.fillRect(Math.round(x + i + (i - s.w / 2) * k * 3), Math.round(e.y + j + (j - s.h / 2) * k * 4), 1, 1); }));
      continue;
    }
    if (e.type === "pod" || e.type === "bomber") drawSpr(s, x, e.y);
    else drawSpr(s, x, e.y, e.vx >= 0 ? 1 : -1);
  }
  drawBeams();
  // ship
  if (ship.alive && !(ship.hyperT > 0)) {
    drawSpr(SPR.ship, ship.sx, ship.y, ship.dir);
    if (input().thrust) { // flickering exhaust flame
      const fx = ship.dir > 0 ? ship.sx - 2 : ship.sx + 17, L = 2 + ((frame >> 1) & 3);
      for (let i = 0; i < L; i++) { g.fillStyle = ["#ffffff", "#ffff20", "#ff9000", "#ff2020"][i] || "#ff2020"; g.fillRect(fx - ship.dir * i * 2, ship.y + 2 + ((frame + i) & 1), 2, 1); }
    }
  } else if (ship.hyperT > 0) { const k = ship.hyperT; g.fillStyle = "#fff"; for (let i = 0; i < 8; i++) g.fillRect(ship.sx + 6 + Math.cos(i) * k, ship.y + 3 + Math.sin(i) * k * 0.6, 1, 1); }
  for (const p of parts) { const x = rel(p.x); g.fillStyle = p.t < 12 && (p.t & 2) ? "#000" : p.c; g.fillRect(x | 0, p.y | 0, p.w, p.ring ? 2 : 1); }
  for (const p of pops) text(p.txt, rel(p.x), p.y, "#ffffff", 1, "center");
  if (!ship.alive && deadT < 40 && lives <= 1) text("GAME OVER", W / 2, 110, "#20ff20", 1, "center");
}
function drawBonus() {
  g.fillStyle = "#000"; g.fillRect(SC_X0 + 2, 1, SC_X1 - SC_X0 - 2, 32); /* scanner blank during tally (measured) */
  if (modeT > 132 + humans.length * 4) return; /* measured: text ~2.2 s, then ~0.4 s blank */
  const col = TALLY_COLS[tallyCol]; /* colour differs per tally, not per wave (df_ref3/4) */
  textW("ATTACK WAVE " + wave, 148, 73, col); textW("COMPLETED", 148, 89, col);
  textW("BONUS X " + Math.min(5, wave) * 100, 148, 137, col);
  const x0 = Math.round(148 - (humans.length * 8 - 2) / 2); /* icons y 153, 8 px pitch (measured) */
  for (let i = 0; i < bonusShown; i++) drawSpr(SPR.human, x0 + i * 8, 153);
}
function bigTitle(y) {
  const s = "DEFENDER", sc = 4, adv = 6 * sc, x0 = Math.round(W / 2 - (s.length * adv) / 2);
  for (let d = 4; d >= 1; d--) text(s, x0 + d, y + d, d > 2 ? "#a00000" : "#ff2020", sc);
  text(s, x0, y, "#ffff20", sc);
}
function drawAttract() {
  const page = ((modeT / 420) | 0) % 3;
  if (page === 0) {
    text("WILLIAMS ELECTRONICS INC.", W / 2, 40, "#ffffff", 1, "center");
    text("PRESENTS", W / 2, 54, "#ffffff", 1, "center");
    bigTitle(86);
    text("WEB RECREATION - WTP ARCADE", W / 2, 140, "#8080ff", 1, "center");
    text("HIGH SCORE  " + high, W / 2, 166, "#ff30ff", 1, "center");
  } else if (page === 1) {
    bigTitle(14);
    text("HALL OF FAME", W / 2, 54, "#ff30ff", 1, "center");
    text("TODAYS GREATEST", W / 2, 72, "#ff30ff", 1, "center"); g.fillStyle = "#ff30ff"; g.fillRect(W / 2 - 45, 80, 90, 1);
    table.forEach(([n, s], i) => { text((i + 1) + " " + n, 90, 88 + i * 12, "#ff30ff"); text(String(s), 200, 88 + i * 12, "#ff30ff", 1, "right"); });
  } else {
    drawHUD(); drawTerrain();
    text("SCANNER", W / 2, 38, "#ffff20", 1, "center");
    const L = [["lander", "LANDER", 150], ["mutant", "MUTANT", 150], ["baiter", "BAITER", 200], ["bomber", "BOMBER", 250], ["pod", "POD", 1000], ["swarmer", "SWARMER", 150]];
    L.forEach(([k, n, p], i) => { const x = 50 + (i % 3) * 96, y = 62 + ((i / 3) | 0) * 50; drawSpr(SIZES[k], x - SIZES[k].w / 2, y); text(n, x, y + 12, "#ffff20", 1, "center"); text(String(p), x, y + 22, "#ffff20", 1, "center"); });
  }
  if (credits > 0) text("CREDITS: " + credits, W / 2, 196, "#ffff20", 1, "center");
  if ((frame >> 5) & 1) text(credits ? (touchMode ? "TAP TO START" : "PRESS ENTER OR 1 TO START") : (touchMode ? "TAP TO INSERT COIN" : "PRESS 5 TO INSERT COIN"), W / 2, 212, "#ffffff", 1, "center");
}
function drawEntry() {
  text("PLAYER ONE", W / 2, 50, "#ffff20", 1, "center");
  text("YOU HAVE QUALIFIED FOR", W / 2, 70, "#ffff20", 1, "center");
  text("THE DEFENDER HALL OF FAME", W / 2, 82, "#ffff20", 1, "center");
  text(touchMode ? "SELECT INITIALS WITH UP/DOWN" : "TYPE OR UP/DOWN TO SELECT", W / 2, 104, "#ff30ff", 1, "center");
  text("PRESS FIRE TO ENTER INITIAL", W / 2, 116, "#ff30ff", 1, "center");
  for (let i = 0; i < 3; i++) { text(ABC[entry.letters[i]], W / 2 - 18 + i * 14, 140, i === entry.i && (frame & 16) ? "#ffffff" : "#ff2020", 2); g.fillStyle = "#ff2020"; g.fillRect(W / 2 - 18 + i * 14, 156, 10, 1); }
  text(String(score), W / 2, 170, "#20ffff", 1, "center");
}
function draw() {
  g.fillStyle = planetFlash > 0 && Math.random() < 0.33 ? FLASHC[(Math.random() * FLASHC.length) | 0] : flashT > 0 && (flashT & 2) ? "#ffffff" : "#000000"; g.fillRect(0, 0, W, H);
  if (mode === "attract") drawAttract();
  else if (mode === "entry") drawEntry();
  else if (mode === "bonus") { drawHUD(); drawBonus(); }
  else { drawHUD(); drawPlay(); if (mode === "over") text("GAME OVER", W / 2, 110, "#20ff20", 1, "center"); }
  if (paused) { g.fillStyle = "#000"; g.fillRect(W / 2 - 30, 96, 60, 15); text("PAUSED", W / 2, 100, "#ffff20", 1, "center"); }
}

/* ---------------- loop ---------------- */
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) { if (!paused) update(); acc -= STEP; }
  draw(); requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------------- input ---------------- */
function coin() { credits = Math.min(credits + 1, 9); SFX.coin(); }
function startPress() { if (mode !== "attract") return; if (!credits) { coin(); return; } credits--; startGame(); }
document.addEventListener("keydown", e => {
  audio();
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (mode === "entry") {
    e.preventDefault();
    if (/^Key[A-Z]$/.test(e.code) && e.code !== "KeyW" && e.code !== "KeyS") { entryType(e.code.slice(3)); return; }
    if (e.code === "Enter" || e.code === "Digit1") { entryNext(); return; }
    /* arrows / W S still scroll letters (handled while held in updateEntry) */
  }
  keys[e.code] = true;
  if (e.code === "Space" || e.code === "ControlLeft" || e.code === "ControlRight") firePending = true;
  if (e.code === "Digit5") coin();
  if (e.code === "Enter" || e.code === "Digit1") startPress();
  if (e.code === "KeyP" && (mode === "play" || mode === "bonus")) { paused = !paused; if (paused) thrustSound(false); }
  if (e.code === "KeyM") toggleMute();
  if (paused) return;
  if (e.code === "ArrowLeft" || e.code === "KeyA") lastHoriz = -1;
  if (e.code === "ArrowRight" || e.code === "KeyD") lastHoriz = 1;
  if (e.code === "KeyB" || e.code === "KeyZ") doBomb();
  if (e.code === "KeyH" || e.code === "KeyX") doHyper();
  if (e.code === "Backquote" && DEBUG_WAVE && mode === "play") { enemies = []; landerQueue = 0; }
});
document.addEventListener("keyup", e => { keys[e.code] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; for (const k in touch) touch[k] = false; });

// touch: every button is held independently (multi-touch); tap the screen to coin/start
let touchMode = false;
const touch = { up: false, down: false, left: false, right: false, fire: false };
const held = new Map();
function setTouch(k, on, btn) {
  btn.classList.toggle("active", on);
  if (k in touch) touch[k] = on;
  if (on && k === "left") lastHoriz = -1; if (on && k === "right") lastHoriz = 1;
  if (on && k === "fire") firePending = mode !== "entry" || (entry && entry.t >= 30);
  if (on) { audio(); if (k === "reverse") doReverse(); if (k === "bomb") doBomb(); if (k === "hyper") doHyper(); if (k === "fire" && mode !== "play" && mode !== "bonus" && mode !== "entry") startPress(); }
}
// arrow pad: each finger maps to 1-2 directions by position (slide between arrows, or press a corner / two arrows for a diagonal)
const dpad = document.getElementById("dpad"), padPtrs = new Map();
function padDirs(e) {
  const r = dpad.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), dead = r.width * 0.12, out = [];
  if (Math.abs(dx) > dead && Math.abs(dx) > Math.abs(dy) * 0.4) out.push(dx < 0 ? "left" : "right");
  if (Math.abs(dy) > dead && Math.abs(dy) > Math.abs(dx) * 0.4) out.push(dy < 0 ? "up" : "down");
  return out;
}
function refreshPad() {
  const on = new Set(); for (const v of padPtrs.values()) v.forEach(d => on.add(d));
  for (const k of ["left", "right", "up", "down"]) { const b = dpad.querySelector(`[data-k="${k}"]`); if (on.has(k) !== touch[k]) setTouch(k, on.has(k), b); }
}
if (dpad) {
  dpad.addEventListener("pointerdown", e => { e.preventDefault(); audio(); try { dpad.setPointerCapture(e.pointerId); } catch (_) {} padPtrs.set(e.pointerId, padDirs(e)); refreshPad(); });
  dpad.addEventListener("pointermove", e => { if (padPtrs.has(e.pointerId)) { padPtrs.set(e.pointerId, padDirs(e)); refreshPad(); } });
  const pu = e => { if (padPtrs.delete(e.pointerId)) refreshPad(); };
  dpad.addEventListener("pointerup", pu); dpad.addEventListener("pointercancel", pu); dpad.addEventListener("lostpointercapture", pu);
}
document.querySelectorAll("#pad-right .tbtn").forEach(b => {
  b.addEventListener("pointerdown", e => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) {} held.set(e.pointerId, b); setTouch(b.dataset.k, true, b); });
  const up = e => { if (held.get(e.pointerId) === b) { held.delete(e.pointerId); if (![...held.values()].includes(b)) setTouch(b.dataset.k, false, b); } };
  b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
});
cv.addEventListener("pointerdown", e => {
  audio();
  if (e.pointerType === "touch" && !touchMode) { touchMode = true; document.body.classList.add("touch"); }
  if (mode === "attract") startPress(); else if (mode === "entry") entryNext();
});
if ("ontouchstart" in window || navigator.maxTouchPoints > 0) { touchMode = true; document.body.classList.add("touch"); }
["touchmove", "gesturestart", "gesturechange", "dblclick"].forEach(t => document.addEventListener(t, e => { if (!e.target.closest || !e.target.closest("#topbar")) e.preventDefault(); }, { passive: false }));
document.addEventListener("touchstart", e => { if (!e.target.closest("#topbar")) e.preventDefault(); }, { passive: false });
document.addEventListener("contextmenu", e => e.preventDefault());

const muteBtn = document.getElementById("btn-mute"), pauseBtn = document.getElementById("btn-pause");
function toggleMute() {
  muted = !muted; try { localStorage.setItem("defender_mute_v51", muted ? "1" : "0"); } catch (_) {}
  if (master) master.gain.value = muted ? 0 : 0.32; if (muted) thrustSound(false);
  muteBtn.textContent = muted ? "SOUND OFF" : "SOUND ON";
}
muteBtn.textContent = muted ? "SOUND OFF" : "SOUND ON";
muteBtn.addEventListener("click", e => { e.stopPropagation(); audio(); toggleMute(); muteBtn.blur(); });
pauseBtn.addEventListener("click", e => { e.stopPropagation(); if (mode === "play" || mode === "bonus") { paused = !paused; if (paused) thrustSound(false); } pauseBtn.blur(); });

// test/debug hook (read-only snapshot + helpers used by the automated test)
window.__defender = {
  build: 52,
  audio: () => ({ ctx: AC ? AC.state : "none", muted }),
  bomb: () => doBomb(),
  mutantNear: () => { const e = spawn("mutant", wrap(ship.x + 120), ship.y, false); return true; },
  podNear: () => { spawn("pod", wrap(ship.x + 140), ship.y, false); return true; },
  state: () => ({ entry: entry && { i: entry.i, t: entry.t, letters: entry.letters.map(i => ABC[i]).join("") }, table: table.map(r => r.join(":")), frame, mode, score, lives, bombs, wave, credits, planetAlive, humans: humans.length, enemies: enemies.map(e => e.type), ship: ship && { x: ship.x, y: ship.y, vx: ship.vx, dir: ship.dir, sx: ship.sx, alive: ship.alive, carry: !!ship.carry }, beams: beams.length, paused }),
  placeEnemy: (type, dx, dy) => { const e = spawn(type, wrap(ship.x + dx), ship.y + dy, false); return enemies.length; },
  dropHuman: () => { const h = humans[0]; if (!h) return false; h.x = wrap(ship.x + 8 + ship.vx * 8); h.y = ship.y - 2; h.state = "fall"; h.vy = 0; h.fallFrom = h.y; return true; },
  clearWave: () => { testHold = false; landerQueue = 0; enemies = enemies.filter(e => e.type !== "lander" && e.type !== "mutant"); },
  calm: () => { for (const h of humans) { h.by = null; if (h.state === "carried") { h.state = "fall"; h.fallFrom = HUM_Y; } } enemies = []; shots = []; mines = []; testHold = true; },
  killHumans: () => { humans = []; checkPlanet(); },
  hold: (k, on) => { touch[k] = on; if (on && k === "left") lastHoriz = -1; if (on && k === "right") lastHoriz = 1; },
  debug: () => Object.assign(window.__defender.state(), { pos: enemies.map(e => [e.type, Math.round(e.x), Math.round(e.y)]), hum: humans.map(h => [h.state, Math.round(h.x), Math.round(h.y)]), table: table.map(r => r.join(":")) }),
  setScore: n => { score = n; },
  setLives: n => { lives = n; },
  killShip: () => { if (ship && ship.alive) shipDie(); },
};
})();
