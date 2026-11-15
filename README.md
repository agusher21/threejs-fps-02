# Pasar Senja — Dusk Market Tactical FPS

A round-based 5v5 tactical FPS for the make.fun threejs-fps-02 competition,
set in a rain-slicked Indonesian night market at dusk. Attackers ("Perusuh")
plant a firework charge ("Kembang Api") at Site A (Warung Kopi) or Site B
(Los Ikan); defenders ("Penjaga Pasar") defuse it. First to 5 round wins
takes the match.

## How a round plays

1. **Buy phase (15 s)** — spend Rupiah earned from kills and round results
   on weapons (Paku pistol, Siul SMG, AR-21 Garuda rifle, Elang sniper),
   a frag grenade, armor, or a defuse kit. Keys 1–7 or click.
2. **Round (90 s)** — plant at a site (hold E, 3.5 s) or eliminate the enemy
   team. A planted charge detonates after 35 s unless defused (5 s, 2.5 s
   with a kit). Sides alternate every round.
3. **Round end** — economy pays out (win +Rp1.000, loss +Rp500, kill
   +Rp300, plant +Rp300) and the next buy phase starts. If you die you
   spectate a teammate bot (Q cycles).

## The twist: sound radar

Every gunshot briefly pings the shooter's position on the minimap — firing
gives you away. Bots hear shots too, and call out contacts in the killfeed
("Budi: kontak di Site A!"). Holding an angle and stopping to aim pays;
spraying on the move does not.

## Controls

WASD move · mouse look · click fire · right-click aim down sights ·
R reload · G throw grenade · E plant / defuse · C crouch · Shift walk ·
1–4 switch owned weapon · Q cycle spectate · Enter start round.

## Tech

- three.js 0.187.0 (vendored, import map), static ES modules, no build step,
  zero network requests, WebAudio-synthesized sounds.
- Fixed 60 Hz simulation (`game/src/sim.js`) separate from rendering;
  modules with one job each: `world` (map), `bots` (AI), `weapons`,
  `player`, `hud`, `input`, `audio`, `palette`.
- `?shot=menu|buy|play|plant&seed=N` renders a deterministic capture frame
  and sets `window.__shotReady`; `?autoplay=1` plays a bot-driven round
  unattended and writes state into `#debug` for headless verification.

## Run

```sh
node serve.ts        # http://localhost:8080
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts   # build dossier
```

MIT License.
