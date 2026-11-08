# Mechanical sound pass — 2026-11-08

The 0.11 WebGL game's simulation and visuals are unchanged. The original common
noise/sine `boom()` has been split into mechanical events, reusable sound layers,
and continuous engine/fire beds in `src/sound.js`.

| Event | Layers and response |
| --- | --- |
| 57mm | short muzzle transient, metal action, brief gas release |
| 180mm | slower low-frequency body, pressure, heavy plate action, longer tail |
| Explosion | broadband body, low pressure, debris/metal and decay, scaled by size |
| Hull impact | recorded metal/plate plus short resonances; no automatic explosion sound |
| Engine | actual diesel recording, low rumble, mechanical harmonics and air; throttle and surviving engine ratio affect gain/pitch |
| Burning fuel | quiet crackle/air bed tied to the player's active fuel fire |
| RCS | brief gas hiss on the existing impulse event |
| Gear | servo/metal action and light mechanical latches |
| Hangar | motor movement, shutter stop, switches, gate, lever latch and return |
| Menus/settings | quiet physical click and a little air/static; no hover beeps |

The new sources are selected CC0 material samples and a diesel field recording,
not recordings made by this project and not original HighFleet sounds.
See [asset provenance](../assets/audio/CREDITS.md). The ten encoded sounds are
about 120 KiB total; decoded buffers and generated beds add a few MiB of memory.
The low-frequency/pressure and fallback layers are synthesized rather than
claimed to be recorded gunfire. Small sample-rate variations avoid exact repeats.

## Runtime and synchronization

- AudioContext starts/resumes only after an existing user action. Sample fetch
  and decode are asynchronous after unlock; the fallback layers work immediately.
- All buffers are cached. No file fetch/decode, live random-noise generation, or
  PCM image-like processing occurs inside a game frame.
- The sound PRNG is private, so enabling audio does not consume physics randomness.
- At most 28 tracked event voices, with priorities and short fades on retirement.
  Nearby repeated impacts/explosions are coalesced. Continuous beds use five loops.
- Game positions drive stereo pan and distance attenuation; UI sounds stay centered.
- Engine parameters update at most 30Hz. Master high-pass, compression and a bounded
  soft-saturation curve control low-frequency build-up and simultaneous events.
- The volume slider and M/button mute remain. Muting fades and suspends the audio
  context; a hidden tab suspends it too. Enabling/returning resumes it.
- The existing lever contact event still submits its pose before calling the
  sound and panel recoil. No timeout shifts the sound away from contact. The
  physical speaker/display latency depends on the browser and hardware.
- Some browsers cannot decode Vorbis or may fail a request. Material/engine
  synthesized fallbacks preserve gameplay without an unhandled rejection.

## Validation

`npm test` keeps the previous deterministic flight, collision, landing, combat,
fluid, RCS and lever checks. `npm run test:audio` uses real browser AudioContexts
and OfflineAudioContext to verify sample decode, private randomness, distinct
weapon/explosion tails, stereo placement, 28-voice pressure, finite PCM bounded
below 0.971, and fallback sound. Live controls cover light/heavy fire, RCS, gear,
mute/resume, and volume. The hangar and rendering suites cover their existing
flows. Numerical checks do not replace listening on the target headphones or
speakers; tone and levels can be tuned from player feedback.
