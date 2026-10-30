/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F4F0FC",
          100: "#E9E1F9",
          200: "#D3C3F2",
          300: "#B49BE8",
          400: "#9775DE",
          500: "#7952D6",
          600: "#6842C2",
          700: "#5935A8",
          800: "#472A86",
          900: "#33205F",
        },
        canvas: "#F8F7FC",
        ink: { DEFAULT: "#202033", soft: "#858399", faint: "#B9B7C9" },
        line: "#ECEAF4",
        positive: { DEFAULT: "#20B486", soft: "#E3F6EF" },
      },
      fontFamily: {
        sans: ["Manrope", "Inter", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "18px", "3xl": "24px" },
      boxShadow: {
        card: "0 1px 2px rgba(32,32,51,0.04), 0 4px 16px -6px rgba(32,32,51,0.08)",
        pop: "0 12px 40px -12px rgba(52,30,110,0.28)",
        glow: "0 8px 24px -8px rgba(121,82,214,0.55)",
      },
      keyframes: {
        "fade-in": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } },
        "scale-in": { from: { opacity: 0, transform: "scale(.97)" }, to: { opacity: 1, transform: "none" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "fade-in": "fade-in .25s ease-out both",
        "scale-in": "scale-in .18s ease-out both",
      },
    },
  },
  plugins: [],
};
