# Preflight hangar assets

The active game remains `0.11.1-webgl` on `work/v0.11-webgl`.
Campaign now enters a preflight hangar. Flight Range still starts directly.
Three independent system checks release a downward-drag launch lever. Enter,
Space, or Arrow Down on the focused lever also launches. Escape returns to the
previous menu. Checks reset on reentry. Combat is not initialized until launch;
its renderer stops while the hangar is open. Covered title/HUD animations are
paused and hidden until the shutter opens, avoiding background compositing work.

The launch lever now uses actual 3D cylinder/sphere/box meshes in a small,
transparent WebGL canvas (`src/lever-view.js`). The T-grip, chrome shaft and
hinge rotate together about a physical pivot, with perspective, lighting and a
projected moving shadow. A Canvas renderer projects the same mesh if WebGL is
unavailable. The camera remains fixed; the handle grows as it approaches it.

`src/lever-motion.js` provides a damped spring, cam resistance from 60–82% input,
and an 86% latch threshold. A short pull springs home. A complete pull latches
against the end stop before combat starts, with distinct gate and latch sounds.
Only the projected grip is draggable. Idle/hidden levers schedule no animation
frames, and reduced motion snaps the mechanism directly to its target.

The lever camera is now strictly frontal (zero side yaw), and its resting shaft
is vertical. A deterministic 512px packed material texture supplies corrosion
patches, brushed strokes, pits and scratches. The shader uses dark iron, ochre
rust and worn oxblood paint, stepped high-contrast lighting and restrained
highlights. Material coordinates move with the actual mesh rather than sliding
over it. No new image assets or per-frame texture generation are needed.

Two soft projected-shadow passes fall on the console, with a separate dark
hinge-contact layer. Stencil coverage prevents repeated overlapping triangles
from over-darkening each layer. The Canvas fallback projects the same geometry
with a simpler painted material and moving shadow.

Mechanical contact submits the contact pose before one shared event triggers
the short panel recoil and Web Audio strike. The latch combines a low thump,
filtered impact and three decaying metal resonances; the gate and home stop are
quieter. Panel recoil is disabled by reduced motion/screen-shake preferences.
This aligns the software events; display/audio-device latency prevents a
universal sub-millisecond output guarantee.

Presentation uses photographic generated material plates, a shutter driven by
Web Animations, shared Web Audio mechanical sounds, and a local CRT display.
CRT grain is a deterministic 96px texture created once. Dither, scanlines,
vignette, text bloom and curved-glass perspective are local CSS effects. There
is no full-screen backdrop blur or per-frame noise generation. Reduced motion
shortens the transitions and removes the shutter rebound and moving CRT sweep.

## Sources

Generated with the built-in ImageGen tool on 2026-11-07. These are synthetic
photographic-style assets, not third-party photographs. No existing game image
was edited. Transparent alpha on the lever PNG is preserved.

- `assets/hangar/shutter-v1.png`: 1536 × 1024 steel shutter.
- `assets/hangar/console-v1.png`: 1672 × 941 maintenance console.
- `assets/hangar/lever-v1.png`: 1024 × 1536 isolated lever, RGBA. Historical
  source retained in Git; no longer loaded or deployed after the 3D replacement.

## Original prompts

### Shutter

Use case: photorealistic-natural. Production game UI texture asset, landscape 3:2, high resolution. Orthographic straight-on close-up photograph of a closed heavy military hangar rolling steel shutter, fills entire image edge to edge. Broad horizontal overlapping dark charcoal gunmetal slats, worn brushed steel, oily seams, scratches, restrained rust, worn yellow-black hazard stripe across the very bottom edge, cold workshop lighting from upper left, tactile realistic material. Flat frontal camera, perfectly straight horizontal slats, no perspective convergence. No scene, no room, no humans, no logos, no readable text, no UI, no frames outside shutter. Photographic physical surface, not illustration. This image will slide vertically as a single heavy shutter in a videogame.

### Console

Use case: photorealistic-natural. High resolution landscape 16:9 production background plate for a skeuomorphic military airship maintenance console UI. Straight-on photograph of a battered dark olive and gunmetal industrial control desk, filling image. Upper right two thirds contains one large recessed blank very dark black-green CRT glass display with thick worn metal bezel, glass slightly convex. Left third and lower band are dark empty brushed metal instrument mounting plates with recessed screw heads, scratches and restrained grease. Physical steel seams and realistic directional overhead workshop lighting, a thin amber practical lamp above, cinematic analog machinery, subdued black olive gray with tiny amber highlights. Preserve ample empty space on left for interactive controls and labels, blank CRT is entirely dark and empty for code-drawn interface overlay. No humans, no readable text, no existing graphics or HUD, no outer room, no modern flat interface, no lever on this background. Sharp high resolution physical photographic metal and glass.

### Lever

Use case: product-mockup. High resolution production game sprite, portrait aspect. A single physical industrial aircraft launch lever HANDLE ASSEMBLY, fully isolated with genuine transparent background. Front-facing orthographic view. A weathered dark steel rectangular mounting bracket at lower center with four screws, a long vertical polished steel lever shaft pointing straight UP from a pivot at bottom center, chunky worn oxblood red bakelite horizontal T-grip at the top. Photorealistic scratched steel, tactile hard rubber grip, overhead warm workshop highlights and deep shadows. Entire assembly inside image, no cast shadow beyond object, no labels, no text, no wires, no surrounding console or scenery. Must have transparent background. Vertical up position will be mechanically rotated in game around bottom mounting pivot.

## Verification

- `npm test`: unchanged simulation and effect buffers.
- `npm run test:render`: classic art, identical WebGL/Canvas simulation, FPS setting and resizing.
- `npm run test:preflight`: system interlocks, partial/full lever pull, cancellation, reentry, keyboard launch, motion preference, portrait layout, and return to combat.
