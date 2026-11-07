// Radians, seconds and normalized torque. No angle assignment or frame-rate PRNG.
export const RCS_TUNING = Object.freeze({
  bank: Math.PI / 4, impulse: .68, holdSpring: 46, holdDamping: 8,
  returnSpring: 42, returnDamping: 7.8, maxTorque: 18, maxRate: 2.5
});
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export function rcsNozzleAlive(ship, side, exhaust) {
  const x = side ? ship.w - 11 : 10, y = exhaust > 0 ? 34 : 16;
  if (x < 0 || x >= ship.w || y >= ship.h) return false;
  const index = x + y * ship.w;
  return !!ship.mat?.[index] && (!ship.hp || ship.hp[index] > 0);
}
const livePair = (ship, direction) => (Number(rcsNozzleAlive(ship, 0, direction)) + Number(rcsNozzleAlive(ship, 1, -direction))) / 2;

export function stepRCS(ship, command, dt) {
  command = Math.sign(command);
  if (!ship.rcs && !command) return false;
  const rcs = ship.rcs ||= {
    command: 0, clock: 0, torque: 0, acceleration: 0, effort: 0,
    flare: 0, emit: 0, kicked: false, kickCooldown: 0, jetDirection: 0, cameraX: 0, cameraVelocity: 0,
    referenceMoment: (ship.inertiaRadius || 800) * clamp(ship.count / ship.initial, .55, 1)
  };
  rcs.kicked = false;
  if (ship.dead || ship.resting || ship.grounded) {
    rcs.command = 0;rcs.torque = rcs.acceleration = rcs.effort = rcs.flare = 0;
    return false;
  }
  const authority = clamp(ship.engineRatio, 0, 1);
  const impulseAuthority = authority * livePair(ship, command || 1);
  const moment = (ship.inertiaRadius || 800) * clamp(ship.count / ship.initial, .55, 1);
  const inertia = clamp(moment / rcs.referenceMoment, .65, 1.4);
  const previousRate = ship.av;
  rcs.clock += dt;
  rcs.flare = Math.max(0, rcs.flare - dt);
  rcs.kickCooldown = Math.max(0, rcs.kickCooldown - dt);
  if (command && command !== rcs.command && impulseAuthority > 0 && rcs.kickCooldown === 0) {
    // One impulse on the first physics substep of a new press/direction.
    const impulse = Math.min(RCS_TUNING.impulse * impulseAuthority / inertia, Math.max(0, RCS_TUNING.maxRate - command * ship.av));
    ship.av += command * impulse;
    rcs.flare = .1;rcs.kicked = impulse > 0;rcs.kickCooldown = .11;
  }
  rcs.command = command;
  const target = command * RCS_TUNING.bank;
  const spring = command ? RCS_TUNING.holdSpring : RCS_TUNING.returnSpring;
  const damping = command ? RCS_TUNING.holdDamping : RCS_TUNING.returnDamping;
  let torque = (target - ship.angle) * spring - ship.av * damping;
  if (command && command * ship.av > RCS_TUNING.maxRate) torque -= command * (command * ship.av - RCS_TUNING.maxRate) * 10;
  // Small pressure ripple while firing, never random torque on a resting ship.
  torque = clamp(torque, -RCS_TUNING.maxTorque, RCS_TUNING.maxTorque);
  torque *= 1 + .025 * Math.sin(rcs.clock * 83);
  rcs.jetDirection = Math.sign(torque);
  const requestedTorque = torque * authority / inertia;
  rcs.torque = requestedTorque * livePair(ship, rcs.jetDirection || 1);
  ship.av += rcs.torque * dt;
  rcs.acceleration = (ship.av - previousRate) / dt;
  rcs.effort = clamp(Math.abs(requestedTorque) / RCS_TUNING.maxTorque, 0, 1);
  return true;
}

export function stepRCSSway(rcs, dt, enabled) {
  if (!rcs) return 0;
  if (!enabled) {rcs.cameraX = rcs.cameraVelocity = 0;return 0;}
  const target = -clamp(rcs.acceleration * .12, -1.5, 1.5);
  rcs.cameraVelocity += ((target - rcs.cameraX) * 110 - rcs.cameraVelocity * 18) * dt;
  rcs.cameraX += rcs.cameraVelocity * dt;
  return rcs.cameraX;
}
