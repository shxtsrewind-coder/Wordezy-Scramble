/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0a08",
        surface: "#141310",
        "surface-high": "#1b1915",
        rule: "#2a271f",
        paper: "#f3efe6",
        muted: "#978c79",
        faint: "#6b6457",
        correct: "#2f9e6e",
        "correct-dim": "#24805a",
        "correct-soft": "rgba(47,158,110,0.14)",
        present: "#c9922f",
        "present-dim": "#a87725",
        "present-soft": "rgba(201,146,47,0.14)",
        absent: "#342f26",
        danger: "#c0564a",
        "danger-soft": "rgba(192,86,74,0.14)",
      },
      fontFamily: {
        display: ["Cinzel", "Georgia", "serif"],
        sans: ["Archivo", "ui-sans-serif", "system-ui"],
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
