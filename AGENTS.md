# Project instructions

## Project overview

This is a small, dependency-free browser runner made for a Secret Santa gift. It is a Portuguese Christmas-themed game featuring an Audi A3, FC Porto collectibles, rival football shirts, and a gym power-up.

## Project layout

- `index.html` contains the page structure, game HUD, and start/end panels.
- `styles.css` contains the responsive layout and interface styling.
- `game.js` contains the canvas renderer, game loop, scoring, collisions, and input handling.
- `assets/car/audi-a3-8v-rear.svg` is the player car art.
- `assets/collectibles/fcp.svg` is the FC Porto collectible.
- `assets/obstacles/slb.svg` and `assets/obstacles/scp.svg` are rival obstacles.
- `assets/powerup/halter.svg` is the gym power-up.

There is no package manager, build step, or test suite. Open `index.html` in a browser to play; keep asset paths relative so this continues to work as a static page.

## Game behavior

- The canvas uses a fixed 450 × 800 coordinate space and is scaled by CSS.
- Left/right controls change lanes; up jumps; down slides. Keyboard arrows/WASD and pointer swipes are supported.
- FC Porto shirts award points and a collectible count. Benfica and Sporting shirts end the run unless the five-second dumbbell protection is active. Collecting the dumbbell activates that protection.
- Start/replay buttons should each trigger one action. Avoid adding overlapping `click` and `pointerup` handlers to the same button.
- The intended copy and interface language is Portuguese. Preserve the personal Christmas message unless asked to change it.

## Change guidance

- Keep the game lightweight and dependency-free; do not introduce a framework or build tool for routine changes.
- Use the existing SVG assets for in-game artwork. Do not reintroduce Excel or Oasis/guitar items: no matching assets exist and those mechanics were intentionally removed.
- If adding an asset, place it in the matching `assets/` subfolder and load it from `game.js` using a relative path.
- When changing the player car rendering, preserve the SVG's intended rear-facing shape and check that it remains legible at canvas scale.
- For gameplay or visual changes, verify in a browser on a narrow mobile-sized viewport and a desktop-sized viewport when possible. There are no automated tests configured.
