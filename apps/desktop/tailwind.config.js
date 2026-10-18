/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        pitch: "#000000",
        surface: {
          dark: "#0a0a0a",
          light: "#f7f7f7",
        },
        panel: {
          dark: "#111111",
          light: "#efefef",
        },
        border: {
          dark: "#222222",
          light: "#e5e5e5",
          focus: "#444444",
        },
        muted: {
          dark: "#777777",
          light: "#888888",
        },
      },
      borderRadius: {
        smooth: "1.25rem",
        "smooth-lg": "1.75rem",
      },
    },
  },
  plugins: [],
};
