import type { Config } from "tailwindcss";

/**
 * Tailwind reads the palette from the CSS custom properties in globals.css rather than
 * redefining hexes here, so there is exactly one place a colour is chosen. See that file
 * for why these specific values (validated dark-mode steps; reserved status colours).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        plane: "var(--plane)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        rule: "var(--rule)",
        edge: "var(--edge)",
        ink: "var(--ink)",
        "ink-2": "var(--ink-2)",
        "ink-3": "var(--ink-3)",
        good: "var(--good)",
        warning: "var(--warning)",
        serious: "var(--serious)",
        critical: "var(--critical)",
        accent: "var(--accent)",

        // Landing art only. Never state — see the note in globals.css.
        "tile-vermillion": "var(--tile-vermillion)",
        "tile-chartreuse": "var(--tile-chartreuse)",
        "tile-indigo": "var(--tile-indigo)",
        "tile-cyan": "var(--tile-cyan)",
        "tile-ink": "var(--tile-ink)",
        "tile-bone": "var(--tile-bone)",
      },
      backgroundImage: {
        "tile-gradient": "var(--tile-gradient)",
      },
      borderRadius: {
        tile: "var(--tile-radius)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      /**
       * Display sizes carry their own tracking and leading. Tailwind's defaults leave
       * display type too loose on both axes, which is the single most common reason a
       * large headline reads as a scaled-up paragraph rather than as a headline.
       */
      fontSize: {
        "display-sm": ["2.5rem", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
        display: ["3.5rem", { lineHeight: "0.98", letterSpacing: "-0.035em" }],
        "display-lg": ["5rem", { lineHeight: "0.94", letterSpacing: "-0.04em" }],
        "display-xl": ["7rem", { lineHeight: "0.9", letterSpacing: "-0.045em" }],
      },
      maxWidth: {
        prose: "68ch",
      },
    },
  },
  plugins: [],
};

export default config;
