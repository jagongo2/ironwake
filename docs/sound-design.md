# Mechanical and combat sound - 2026-11-09

The 0.11 WebGL game's simulation and visuals are unchanged. The original common
noise/sine `boom()` has been split into mechanical events, reusable sound layers,
and continuous engine/fire beds in `src/sound.js`.

| Event | Layers and response |
| --- | --- |
| 57mm | short rifle edit with its attack retained, compact steel knock, pressure and a delayed metal action |
| 180mm | steel strike first, recorded cannon body 18ms later, pressure and low rolling tail |
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
add about 70 KiB; all fourteen encoded sounds total about 190 KiB. The edits decode
to about 1 MiB of mono float PCM. Buffers are retained and reused, with small
playback-rate variations. Gun recordings are source material for stylized weapons,
not claimed to be literal recordings of the game's calibers. Pressure, gas and
fallback layers remain synthesized.

## Clear attacks and parallel body saturation

The previous low-tone pass stacked 2.2-3.2kHz asset filtering, a 9dB presence cut,
another event low-pass and another bus cut/filter. Player feedback correctly
identified that as submerged. A unity-compensated shaper at low drive also had
little nonlinear effect on small real game signals.

The current edits retain considerably more of the source attack: pitch 0.90 for
guns, 1.00 / 0.94 for blasts, 7.5-10.5kHz asset low-pass and just a 2.5dB presence
cut. The shared blanket presence cut and output low-pass are removed. A clean
path carries the crack and mechanics. In parallel, a broad 650Hz body band is
driven 5x into a `WaveShaperNode` tanh curve with 2x oversampling; a quiet wet
return adds mid harmonics. Only this body return has a 2.6kHz low-pass. The master
keeps its conservative, unity-slope soft ceiling and transient-preserving
compressor. Layer balance, rather than extra blanket filtering, provides bass.

The [user reference](https://www.youtube.com/watch?v=LYoqIen6wiU) was sampled from
public browser playback at approximately 0-12.85s and 14-25.94s for local PCM/FFT
analysis. These mixed-combat sections retained upper-mid energy during attacks
alongside substantial bass. They are not isolated gun stems and cannot establish
the original game's DSP chain. No claim of direct subjective listening or exact
timbre matching is made. Reference captures stay under ignored `artifacts/` and
are not game assets. Tests now guard against removing all near-attack presence,
as well as excessive upper-mid energy, and compare saturation enabled/bypassed
at the same real signal level.

Propulsion keeps a quiet 420Hz band-pass air layer. Its former 950Hz blanket
low-pass is replaced by a gentle high shelf, with more recorded diesel/mechanical
texture relative to the synthetic hum. Four-second harmonic phase drift and
slower pitch changes remain; no extra live flanger graph is needed.

## Runtime and synchronization

- AudioContext starts/resumes only after an existing user action. Sample fetch
  and decode are asynchronous after unlock; the fallback layers work immediately.
- All buffers are cached. No file fetch/decode, live random-noise generation, or
  PCM image-like processing occurs inside a game frame.
- The sound PRNG is private, so enabling audio does not consume physics randomness.
- At most 28 tracked event voices, with priorities and short fades on retirement.
  Nearby repeated impacts/explosions are coalesced. Continuous beds use five loops.
- Game positions drive stereo pan, distance attenuation and a single low-pass
  filter per event. Near attacks start open at 9-10.5kHz, then settle smoothly to
  a darker body after 65ms. Distance reduces the cutoff toward 550Hz. Active event
  parameters follow listener movement at 30Hz, rather than freezing at emission.
- Pitch varies within +/-5% and gain within +/-4%, using the private sound PRNG.
- Hull below 48%, major engine failure or death enables a limited 6-bit-amplitude
  damage texture, blended at no more than 5.5% wet. Dry compensation limits gain
  buildup. Healthy/preflight/menu audio clears it; UI bypasses the world mix.
- Nearby heavy shots and large explosions briefly lower only the continuous beds
  using scheduled gain automation, recovering smoothly after 160-260ms. Further
  gunshots and UI clicks are not turned down by that bed automation.
- World parameters update at most 30Hz. Master high-pass, compression and a bounded
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
flows. FFT checks cover low/mid body and bounded 2.5-6kHz energy in close and
distant shots/blasts, including the synthesized fallback and full thrust. Near
shots must retain measurable presence. A saturation A/B checks that body mids
actually change, an offline moving-listener test checks stereo/attenuation/treble
automation, and a healthy/critical-hull A/B checks bounded damage texture.
Numerical checks do not replace listening on the target headphones or
speakers; tone and levels can be tuned from player feedback.
