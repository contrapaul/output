// Grid math, directions, rotations.
// Directions are clockwise: 0=right, 1=down, 2=left, 3=up.

export const DIRS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 },
];

export const DIR_NAMES = ["right", "down", "left", "up"];

export function rotate(dir, times = 1) {
  return (dir + ((times % 4) + 4) % 4) % 4;
}

export function tileKey(x, y, z = 0) {
  return z ? `${x},${y},${z}` : `${x},${y}`;
}

export function parseKey(key) {
  const p = key.split(",").map(Number);
  return { x: p[0], y: p[1], z: p[2] || 0 };
}

export function inZone(x, y, zone) {
  return x >= 0 && y >= 0 && x < zone.w && y < zone.h;
}

// Tile directly before `dir` (where items arrive from)
export function inputDir(dir) {
  return rotate(dir, 2);
}
