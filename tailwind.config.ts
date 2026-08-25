import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f0fdf6",
          100: "#dcfce9",
          200: "#bbf7d4",
          300: "#86efb3",
          400: "#4ade8b",
          500: "#22c56b",
          600: "#16a355",
          700: "#158046",
          800: "#16653b",
          900: "#145333",
        },
      },
    },
  },
  plugins: [],
};
export default config;
