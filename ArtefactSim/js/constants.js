export const MAT = { w: 2362, h: 1143 };
export const LIMIT = 250;
export const GRID = 8;
export const HANGAR = 800;
export const MIN_GAP = 40;
export const WHEEL_H = 64;
export const WHEEL_T = 12;
export const MOD = {
  clamp: { w: 56, d: 72 },
  gripper: { w: 56, d: 64 },
};
export const COLORS = {
  blue: "#0057c8",
  red: "#c81e14",
  green: "#0b8a38",
  black: "#1a1d22",
  yellow: "#ffd400",
};
export const COLOR_ORDER = ["red", "green", "black", "blue", "yellow"];
export const SLOTS = [
  { x: 1076.0, y: 1077.0 },
  { x: 1207.8, y: 1077.0 },
  { x: 1339.5, y: 1077.0 },
  { x: 1471.5, y: 1077.0 },
];
export const MUSEUM = {
  red: { x: 1009.5, y: 70.5 },
  green: { x: 1141.5, y: 70.5 },
  black: { x: 1273.5, y: 70.5 },
  blue: { x: 1405.5, y: 70.5 },
  yellow: { x: 1537.0, y: 70.5 },
};
export const CORRIDOR_X = 1274;
export const SNAP_X = 12;
export const SNAP_ART = 22;
export const SWAP_ART = 16;
export const ART_W = 48;
export const ART_H = 32;
export const GRAB_PAD = 22;

export function fieldSlotAt(i) {
  if (i < SLOTS.length) return SLOTS[i];
  const pitch = SLOTS[1].x - SLOTS[0].x;
  return { x: SLOTS[0].x - pitch, y: SLOTS[0].y };
}
