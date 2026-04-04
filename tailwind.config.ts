import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        orange: {
          primary: "#E8871E",
          dark: "#C2410C",
          light: "#FED7AA",
          50: "#FFF7ED",
          100: "#FFEDD5",
          200: "#FFF5EB",
          300: "#FFF8F0",
          400: "#FB923C",
          500: "#F97316",
          600: "#EA580C",
        },
        heading: "#1A1A2E",
        body: "#4A4A68",
        muted: "#8E8EA0",
        cream: "#FFF9F2",
        peach: "#FFF5EB",
        sand: "#F5EDE4",
        clay: {
          bg: "#FDF8F3",
          surface: "#FFFFFF",
          border: "rgba(232,135,30,0.15)",
          highlight: "rgba(255,255,255,0.85)",
          shadow: "rgba(200,160,120,0.25)",
        },
      },
      fontFamily: {
        poppins: ["var(--font-poppins)", "sans-serif"],
        inter: ["var(--font-inter)", "sans-serif"],
      },
      borderRadius: {
        clay: "24px",
        "clay-sm": "16px",
        "clay-lg": "32px",
        "clay-xl": "40px",
        "clay-pill": "100px",
      },
      boxShadow: {
        clay: [
          "10px 10px 30px rgba(200,160,120,0.2)",
          "-8px -8px 24px rgba(255,255,255,0.95)",
          "inset 3px 3px 8px rgba(255,255,255,0.9)",
          "inset -3px -3px 8px rgba(200,160,120,0.12)",
        ].join(", "),
        "clay-hover": [
          "14px 14px 36px rgba(200,160,120,0.28)",
          "-10px -10px 28px rgba(255,255,255,0.95)",
          "inset 3px 3px 8px rgba(255,255,255,0.9)",
          "inset -3px -3px 8px rgba(200,160,120,0.15)",
        ].join(", "),
        "clay-pressed": [
          "4px 4px 12px rgba(200,160,120,0.15)",
          "-3px -3px 10px rgba(255,255,255,0.8)",
          "inset 4px 4px 12px rgba(200,160,120,0.18)",
          "inset -2px -2px 8px rgba(255,255,255,0.7)",
        ].join(", "),
        "clay-orange": [
          "8px 8px 24px rgba(232,135,30,0.35)",
          "-4px -4px 16px rgba(255,200,140,0.3)",
          "inset 2px 2px 6px rgba(255,255,255,0.35)",
          "inset -2px -2px 6px rgba(180,80,0,0.15)",
        ].join(", "),
        "clay-inset": [
          "inset 4px 4px 12px rgba(200,160,120,0.2)",
          "inset -3px -3px 10px rgba(255,255,255,0.8)",
        ].join(", "),
        "clay-pill": [
          "4px 4px 12px rgba(200,160,120,0.15)",
          "-3px -3px 8px rgba(255,255,255,0.9)",
          "inset 1px 1px 3px rgba(255,255,255,0.8)",
          "inset -1px -1px 3px rgba(200,160,120,0.08)",
        ].join(", "),
        "clay-nav": [
          "0 8px 32px rgba(200,160,120,0.15)",
          "0 2px 8px rgba(200,160,120,0.08)",
          "inset 0 1px 0 rgba(255,255,255,0.9)",
        ].join(", "),
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        float: "float 3s ease-in-out infinite",
        "float-slow": "float 4.5s ease-in-out infinite",
        "pulse-soft": "pulse-soft 3s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
