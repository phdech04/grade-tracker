/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        ink: {
          DEFAULT: "#1c1b1a",
          soft: "#4a4642",
          faint: "#8a847c",
        },
        paper: {
          DEFAULT: "#faf8f4",
          card: "#ffffff",
          sunk: "#f1ede5",
        },
        line: "#e7e1d6",
        accent: {
          DEFAULT: "#b4541f",
          soft: "#d97a45",
          wash: "#f6e9df",
        },
        good: "#3f7d4e",
        warn: "#b78514",
        bad: "#b03a2e",
      },
      boxShadow: {
        card: "0 1px 2px rgba(28,27,26,0.04), 0 8px 24px -12px rgba(28,27,26,0.12)",
        lift: "0 2px 4px rgba(28,27,26,0.05), 0 18px 40px -16px rgba(28,27,26,0.22)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};
