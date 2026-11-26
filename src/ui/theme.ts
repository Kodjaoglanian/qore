// Color palette — Torlink-inspired dark themes with 24-bit TrueColor hex values
import type { ThemeName } from "../core/config.js";

export interface ThemePalette {
  // Backgrounds
  bg: string;
  bgSurface: string;
  bgHover: string;
  bgHighlight: string;

  // Borders
  border: string;
  borderMuted: string;
  borderFocused: string;

  // Text
  text: string;
  textMuted: string;
  textDim: string;
  textBright: string;

  // Accents
  purple: string;
  purpleDim: string;
  purpleBright: string;

  // Status
  green: string;
  red: string;
  yellow: string;
  blue: string;
  cyan: string;
}

export const THEMES: Record<ThemeName, { label: string; palette: ThemePalette }> = {
  torlink: {
    label: "Torlink Purple",
    palette: {
      bg: "#0D0D12",
      bgSurface: "#16161E",
      bgHover: "#1E1E28",
      bgHighlight: "#2A1A3D",
      border: "#A370F7",
      borderMuted: "#5C5B66",
      borderFocused: "#A370F7",
      text: "#E4E4E8",
      textMuted: "#5C5B66",
      textDim: "#8B8A99",
      textBright: "#FFFFFF",
      purple: "#A370F7",
      purpleDim: "#7B4FB5",
      purpleBright: "#C49BFF",
      green: "#7FD686",
      red: "#F76B6B",
      yellow: "#F7C66B",
      blue: "#6BA8F7",
      cyan: "#6BF7E4",
    },
  },
  cyber: {
    label: "Cyber Cyan",
    palette: {
      bg: "#090D16",
      bgSurface: "#111827",
      bgHover: "#1B2538",
      bgHighlight: "#132E3B",
      border: "#38BDF8",
      borderMuted: "#4B5563",
      borderFocused: "#38BDF8",
      text: "#E2E8F0",
      textMuted: "#64748B",
      textDim: "#94A3B8",
      textBright: "#FFFFFF",
      purple: "#38BDF8",
      purpleDim: "#0284C7",
      purpleBright: "#7DD3FC",
      green: "#34D399",
      red: "#FB7185",
      yellow: "#FBBF24",
      blue: "#818CF8",
      cyan: "#22D3EE",
    },
  },
  emerald: {
    label: "Emerald Matrix",
    palette: {
      bg: "#0A100D",
      bgSurface: "#111C16",
      bgHover: "#192920",
      bgHighlight: "#143322",
      border: "#34D399",
      borderMuted: "#4B6358",
      borderFocused: "#34D399",
      text: "#E2EFE8",
      textMuted: "#587266",
      textDim: "#89A396",
      textBright: "#FFFFFF",
      purple: "#34D399",
      purpleDim: "#059669",
      purpleBright: "#6EE7B7",
      green: "#4ADE80",
      red: "#F87171",
      yellow: "#FACC15",
      blue: "#60A5FA",
      cyan: "#2DD4BF",
    },
  },
  amber: {
    label: "Amber Forge",
    palette: {
      bg: "#120F0A",
      bgSurface: "#1C1710",
      bgHover: "#282016",
      bgHighlight: "#382812",
      border: "#F59E0B",
      borderMuted: "#6B5E4C",
      borderFocused: "#F59E0B",
      text: "#EFEAE2",
      textMuted: "#736757",
      textDim: "#A69885",
      textBright: "#FFFFFF",
      purple: "#F59E0B",
      purpleDim: "#B45309",
      purpleBright: "#FCD34D",
      green: "#84CC16",
      red: "#EF4444",
      yellow: "#FBBF24",
      blue: "#60A5FA",
      cyan: "#38BDF8",
    },
  },
  rose: {
    label: "Rosé Pine",
    palette: {
      bg: "#191724",
      bgSurface: "#1F1D2E",
      bgHover: "#26233A",
      bgHighlight: "#392A47",
      border: "#EB6F92",
      borderMuted: "#6E6A86",
      borderFocused: "#EB6F92",
      text: "#E0DEF4",
      textMuted: "#6E6A86",
      textDim: "#908CAA",
      textBright: "#FFFFFF",
      purple: "#EB6F92",
      purpleDim: "#B4637A",
      purpleBright: "#F49CB5",
      green: "#9CCFD8",
      red: "#EB6F92",
      yellow: "#F6C177",
      blue: "#31748F",
      cyan: "#C4A7E7",
    },
  },
};

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[];

let activeThemeName: ThemeName = "torlink";

// Mutable live palette object so all components referencing `colors.*` update seamlessly
export const colors: ThemePalette = { ...THEMES.torlink.palette };

export function getActiveTheme(): ThemeName {
  return activeThemeName;
}

export function setActiveTheme(name: ThemeName): boolean {
  const entry = THEMES[name];
  if (!entry) return false;
  activeThemeName = name;
  Object.assign(colors, entry.palette);
  return true;
}

export function cycleTheme(): ThemeName {
  const idx = THEME_NAMES.indexOf(activeThemeName);
  const next = THEME_NAMES[(idx + 1) % THEME_NAMES.length];
  setActiveTheme(next);
  return next;
}

export function latencyColor(ms: number): string {
  if (ms < 80) return colors.green;
  if (ms < 250) return colors.yellow;
  return colors.red;
}

export function percentColor(pct: number): string {
  if (pct >= 90) return colors.red;
  if (pct >= 70) return colors.yellow;
  return colors.green;
}

export type ColorKey = keyof ThemePalette;
