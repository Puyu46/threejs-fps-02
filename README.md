# DUSTLINE — Ember Yard

A round-based tactical FPS in three.js (0.187.0, vendored), built for the
make.fun `threejs-fps-02` bounty. No build step, no network requests: static
files under `game/`, ES modules in a desktop browser.

## The game

Dusk in an industrial yard. You are the Vanguard attacker; four Ember crew
bots defend two bomb sites, **A** (north-east) and **B** (south-west). Three
lanes run from your spawn: **A Long** along the east wall, **Mid** through the
warehouse doors, and **B Short** along the west wall.

- **Rounds** — first to 5 rounds takes the match. A round is won by
  eliminating the other squad, by detonating the planted charge, or (for the
  defenders) by holding until the clock runs out.
- **Objective** — hold **E** inside a site to plant the charge (4 s). Once
  planted, the 35 s fuse runs and the bots rush in to defuse (5 s channel).
- **Economy** — $800 to start; $300 a kill, $300 a plant, $3,250 a round won,
  $1,900 a round lost. Press **B** in the buy phase to spend it.
- **Arsenal** — VK-7 Carbine ($2,700), Hornet SMG ($1,500), Breacher-12
  shotgun ($1,100), P9 Sidearm (free), Spark Frag grenades ($300, max 2),
  and a Plate Vest ($650). Keys **1 / 2 / 3** (or the mouse wheel) switch
  primary / pistol / frag.
- **Gunplay** — hitscan with head/torso/leg hitboxes (headshots deal ~3x),
  recoil and spread that punish firing on the move, so stopping to aim pays.
  Muzzle flash, tracers, impact sparks, and a frag grenade with an arcing
  throw and area damage.
- **Movement** — acceleration, friction, crouch (**Ctrl**), jump (**Space**),
  and AABB collision against the map, so cover and corners matter.
- **Bots** — Rook, Vex, Mara and Jinx patrol routes, hold positions, react to
  what they see (real line-of-sight raycasts) and hear (gunfire, explosions),
  strafe and fire in bursts with a reaction delay, and run to defuse.
- **HUD** — health + armour, ammunition, money, round timer, score, kill
  feed, plant/defuse progress, and a dynamic crosshair that widens with
  spread.

## Run it

```sh
node serve.ts            # serves game/ on http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome, click to play. All sound is
synthesised with WebAudio — no audio files.

## Screenshots

`screenshots/` holds four real renders of the game, taken in headless Chrome
with `?shot=start|play|plant|end&seed=1` (see `shots.json`):

1. `1-start.jpg` — buy phase at spawn, buy menu open
2. `2-play.jpg` — mid-fight in Mid lane, one bot down
3. `3-plant.jpg` — charge planted at site A, bots moving to defuse
4. `4-end.jpg` — round won

## Hand in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the kit's `vendor/makefun-threejs.ts`.

## Layout

- `game/index.html` — page, import map, HUD DOM and CSS
- `game/src/main.js` — boot, fixed-step loop, shot mode
- `game/src/state.js` — the one game-state object
- `game/src/world.js` — the Ember Yard map, lights and sites
- `game/src/player.js` — movement and collision
- `game/src/weapons.js` — weapon catalogue, view models, firing cycle
- `game/src/bots.js` — bot AI (patrol / hold / investigate / engage / defuse)
- `game/src/combat.js` — hitscan, tracers, particles, grenades
- `game/src/rounds.js` — round flow, plant, economy, buy menu data
- `game/src/hud.js` — DOM HUD
- `game/src/input.js` — keyboard, mouse, pointer lock
- `game/src/audio.js` — synthesised WebAudio sounds
- `game/src/physics.js` — shared AABB movement
- `game/src/palette.js` — the dusk look plan
- `game/src/rng.js` — seeded random

## License

MIT © 2026 Puyu46. three.js 0.187.0 under `game/vendor/three/` is MIT © the
three.js authors; see its LICENSE there.
