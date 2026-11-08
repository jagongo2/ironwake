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

Pressure transients, bass, air, fallback material sounds and supporting engine
layers are original deterministic synthesis in `src/sound.js`. No HighFleet
game audio has been extracted or included.
