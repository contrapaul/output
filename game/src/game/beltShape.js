// Belt shape (polish pass P2, Paul's playtest 2026-10-22): one belt line
// draws as one snake strip, not one square per tile.
//
// linePath() turns the tiles of a flow line (head to tail, from the line
// manager) into the few points a canvas stroke needs: the head edge centre,
// one point at every corner (where the direction changes), and the tail edge
// centre. Stroking those points with round joins makes corners curve.
//
// Pure math, no canvas: tested in test/polish-p2.test.js. Renderer:
// renderer._drawBelts.

import { DIRS } from "../core/grid.js";

/**
 * @param {Array<{x,y,dir}>} tiles  head to tail; consecutive tiles agree
 *   (tile i faces tile i+1), guaranteed by the line manager.
 * @param {number} tile  logical pixels per tile.
 * @returns {Array<{x,y}>} stroke points in logical pixels.
 */
export function linePath(tiles, tile) {
  if (!tiles || !tiles.length) return [];
  const c = (t) => ({ x: (t.x + 0.5) * tile, y: (t.y + 0.5) * tile });
  if (tiles.length === 1) {
    const d = DIRS[tiles[0].dir];
    const p = c(tiles[0]);
    return [
      { x: p.x - d.dx * tile / 2, y: p.y - d.dy * tile / 2 },
      { x: p.x + d.dx * tile / 2, y: p.y + d.dy * tile / 2 },
    ];
  }
  const pts = [];
  // head: back edge centre of the first tile (the belt covers its tile fully)
  const hd = DIRS[tiles[0].dir];
  const hp = c(tiles[0]);
  pts.push({ x: hp.x - hd.dx * tile / 2, y: hp.y - hd.dy * tile / 2 });
  // one point per corner: a tile whose dir differs from the next tile's
  // (the last tile of the old direction), plus first and last centres, so
  // the stroke always runs through tile centres and turns at a corner with
  // one round join
  for (let i = 0; i < tiles.length; i++) {
    if (i === 0 || i === tiles.length - 1 || tiles[i].dir !== tiles[i + 1].dir) pts.push(c(tiles[i]));
  }
  // tail: front edge centre of the last tile
  const td = DIRS[tiles[tiles.length - 1].dir];
  const tp = c(tiles[tiles.length - 1]);
  const last = pts[pts.length - 1];
  if (last.x !== tp.x || last.y !== tp.y) pts.push(tp);
  pts.push({ x: tp.x + td.dx * tile / 2, y: tp.y + td.dy * tile / 2 });
  return pts;
}

/** True when two neighbouring tiles of the run turn (a corner tile). */
export function isCorner(tiles, i) {
  if (i <= 0 || i >= tiles.length - 1) return false;
  return tiles[i - 1].dir !== tiles[i].dir;
}
