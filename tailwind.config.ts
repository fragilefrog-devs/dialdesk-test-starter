import type { Config } from "tailwindcss";

// Palette: ink and steel blues for the product, hi-vis signal amber for the one action that matters,
// green only for "good" states, red only for emergencies.
const config: Config = {
  content: ["./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Barlow", "system-ui", "sans-serif"],
        display: ["Barlow Condensed", "Barlow", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#f1f5f8", 100: "#e3ebf1", 200: "#c5d5e1", 300: "#9bb6cb", 400: "#5f8bab",
          500: "#2f6a93", 600: "#1d5580", 700: "#164468", 800: "#123650", 900: "#0f2a3f", 950: "#0b1c2b",
        },
        signal: { 300: "#fbd566", 400: "#f5b81c", 500: "#dd9f0a" },
        accent: {
          50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 500: "#10b981", 600: "#059669", 700: "#047857",
        },
        surface: { 50: "#f4f6f5", 100: "#eaeeed" },
      },
      borderRadius: { DEFAULT: "6px", lg: "8px", xl: "10px", "2xl": "12px" },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(11 28 43 / 0.08)",
        card: "0 1px 3px 0 rgb(11 28 43 / 0.08), 0 1px 2px -1px rgb(11 28 43 / 0.06)",
        elevated: "0 10px 24px -8px rgb(11 28 43 / 0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
