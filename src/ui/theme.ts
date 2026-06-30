// Color palette — Torlink-inspired dark theme with electric purple highlights
// All colors are 24-bit TrueColor hex values

export const colors = {
  // Backgrounds
  bg: "#0D0D12",
  bgSurface: "#16161E",
  bgHover: "#1E1E28",
  bgHighlight: "#2A1A3D",

  // Borders
  border: "#A370F7",
  borderMuted: "#5C5B66",
  borderFocused: "#A370F7",

  // Text
  text: "#E4E4E8",
  textMuted: "#5C5B66",
  textDim: "#8B8A99",
  textBright: "#FFFFFF",

  // Accents
  purple: "#A370F7",
  purpleDim: "#7B4FB5",
  purpleBright: "#C49BFF",

  // Status
  green: "#7FD686",
  red: "#F76B6B",
  yellow: "#F7C66B",
  blue: "#6BA8F7",
  cyan: "#6BF7E4",
} as const;

export type ColorKey = keyof typeof colors;
