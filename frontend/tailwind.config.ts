import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,js,jsx}",
    "./components/**/*.{ts,tsx,js,jsx}",
    "./lib/**/*.{ts,tsx,js,jsx}",
    "./store/**/*.{ts,tsx,js,jsx}"
  ],
  darkMode: "class",
  theme: {
    screens: {
      xs: "375px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px"
    },
    extend: {
      colors: {
        background: "rgb(var(--background-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2-rgb) / <alpha-value>)",
        // Ghost border: evita líneas 1px totalmente opacas para sectioning
        border: "rgb(var(--border-rgb) / 0.15)",
        "border-light": "rgb(var(--border-light-rgb) / 0.15)",

        primary: "rgb(var(--primary-rgb) / <alpha-value>)",
        "primary-hover": "rgb(var(--primary-hover-rgb) / <alpha-value>)",
        "primary-glow": "var(--primary-glow)",

        success: "rgb(var(--success-rgb) / <alpha-value>)",
        "success-bg": "var(--success-bg)",
        warning: "rgb(var(--warning-rgb) / <alpha-value>)",
        "warning-bg": "var(--warning-bg)",
        danger: "rgb(var(--danger-rgb) / <alpha-value>)",
        "danger-bg": "var(--danger-bg)",
        info: "rgb(var(--info-rgb) / <alpha-value>)",
        "info-bg": "var(--info-bg)",

        "text-primary": "rgb(var(--text-primary-rgb) / <alpha-value>)",
        "text-secondary": "rgb(var(--text-secondary-rgb) / <alpha-value>)",
        "text-muted": "rgb(var(--text-muted-rgb) / <alpha-value>)",

        // Precision Ledger palette (explicit names from reference HTML)
        "on-surface": "#dee1f7",
        "on-surface-variant": "#c3c6d7",
        "surface-container-lowest": "#090e1c",
        "surface-container-low": "#161b2b",
        "surface-container": "#1a1f2f",
        "surface-container-high": "#25293a",
        "surface-container-highest": "#2f3445",
        "surface-variant": "#2f3445",
        "surface-dim": "#0e1322",
        "surface-bright": "#343949",
        "primary-container": "#2563eb",
        "secondary-container": "#03b5d3",
        tertiary: "#4edea3",
        "tertiary-container": "#007d55",
        secondary: "#4cd7f6",
        error: "#ffb4ab",
        "error-container": "#93000a",
        outline: "#8d90a0",
        "outline-variant": "#434655",

        // Aliases existentes del repo para no romper pantallas actuales
        bg: "rgb(var(--background-rgb) / <alpha-value>)",
        textPrimary: "rgb(var(--text-primary-rgb) / <alpha-value>)",
        textSecondary: "rgb(var(--text-secondary-rgb) / <alpha-value>)"
      },
      fontFamily: {
        display: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        headline: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        label: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      fontSize: {
        xs: ["11px", { lineHeight: "16px", letterSpacing: "-0.01em" }],
        sm: ["13px", { lineHeight: "18px", letterSpacing: "-0.01em" }],
        base: ["15px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        lg: ["17px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
        xl: ["20px", { lineHeight: "28px", letterSpacing: "-0.01em" }],
        "2xl": ["24px", { lineHeight: "32px", letterSpacing: "-0.02em" }],
        "3xl": ["30px", { lineHeight: "36px", letterSpacing: "-0.02em" }],
        "4xl": ["36px", { lineHeight: "48px", letterSpacing: "-0.02em" }]
      },
      minHeight: {
        touch: "44px",
        "touch-desktop": "36px"
      },
      minWidth: {
        touch: "44px",
        "touch-desktop": "36px"
      }
    }
  },
  plugins: []
};

export default config;
