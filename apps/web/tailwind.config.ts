import type { Config } from "tailwindcss";

// Palette + type intentionally left minimal here — the real design pass (T012, T019+)
// follows this project's design mandate: no soft gradients, no pure-white background,
// no bento-grid/3-card defaults, no Lucide/sparkle icon clichés. See TECHNICAL_ARCHITECTURE.md.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
