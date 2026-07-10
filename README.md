# DEFENDER — 1981 Arcade Classic

A browser recreation of Williams Electronics’ **Defender** (1981), companion to:

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

Pilot your ship over a hostile planet. **Protect the humanoids** on the surface from alien **Landers** that try to abduct them. If a Lander escapes into space with a human, it becomes a deadly **Mutant**.

## Controls

### Desktop

| Key | Action |
|-----|--------|
| **↑ / W** | Climb |
| **↓ / S** | Dive |
| **← / A** or **REV** | Face left / reverse |
| **→ / D** | Face right |
| **Shift / Z** | Thrust |
| **Space** | Fire laser |
| **B** | Smart bomb |
| **H** | Hyperspace (risky!) |
| **P / Esc** | Pause |
| **M** | Mute |

### Phone / touch

On-screen **THR**, **REV**, **▲▼**, **FIRE**, **BOMB**, **HYP**, pause, mute.

## Features

- Wrap-around planet with mountain terrain  
- **Scanner** minimap (top of screen)  
- Landers, Mutants, Bombers, Pods → Swarmers, Baiters  
- Humanoid rescue (shoot captors; catch falling humans)  
- Smart bombs & hyperspace  
- Waves, lives, score, high score  
- Williams-style green vector look  
- Arcade-inspired **Web Audio** synthesis  
- Mobile controls  

## Scoring (approx. arcade)

| Target | Points |
|--------|--------|
| Lander | 150 |
| Mutant | 200 |
| Bomber | 250 |
| Pod | 1000 |
| Swarmer | 150 |
| Baiter | 200 |
| Rescue human | 500 |

## Files

- `index.html` — shell  
- `style.css` — CRT green framing + touch UI  
- `game.js` — full engine  
