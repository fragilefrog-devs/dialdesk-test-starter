import type { Config } from "tailwindcss";

// Every color is a semantic token defined in src/styles/globals.css with light-dark(),
// so the whole app themes from one place and follows the system light/dark setting.
const config: Config = {
  content: ["./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      colors: {
        canvas: "var(--canvas)",
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        line: { DEFAULT: "var(--line)" },
        control: "var(--control)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        primary: { DEFAULT: "var(--primary)", hover: "var(--primary-hover)", fg: "var(--primary-fg)" },
        signal: { DEFAULT: "var(--signal)", hover: "var(--signal-hover)", fg: "var(--signal-fg)" },
        danger: { DEFAULT: "var(--danger)", soft: "var(--danger-soft)" },
        good: { DEFAULT: "var(--good)", soft: "var(--good-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        band: "var(--band)",
        "band-fg": "var(--band-fg)",
      },
      // Matched to the mockup: 10px controls and 15px panels.
      borderRadius: { DEFAULT: "10px", lg: "10px", xl: "15px" },
      // Hairline border first; shadows stay diffuse and under 0.08 alpha. Dark mode swaps shadow for an edge highlight.
      boxShadow: {
        soft: "0 1px 2px 0 var(--shadow)",
        card: "0 1px 3px 0 var(--shadow), inset 0 1px 0 0 var(--edge)",
        elevated: "0 12px 32px -12px var(--shadow), inset 0 1px 0 0 var(--edge)",
      },
      transitionDuration: { DEFAULT: "150ms" },
      transitionTimingFunction: { DEFAULT: "cubic-bezier(0.16, 1, 0.3, 1)" },
    },
  },
  plugins: [],
};

export default config;
