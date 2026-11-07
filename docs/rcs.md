# Q/E RCS flight control

The active 0.11 WebGL game gains manual left/right bank control. The original
autopilot remains unchanged until Q/E is used. Thereafter the manual RCS
controller stabilizes the player's hull at zero bank when neither key is held.
Enemy control and existing combat rules are unchanged.

## Response

- Q: negative (counterclockwise) torque; E: positive (clockwise) torque.
- Hold target: ±45°. A first-press angular impulse of 0.68 rad/s gives immediate
  response; it is not repeated by keyboard autorepeat or physics substeps.
- Normalized hold torque: `46 * angleError - 8 * angularVelocity`.
- Return/counter-thrust torque: `42 * angleError - 7.8 * angularVelocity`.
- Torque is limited to 18 rad/s² at reference inertia, with an angular-rate
  governor at 2.5 rad/s. Impulses have a 110ms recharge and a bounded impulse
  budget, preventing repeated-tap energy pumping.
- A deterministic ±2.5% pressure ripple applies only to demanded torque.
- Changes in surviving hull inertia affect acceleration; engine integrity
  scales control authority. A dead or supported hull receives no RCS torque.
- In the reference 120Hz controller test, hold overshoot is about 49.1° and
  release overshoot about -4.1°, settling near zero in 2.5 seconds.

The existing 60Hz game physics subdivides fast motion. The controller receives
each actual physics substep and applies torque to angular velocity; the existing
center-of-mass rotation and collision/ground solvers integrate the hull angle.
It never assigns the angle or rotates only the artwork.

## Translation and presentation

Opposing fore/aft RCS jets form a torque couple. Their net lateral force is zero.
Lateral drift instead comes from the main lift vector rotating with the hull:
`horizontal += sin(bank) * lift`, `vertical += (1-cos(bank)) * lift` relative to
the previous upright model. Banking trades vertical lift for evasion, and W/S,
horizontal movement, and emergency thrust remain available. There is no
invented centrifugal force on the center of mass.

Small cold-white jets and short particles fire on the side corresponding to
actual torque, including reverse jets during braking. Their emitter coordinates
rotate with the hull. A short synthesized hiss marks a new impulse. Rendering
uses existing pooled Pixi objects and the bounded particle pool.

Camera sway is a damped translation (maximum target 1.5 world units), driven by
angular acceleration. It is included in the camera coordinates used for mouse
aiming; no screen rotation or extra full-screen filter is needed. Screen-shake
off and reduced-motion preferences disable sway. The turret remains aimed at
the mouse in world space while the hull turns.

## Checks

- `npm test`: existing deterministic simulation/effect comparisons plus pure
  RCS response, reversal, spam limit, mass/damage, grounding and sway tests.
- `npm run test:rcs`: real Q/E presses, release/reversal, simultaneous keys,
  rotated thrust drift, RCS particles, ground support and projectile aiming,
  identical Canvas/WebGL physics, and the screen-shake setting.
- `npm run test:render`: existing classic-art and rendering regression checks.
- `npm run test:preflight`: the shutter/hangar flow remains available.
