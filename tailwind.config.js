/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Base metallic dark backgrounds
        slate: {
          950: '#0a0a0f',
          900: '#0f172a',
          850: '#12121a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
        },
        // Primary accent - neon cyan
        cyan: {
          400: '#22d3ee',
          500: '#00f0ff',
          600: '#00d4e8',
        },
        // Secondary accent - purple
        violet: {
          500: '#7c3aed',
          600: '#6d28d9',
        },
        // Tertiary - pink
        pink: {
          400: '#f472b6',
          500: '#ec4899',
        },
        // Success/gold
        amber: {
          400: '#fbbf24',
          500: '#ffd700',
        },
        emerald: {
          500: '#10b981',
        },
      },
      fontFamily: {
        display: ['Outfit', 'sans-serif'],
        body: ['DM Sans', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan': '0 0 20px rgba(0, 240, 255, 0.3)',
        'glow-cyan-lg': '0 0 40px rgba(0, 240, 255, 0.4)',
        'glow-violet': '0 0 20px rgba(124, 58, 237, 0.3)',
        'metallic': 'inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 1px 3px rgba(0, 0, 0, 0.3)',
        'metallic-lg': 'inset 0 1px 0 rgba(255, 255, 255, 0.15), 0 4px 12px rgba(0, 0, 0, 0.4)',
      },
      backgroundImage: {
        'metallic-gradient': 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 100%)',
        'glow-top': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(0, 240, 255, 0.15), transparent)',
        'card-sheen': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%)',
      },
      borderColor: {
        'metallic': 'rgba(255, 255, 255, 0.1)',
        'metallic-focus': 'rgba(0, 240, 255, 0.5)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
