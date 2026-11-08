# Mechanical and combat sound - 2026-11-09

The 0.11 WebGL game's simulation and visuals are unchanged. The original common
noise/sine `boom()` has been split into mechanical events, reusable sound layers,
and continuous engine/fire beds in `src/sound.js`.

| Event | Layers and response |
| --- | --- |
| 57mm | short, lower-pitched rifle edit, compact steel knock and quiet gas release; shortened tail for repeated fire |
| 180mm | low steel strike first, cannon body 28ms later, pressure and low rolling tail |
| Explosion | trimmed demolition recording and pressure; impact, fuel and wreck events have different rates, gas and debris layers |
| Hull impact | brief envelope-shaped plate strike with 20% sample-held/11-bit texture and quiet metal; no automatic explosion sound |
| Engine | actual diesel recording, 60-120Hz hum, lower mechanical harmonics and band-limited air; thrust changes gain/pitch and damage reduces output |
| Burning fuel | quiet crackle/air bed tied to the player's active fuel fire |
| RCS | brief gas hiss on the existing impulse event |
| Gear | servo/metal action and light mechanical latches |
| Hangar | motor movement, shutter stop, switches, gate, lever latch and return |
| Menus/settings | quiet physical click and a little air/static; no hover beeps |

The new sources are selected CC0 material samples and a diesel field recording,
not recordings made by this project and not original HighFleet sounds.
See [asset provenance](../assets/audio/CREDITS.md). Four additional recording edits
add about 71 KiB; all fourteen encoded sounds total about 191 KiB. The edits decode
to about 1.3 MiB of mono float PCM. Buffers are retained and reused, with small
playback-rate variations. Gun recordings are source material for stylized weapons,
not claimed to be literal recordings of the game's calibers. Pressure, gas and
fallback layers remain synthesized.

## Lower-tone remix after player feedback

The preceding mix was too high and noisy in play. Simply adding sub-bass on top
would have increased overall noise. Recording edits now use lower pitch, a
2.2-3.2kHz low-pass and a 9dB cut around 3.5kHz. The new steel transient is a short,
pitched-down plate recording, so the heavy shot keeps an immediate physical
attack while its recorded blast follows slightly later.

Combat events share a 90Hz low shelf, 3.5kHz cut, gain-compensated soft saturation
and a 3.8kHz post-filter. The master ceiling no longer boosts quiet inputs, and
the compressor lets the initial impact through rather than flattening it. This
is controlled soft saturation; it does not rely on clipping the device output.
UI bypasses the combat bus. Propulsion uses a quiet 420Hz band-pass air layer,
a 950Hz bed low-pass and slower, smaller pitch changes. Engine harmonics have a
subtle four-second phase drift rather than an additional live flanger graph.
There is no global HP-driven high-pass: engine damage changes output/roughness
without stripping the low body from every battle sound.

An isolated 24kHz browser comparison at the unchanged 45% volume, with six-second
captures and identical event positions, measured roughly 9-10dB lower RMS for
shots/blasts and 7-8dB for propulsion. Repeated fire was about 10dB lower. The
2.5-6kHz energy dropped substantially. These are PCM measurements of the test
scenarios, not a subjective loudness or speaker-response guarantee. The ignored
`artifacts/audio-tone-comparison.json` records the local before/after results.

## Runtime and synchronization

- AudioContext starts/resumes only after an existing user action. Sample fetch
  and decode are asynchronous after unlock; the fallback layers work immediately.
- All buffers are cached. No file fetch/decode, live random-noise generation, or
  PCM image-like processing occurs inside a game frame.
- The sound PRNG is private, so enabling audio does not consume physics randomness.
- At most 28 tracked event voices, with priorities and short fades on retirement.
  Nearby repeated impacts/explosions are coalesced. Continuous beds use five loops.
- Game positions drive stereo pan, distance attenuation and a single low-pass
  filter per event, capped at 2.5-2.7kHz for guns / 3.4kHz for explosions up close.
  Distant sounds lose more treble; UI sounds stay centered.
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
stereo placement, 28-voice pressure, finite PCM bounded below 0.76, and fallback
sound. Live controls cover light/heavy fire, RCS, gear,
mute/resume, and volume. The hangar and rendering suites cover their existing
flows. FFT checks also cover low-band body and restrained 2.5-6kHz energy in close
and distant shots/blasts, including the synthesized fallback and full thrust.
Numerical checks do not replace listening on the target headphones or
speakers; tone and levels can be tuned from player feedback.
