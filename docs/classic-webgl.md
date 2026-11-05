# 0.11 WebGL migration

## Scope

This branch starts from the optimized 0.11 FPS-toggle release, not the larger
0.12 visual overhaul. The world dimensions, physics, collision, destruction,
particle budgets, artwork, camera and resize rules stay unchanged. The default
output is 640×360; the original aspect-dependent sizing still applies. No Retina
multiplier, bloom, color grading, grain shader, or denser ship surface is added.

PixiJS 8.22.0 presents pooled sprites and text using WebGL. The existing CPU fluid,
smoke, jet and lighting buffers remain Canvas-generated textures. Revision flags
invalidate those textures on every actual update, including resets and damage.
The original ordered background dots are cached as two small transparent strips.
Axis-aligned pixel rectangles avoid matrix decomposition. Lines retain their
original center placement. Existing scene ordering, alpha, screen/add blending,
scanlines and CSS cockpit effects remain.

The local bundle is about 556 KiB before HTTP compression, in addition to the
original page and fonts. WebGL requires GPU texture memory and driver work;
lower CPU time does not imply lower power usage on every laptop. Startup failure
uses a fresh Canvas element and the original Canvas drawing path. The explicit
`?renderer=canvas` option provides a same-code comparison.

## Verification

- Existing CPU tests compare original flight, collision, landing, damage,
  combat and fluid/effect buffers against the historical baseline.
- Chrome runs both backends at 640×360 with the same seeded inputs. The captured
  simulation snapshots match for background, flight, sustained fire and explosion.
- Pixels differing by more than 16/255 in any color channel are 0.14% for the
  background, 0.70% for flight, 0.85% for combat and 0.78% for explosion. Average
  channel error ranges from 0.054 to 0.663/255. Text, transformed edges and circle
  rasterization differ slightly between the two renderers; pixels are not claimed
  to be identical. The test fails above a 2% large-difference fraction.
- Browser checks also cover live firing, FPS settings, square/wide resizing and
  the Canvas path.

## Performance sample

Same PC, headless Chrome using its normal GPU path, 1600×900 window, 640×360
output, fixed initial seed, camera shake disabled, two seconds warmup and eight
seconds sampled per scene. Stress comprises four groups of ten explosions,
then four seconds of effect decay. Both backends use the same simulation source.

| Scene | Canvas FPS | WebGL FPS | Canvas CPU ms/frame | WebGL CPU ms/frame |
| --- | ---: | ---: | ---: | ---: |
| Flight | 120.0 | 119.9 | 2.24 | 1.66 |
| Sustained fire | 117.4 | 118.0 | 4.60 | 4.27 |
| Explosions and decay | 102.1 | 99.3 | 6.05 | 6.52 |

The 95th percentile frame interval was 8.5ms in flight and fire, 16.7ms in stress
for both. These are short samples, not guarantees for other hardware or long
sessions. Small FPS differences can vary between runs. CPU timing includes game
updates, effect generation and render submission, but excludes asynchronous GPU
execution. It is not operating-system CPU utilization. WebGL helps the first two
scenes but has no demonstrated stress-scene advantage here, so this branch is a
separate preview rather than an automatic production replacement.
