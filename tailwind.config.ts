import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        corniche: { DEFAULT: "#3E5B2A", dark: "#2C4220", soft: "#E6ECDF" },
        ink: "#1E2619",
        paper: "#F7F9F5",
        line: "#D6DCCF",
        muted: "#5F6B57",
        st: {
          pending: "#9AA394",
          progress: "#2F6FB0",
          done: "#2E8B4E",
          issue: "#D9822B",
          na: "#4A4F47",
          cancelled: "#C0392B",
        },
      },
      fontFamily: {
        sans: ["var(--font-plex)", "IBM Plex Sans", "Segoe UI", "Tahoma", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
