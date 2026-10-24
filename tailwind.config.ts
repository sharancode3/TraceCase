import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/dev/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'var(--font-dm-sans)',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        canvas: '#FFFFFF',
        lavender: {
          surface: '#EDF0FF',
          accent: '#A3B1E4',
          subtle: '#F6F8FF',
        },
        neutral: {
          surface: '#F3F2F7',
          divider: '#D9DADE',
        },
        cobalt: {
          action: '#4767DB',
          hover: '#3855C5',
          subtle: '#EEF2FC',
        },
        brand: {
          deepPurple: '#3A3A7B',
          navy: '#161E38',
          muted: '#5F6782',
        },
        status: {
          confirmed: '#D9383A',
          confirmedBg: '#FDF2F2',
          notReproduced: '#1B8755',
          notReproducedBg: '#EDF9F2',
          pending: '#D97706',
          pendingBg: '#FEF3C7',
          inconclusive: '#6B7280',
          inconclusiveBg: '#F3F4F6',
        },
      },
      borderRadius: {
        card: '1.5rem',     // ~24px rounded card
        control: '0.75rem',  // ~12px control radius
        badge: '9999px',    // pill badge
      },
      boxShadow: {
        subtle: '0 2px 8px -2px rgba(22, 30, 56, 0.04), 0 1px 4px -1px rgba(22, 30, 56, 0.02)',
        card: '0 4px 20px -4px rgba(22, 30, 56, 0.06), 0 2px 6px -2px rgba(22, 30, 56, 0.03)',
        cardHover: '0 8px 30px -6px rgba(71, 103, 219, 0.12), 0 4px 10px -2px rgba(22, 30, 56, 0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
