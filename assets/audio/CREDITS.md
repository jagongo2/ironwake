# Audio sources

These sound assets are CC0. They are locally hosted; no third-party audio requests
are made by the game. Original license notices are retained beside the samples.

## Kenney — Impact Sounds 1.0 and Interface Sounds 1.0

- Creator: Kenney / Kenney Vleugels.
- Source: https://kenney.nl/assets/impact-sounds
- Source: https://kenney.nl/assets/interface-sounds
- License: CC0, https://creativecommons.org/publicdomain/zero/1.0/
- Original files, unchanged: `kenney/impactMetal_heavy_000.ogg`,
  `impactMetal_heavy_001.ogg`, `impactPlate_heavy_000.ogg`,
  `impactPlate_heavy_001.ogg`, `impactMetal_light_000.ogg`,
  `impactMetal_light_001.ogg`, `switch_003.ogg`, `switch_004.ogg`, `scratch_004.ogg`.
- Runtime processing: mono conversion, level matching, small edge fades, layering
  and modest playback-rate variation. Downloaded from the creator's asset pages.

## Big diesel engine.wav — vumseplutten1709

- Creator: vumseplutten1709.
- Source: https://freesound.org/people/vumseplutten1709/sounds/202720/
- License: CC0, https://creativecommons.org/publicdomain/zero/1.0/
- Source is the creator's publicly playable high-quality preview of their
  recording of an old diesel engine driving a water pump.
- Shipped derivative: `field/diesel-loop.ogg`. An eight-second segment starting
  two seconds into the source, mono 32kHz Vorbis, high-pass 28Hz / low-pass 2800Hz.
  At decode time the last 200ms crossfades into the beginning for looping.
- Conversion: `ffmpeg -ss 2 -t 8 -i source.mp3 -af highpass=f=28,lowpass=f=2800
  -ac 1 -ar 32000 -c:a libvorbis -q:a 3 diesel-loop.ogg`.

## Combat recordings - added 2026-11-09

The following three recordings are CC0 1.0. The creator pages were checked before
use. The public high-quality MP3 previews are the input material, not the
login-only original downloads. They are edited and converted into local mono
32kHz Vorbis files (four files, 71,224 bytes total).

| Creator / source | Shipped derivative | Edit |
| --- | --- | --- |
| [michorvath - AR15 rifle shot](https://freesound.org/people/michorvath/sounds/427596/) | `combat/cannon-light.ogg` | One report at 0.070-0.500s, pitch 0.90, low-pass 10500Hz and faded. This is a stylized cannon layer derived from a rifle, not a recording of a 57mm gun. |
| [qubodup - Cannon Shot](https://freesound.org/people/qubodup/sounds/187767/) | `combat/cannon-heavy.ogg` | First report at 0.150-2.150s, pitch 0.90, low-pass 9500Hz and faded. The creator identifies a US government video as the public-domain source; the gun caliber is not established here. |
| [sidohzen - Explosion with debris - authentic. 4kg TNT](https://freesound.org/people/sidohzen/sounds/165808/) | `combat/blast-impact.ogg`, `combat/blast-wreck.ogg` | Demolition recording, trimmed to 2.165-3.120s / 2.165-6.165s, pitch 1.00 / 0.94, low-pass 9000 / 7500Hz. The lead-in before the explosion is excluded. |

License: https://creativecommons.org/publicdomain/zero/1.0/ . Exact public preview
URLs, input SHA-256 hashes and processing parameters are in
[`combat/sources.json`](combat/sources.json). Rebuild with ffmpeg installed:
`node scripts/prepare-combat-audio.cjs --download`. Cached input files stay in
the ignored `artifacts/audio-sources/` directory and are not deployed. Each edit
also has a 3500Hz bell cut of 2.5dB and a modest 90Hz boost. Runtime steel-punch and
armor-strike buffers are short envelope-shaped derivatives of the existing
Kenney `impactPlate_heavy_000.ogg`; armor mixes in 20% sample-held/11-bit material.

Pressure transients, bass, air, fallback material sounds and supporting engine
layers are original deterministic synthesis in `src/sound.js`. No HighFleet
game audio or reference-video audio is included in the shipped game. Short public
reference-playback captures used for local analysis remain in ignored artifacts.
