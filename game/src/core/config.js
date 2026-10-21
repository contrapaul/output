// Global tuning constants, colors, and theme.

export const CONFIG = {
  SIM_HZ: 30,
  BELT_RATE: 2.0, // tiles per second
  MIN_SPACING: 0.63, // minimum distance between item centers on a line (tiles)
  TILE: 40, // logical pixels per tile at zoom 1

  COLORS: {
    light: {
      bg: "#f4f1ea",
      outside: "#d9d3c6",
      edge: "#b9b1a2",
      grid: "#e2ddd2",
      belt: "#b8b0a4",
      beltLine: "#8f877b",
      ghostOk: "rgba(74,158,108,0.35)",
      ghostBad: "rgba(194,91,78,0.35)",
      selection: "#3a6ea5",
    },
    dark: {
      bg: "#1d1f24",
      outside: "#121317",
      edge: "#3a3e48",
      grid: "#2c2f38",
      belt: "#4a4d57",
      beltLine: "#6a6d78",
      ghostOk: "rgba(92,185,131,0.35)",
      ghostBad: "rgba(212,122,109,0.35)",
      selection: "#7aa5d4",
    },
  },
};

export function themeColors(theme) {
  return CONFIG.COLORS[theme === "dark" ? "dark" : "light"];
}
