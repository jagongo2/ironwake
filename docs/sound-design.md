# Mechanical and combat sound - 2026-11-09

The 0.11 WebGL game's simulation and visuals are unchanged. The original common
noise/sine `boom()` has been split into mechanical events, reusable sound layers,
and continuous engine/fire beds in `src/sound.js`.

| Event | Layers and response |
| --- | --- |
| 57mm | edited rifle recording, short pressure layer, delayed metal action and gas release |
| 180mm | edited cannon recording, slower pressure body, plate action and longer recorded tail |
| Explosion | trimmed demolition recording and pressure; impact, fuel and wreck events have different rates, gas and debris layers |
| Hull impact | recorded metal/plate plus short resonances; no automatic explosion sound |
| Engine | actual diesel recording, low rumble, mechanical harmonics and pulsed air; exhaust responds faster and more strongly to thrust than rotor speed, and damage reduces output |
| Burning fuel | quiet crackle/air bed tied to the player's active fuel fire |
| RCS | brief gas hiss on the existing impulse event |
| Gear | servo/metal action and light mechanical latches |
| Hangar | motor movement, shutter stop, switches, gate, lever latch and return |
| Menus/settings | quiet physical click and a little air/static; no hover beeps |

The new sources are selected CC0 material samples and a diesel field recording,
not recordings made by this project and not original HighFleet sounds.
See [asset provenance](../assets/audio/CREDITS.md). Four additional recording edits
add about 73 KiB; all fourteen encoded sounds total about 193 KiB. The edits decode
to about 1.1 MiB of mono float PCM. Buffers are retained and reused, with small
playback-rate variations. Gun recordings are source material for stylized weapons,
not claimed to be literal recordings of the game's calibers. Pressure, gas and
fallback layers remain synthesized.

## Runtime and synchronization

- AudioContext starts/resumes only after an existing user action. Sample fetch
  and decode are asynchronous after unlock; the fallback layers work immediately.
- All buffers are cached. No file fetch/decode, live random-noise generation, or
  PCM image-like processing occurs inside a game frame.
- The sound PRNG is private, so enabling audio does not consume physics randomness.
- At most 28 tracked event voices, with priorities and short fades on retirement.
  Nearby repeated impacts/explosions are coalesced. Continuous beds use five loops.
- Game positions drive stereo pan, distance attenuation and a single low-pass
  filter per event. Distant sounds lose treble; UI sounds stay centered.
- Nearby heavy shots and large explosions briefly lower only the continuous beds
  using scheduled gain automation, recovering smoothly after 160-260ms. Further
  gunshots and UI clicks are not turned down by that bed automation.
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
weapon/fuel/wreck tails, distance filtering, engine thrust/damage response,
stereo placement, 28-voice pressure, finite PCM bounded below 0.971, and fallback
sound. Live controls cover light/heavy fire, RCS, gear,
mute/resume, and volume. The hangar and rendering suites cover their existing
flows. Numerical checks do not replace listening on the target headphones or
speakers; tone and levels can be tuned from player feedback.
