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
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
