/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Gemini Cowork brand palette ────────────────────────────────────
      colors: {
        // Primary — Gemini blue/violet gradient endpoints
        gemini: {
          50:  '#f0f4ff',
          100: '#e0eaff',
          200: '#c7d7fe',
          300: '#a5b9fc',
          400: '#8293f8',
          500: '#6470f3',   // primary CTA
          600: '#5258e8',
          700: '#4445d5',
          800: '#3739ac',
          900: '#313589',
          950: '#1e1f52',
        },
        // Accent — Google AI Studio teal
        aistudio: {
          50:  '#effefb',
          100: '#c7fdf5',
          200: '#90f9ec',
          300: '#51ede0',
          400: '#1ed8ce',
          500: '#08bcb5',   // accent
          600: '#069695',
          700: '#0a7778',
          800: '#0d5e61',
          900: '#0f4d50',
          950: '#022f33',
        },
        // Neutrals — dark mode surfaces
        surface: {
          900: '#0d0f12',   // app background
          800: '#13161b',   // panel
          700: '#1c2029',   // card
          600: '#252c38',   // elevated card
          500: '#2f3847',   // border / divider
          400: '#404d60',   // muted text
          300: '#6b7a92',
          200: '#9aaabf',
          100: '#d0d9e7',
        },
        // Status colours
        success: '#22c55e',
        warning: '#f59e0b',
        danger:  '#ef4444',
        info:    '#38bdf8',
      },

      // ── Typography ────────────────────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      // ── Animations (Framer Motion integration helpers) ─────────────────
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.3' },
        },
        'slide-in-right': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        'fade-up': {
          from: { transform: 'translateY(8px)', opacity: '0' },
          to:   { transform: 'translateY(0)',   opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
      },
      animation: {
        'pulse-dot':       'pulse-dot 1.5s ease-in-out infinite',
        'slide-in-right':  'slide-in-right 0.25s ease-out',
        'fade-up':         'fade-up 0.2s ease-out',
        shimmer:           'shimmer 1.5s linear infinite',
      },

      // ── Gradients ─────────────────────────────────────────────────────
      backgroundImage: {
        'gemini-gradient':  'linear-gradient(135deg, #6470f3 0%, #08bcb5 100%)',
        'panel-gradient':   'linear-gradient(180deg, #13161b 0%, #0d0f12 100%)',
        'thinking-shimmer': 'linear-gradient(90deg, transparent 0%, rgba(100,112,243,0.15) 50%, transparent 100%)',
      },

      // ── Box shadows ────────────────────────────────────────────────────
      boxShadow: {
        panel:   '0 0 0 1px rgba(64, 77, 96, 0.6)',
        glow:    '0 0 20px rgba(100, 112, 243, 0.25)',
        'glow-sm': '0 0 8px rgba(100, 112, 243, 0.2)',
      },
    },
  },
  plugins: [],
};
