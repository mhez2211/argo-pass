# Sasan / Inside My Head — 30 s motion reel

`sasan-inside-my-head.mp4` — 1080×1920, 30 fps, 918 frames (30.6 s), H.264 + AAC, with the ElevenLabs narration.

Every frame is drawn procedurally with Canvas 2D (`reel.js`) so it's deterministic and editable: shapes, palette
(#080B10 / #F4EFD9 / #2448FF / #EBF500), character rig, typography and timing are all code.

## Re-render

```bash
npm i playwright            # or reuse a global install; Chromium must be available
node render.mjs                                   # full reel → out/sasan-inside-my-head.mp4
node render.mjs --frames 0,66,178 --sheet out/sheet.png --debug   # quick contact sheet (debug draws the circle anchor)
```

Open `index.html?f=500` in a browser to inspect a frame, or `index.html?play` (then click) to preview with audio.

## Scene timing (aligned to the measured phrase gaps in the narration)

| # | Headline | Frames | Seconds |
|---|---|---|---|
| 01 | HELLO / SASAN | 0–65 | 0.00–2.20 |
| 02 | ARTIST? | 66–177 | 2.20–5.93 |
| 03 | PHOTO / GRAPHY | 178–237 | 5.93–7.93 |
| 04 | GRAPHIC / DESIGN | 238–279 | 7.93–9.33 |
| 05 | ARCHITECT | 280–357 | 9.33–11.93 |
| 06 | VISUAL / IZATION | 358–411 | 11.93–13.73 |
| 07 | DIFFERENT TOOLS / SAME URGE | 412–492 | 13.73–16.43 |
| 08 | ESCAPE / REALITY | 493–534 | 16.43–17.83 |
| 09 | BUILD MY / WORLDS | 535–585 | 17.83–19.53 |
| 10 | A LITTLE / MAD? | 586–666 | 19.53–22.23 |
| 11 | MY STUDIO / 2012 | 667–794 | 22.23–26.50 |
| 12 | COME IN. / BE MY GUEST. | 795–917 | 26.50–30.60 |

## How the brief maps to the build

- **Match cuts**: each boundary shares the anchor from the guide. Circle at (0.50W, 0.54H), d≈0.62W, for 01>02>03 and 06>07. Dot at (0.58W, 0.56H) for 03>04. Paper rectangle centred at (0.50W, 0.64H), 0.76W wide, for 04>05. The tipped ellipse (0.66W × 0.22W at 0.48H) for 07>08. Fall pose, velocity and dot at (0.60W, 0.58H) for 08>09. The orbit circle for 09>10. The dot/lamp at (0.62W, 0.40H), d=0.10W, for 10>11. Desk and first circle for 11>12.
- **Paper mechanics**: the sheet is a real 3D plane (`cam3`). The corner flap rotates about a fixed crease. The room folds rigidly about two creases, and the wireframe uses the same topology.
- **Motion**: footstep plants with IK legs (feet stay locked, so they don't slide). The fall accelerates over about 1 s with a continuous counter-clockwise rotation and lagging limbs, and the float eases out with a Hermite curve that keeps the incoming velocity. The lamp swings as a damped pendulum.
- **Type**: the headlines are a separate layer. The font is Anton (an open-licence stand-in for Railroad Gothic ATF Black). Each headline has at most two lines, the whole block is tilted −3.5°, and each scene uses one entrance treatment (slide, pivot or paper mask).
- **Finish**: fixed print grain at about 5%, a vignette, and glow only on the yellow dot and lamp.

Fonts: Anton and Inter (SIL Open Font License), from Google Fonts.
