# DEFENDER — Williams 1981 Style

Browser recreation of **Williams Electronics’ Defender** (arcade, 1981), companion to:

- [PAC-MAN](https://bamtec70.github.io/pacman-game/)
- [MS. PAC-MAN](https://bamtec70.github.io/ms-pacman-game/)
- [DIG DUG](https://bamtec70.github.io/dig-dug-game/)

## Play

**Live:** https://bamtec70.github.io/defender-game/

Or open `index.html` locally:

```powershell
start index.html
```

## Mission

Fly a long, wrapping planet. **Protect humanoids** from **Landers**. If a Lander reaches the top of the sky with a captive, it becomes a **Mutant**. If every human is lost, the **planet is destroyed** and the wave becomes a mutant assault in space.

## Williams-style systems

- **Thrust / reverse flight** with inertia (not tank-style movement)
- **Long horizontal laser** beams, rapid fire
- **Smart bombs** clear all enemies *on screen*
- **Hyperspace** (risky random teleport)
- **Scanner** radar across the top of the playfield
- **Catch falling humans**, then **fly low to set them down** (+500 catch, +500 land)
- Enemy cast: Landers, Mutants, Bombers (mines), Pods → Swarmers, Baiters
- Staggered lander materialization, baiters if you stall
- Extra ship + bomb every **10,000** points

## Controls

### Desktop

| Input | Action |
|-------|--------|
| **↑ / W** | Climb |
| **↓ / S** | Dive |
| **← / A** | Face left (reverse) |
| **→ / D** | Face right |
| **Shift / Z** | Thrust |
| **Space** (hold) | Fire laser |
| **B** | Smart bomb |
| **H** | Hyperspace |
| **P / Esc** | Pause |
| **M** | Mute |

### Phone / touch

**▲▼** climb/dive · **THR** thrust · **REV / FWD** face · **FIRE** · **BOMB** · **HYP** · pause · mute

## Scoring (arcade-style)

| Target | Points |
|--------|--------|
| Lander | 150 |
| Mutant | 150 |
| Bomber | 250 |
| Pod | 1000 |
| Swarmer | 150 |
| Baiter | 200 |
| Catch falling human | 500 |
| Land human safely | 500 |

## Files

- `index.html` — shell  
- `style.css` — CRT green framing + touch UI  
- `game.js` — full engine  

Fan recreation for personal / educational use. Not affiliated with Williams or its successors.
