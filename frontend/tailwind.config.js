/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
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
        // Neutral/informational accent — replaces flat `ink` as a stat-card
        // tone. `ink` worked fine as text/sidebar but was a poor fifth
        // "color": on light mode it read as a flat near-black square with
        // no relation to the amber/teal/rose family, and in dark mode it
        // was nearly the same shade as the card behind it. Steel is a
        // proper muted blue-gray with its own light/dark pairing, same
        // treatment as teal/rose.
        steel: {
          DEFAULT: '#5B6B8C',
          dark: '#42506B',
          light: '#E3E7F0',
        },
        line: '#E4E0D6', // hairline borders on paper background

        // Dark mode palette — matches the approved "Ledger POS" dark mockup.
        // Kept as its own namespace (rather than reusing paper/ink/teal/rose)
        // so a component can carry both a light value and a dark: value on
        // the same element without one clobbering the other, e.g.
        // `bg-white dark:bg-dark-card`.
        dark: {
          surface: '#14171C',  // page background
          sidebar: '#10131A',  // sidebar — one shade below the page surface
          card: '#1E222A',     // raised surfaces: navbar, cards, modals
          card2: '#242832',    // sunken panels — dark equivalent of paper-dim
          border: '#31353F',   // hairline borders on dark surfaces
          text: '#E7E5DD',     // primary text
          muted: '#8D92A0',    // secondary/muted text
          teal: '#4FB8AD',     // brightened so it still reads on a dark surface
          rose: '#E2795A',     // brightened so it still reads on a dark surface
          steel: '#8998BD',    // brightened so it still reads on a dark surface
        },
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