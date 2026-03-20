// /frontend/lib/fonts.ts
export interface GoogleFontImportConfig {
  family: string;
  cssFamily: string; // Use in `font-family`
  importUrl: string; // CSS @import URL for Google Fonts
}

export const fonts = {
  display: {
    family: "Plus Jakarta Sans",
    cssFamily: '"Plus Jakarta Sans"',
    importUrl:
      "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@600;700;800&display=swap"
  },
  body: {
    family: "Inter",
    cssFamily: '"Inter"',
    importUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
  },
  mono: {
    family: "JetBrains Mono",
    cssFamily: '"JetBrains Mono"',
    importUrl: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
  }
} as const satisfies Record<string, GoogleFontImportConfig>;

export type FontKey = keyof typeof fonts;

export function getGoogleFontImport(fontKey: FontKey): string {
  return fonts[fontKey].importUrl;
}

export function getFontFamilyCss(fontKey: FontKey): string {
  return fonts[fontKey].cssFamily;
}

