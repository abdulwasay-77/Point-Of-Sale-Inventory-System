
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      // Design tokens: "ledger & receipt" theme — grounded in the POS/invoice subject matter.
      colors: {
        paper: {
          DEFAULT: '#FAF9F6', // main app background — like receipt/ledger paper
          dim: '#F0EDE4',     // sunken panels / table stripes
        },
        ink: {
          DEFAULT: '#1F2430', // primary text, sidebar surface
          light: '#343B4C',   // secondary dark surface
          muted: '#6B7280',   // secondary text
        },
        amber: {
          DEFAULT: '#E8A33D', // primary accent — the "register key" color
          dark: '#C9822A',
          light: '#F6D9A7',
        },
        teal: {
          DEFAULT: '#2F6F6B', // secondary accent — success / in-stock
          dark: '#234F4C',
          light: '#DCEAE9',
        },
        rose: {
          DEFAULT: '#C1502E', // danger / low-stock — warm rust, not stock red
          light: '#F3DCD3',
        },
        line: '#E4E0D6', // hairline borders on paper background
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(31, 36, 48, 0.06), 0 1px 8px rgba(31, 36, 48, 0.04)',
        receipt: '0 4px 24px rgba(31, 36, 48, 0.10)',
      },
      backgroundImage: {
        // subtle tear/perforation line used on receipt-style panels
        'tear-line': 'repeating-linear-gradient(to right, #D8D3C6 0, #D8D3C6 6px, transparent 6px, transparent 12px)',
      },
    },
  },
  plugins: [],
}
