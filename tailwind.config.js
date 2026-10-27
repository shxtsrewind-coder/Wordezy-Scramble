/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#ffffff",
        surface: "#f6f6f3",
        "surface-high": "#e2e3e0",
        rule: "#d3d6da",
        paper: "#121212",
        muted: "#5c5c5c",
        faint: "#8b8b86",
        correct: "#3a8b55",
        "correct-dim": "#2e7045",
        "correct-soft": "rgba(58,139,85,0.12)",
        present: "#b5841e",
        "present-dim": "#946b16",
        "present-soft": "rgba(181,132,30,0.14)",
        absent: "#787c7e",
        danger: "#c23b2e",
        "danger-soft": "rgba(194,59,46,0.10)",
      },
      fontFamily: {
        display: ["Zilla Slab", "Rockwell", "Georgia", "serif"],
        sans: ["Libre Franklin", "Helvetica Neue", "Arial", "ui-sans-serif", "system-ui"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      keyframes: {
        "achievement-in": {
          "0%": { opacity: "0", transform: "translate(-50%, -12px)" },
          "100%": { opacity: "1", transform: "translate(-50%, 0)" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-7px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(3px)" },
        },
        pop: {
          "0%": { transform: "scale(1)" },
          "45%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)" },
        },
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "achievement-in": "achievement-in 0.25s ease-out",
        shake: "shake 0.42s ease-in-out",
        pop: "pop 0.32s ease-out",
        "rise-in": "rise-in 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};
