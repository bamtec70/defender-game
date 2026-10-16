# DEFENDER — Williams 1981 web recreation

**Live:** https://bamtec70.github.io/defender-game/ · part of the [WTP Arcade](https://wethepeoplepress.com/games/)

Native 292×240 playfield (cabinet resolution), pixel-scaled, with the scanner at top centre, score / reserve ships / smart bombs to its left, the brown mountain line, twinkling starfield and multicoloured fading laser. Every sprite is hand-authored pixel data in `game.js` and every sound is synthesized with the Web Audio API. No ROM data, samples or extracted images are included.

## Controls
| Input | Action |
|---|---|
| ↑ ↓ / W S | Up / down |
| → / D | Thrust (in the direction the ship faces) |
| ← / A / Shift | Reverse |
| Space / Ctrl | Fire |
| B / Z | Smart bomb |
| H / X | Hyperspace (risky) |
| 5 · Enter / 1 | Coin · Start |
| P / M | Pause / sound |
| Touch | Up/down rocker (left), THRUST, REVERSE, FIRE, BOMB, HYPER (right), all multi-touch; tap the screen to coin/start |

## Game
Lander 150 · Mutant 150 · Baiter 200 · Bomber 250 · Pod 1000 · Swarmer 150. Catch a falling humanoid 500, set it down 500, safe fall 250. Extra ship and smart bomb every 10,000.
Waves bring 15/20 Landers in batches of 5 plus Bombers and Pods (which burst into Swarmers); Baiters appear if you take too long. A Lander that carries a humanoid to the top becomes a Mutant. Lose every humanoid and the planet explodes: the wave becomes all Mutants in space with no terrain until the planet is restored every 5th wave. Wave bonus: 100 × wave (max 500) per surviving humanoid. High-score table with initials (`defender_table_v1`), best score kept in `defender_hi_v3`.

Debug: `?wave=N` starts directly at wave N (`&planet=0` starts with the planet destroyed); with it, the backquote key skips a wave.

Fan recreation for personal / educational use. Not affiliated with Williams or its successors.

## Second pass (tuned against a longer MAME reference)
Ship: thrust 300 px/s² from rest, top speed 5 px/frame, coasting slows over about 1.7 s. Reverse slides the ship at a constant 4 px/frame between x≈47 and x≈214, and at speed it creeps up to 40 px further forward. Landers drift at 0.67 px/frame and descend at 0.43 px/frame. Respawn comes about 4 s after a death. The laser is a 1 px line in one colour per frame: the head moves 8 px/frame, the tail 6 px/frame, and it breaks up behind a solid front. Scanner: brackets at x 140–155, a white + for the ship, grey humanoids, green Landers with a yellow top. Sounds were re-tuned from band-energy and peak analysis of the reference audio.
