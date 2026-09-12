// Cursive fonts available for typed signatures on certificates. Pure metadata — no
// react-pdf import — so it is safe to use from types.ts, forms and any client code.
// The TTFs live in public/fonts (SIL OFL 1.1, see public/fonts/OFL.txt).

export const SIGNATURE_FONTS = {
  great_vibes: { label: 'Great Vibes', family: 'GreatVibes', file: 'GreatVibes-Regular.ttf' },
  allura: { label: 'Allura', family: 'Allura', file: 'Allura-Regular.ttf' },
  dancing_script: { label: 'Dancing Script', family: 'DancingScript', file: 'DancingScript-Regular.ttf' },
} as const;

export type SignatureFont = keyof typeof SIGNATURE_FONTS;

export const SIGNATURE_FONT_KEYS = Object.keys(SIGNATURE_FONTS) as [SignatureFont, ...SignatureFont[]];

export const DEFAULT_SIGNATURE_FONT: SignatureFont = 'great_vibes';

export function isSignatureFont(value: unknown): value is SignatureFont {
  return typeof value === 'string' && value in SIGNATURE_FONTS;
}

/** Font family to hand to react-pdf for a signature; unknown/null values fall back to the default. */
export function signatureFontFamily(font: string | null | undefined): string {
  return SIGNATURE_FONTS[isSignatureFont(font) ? font : DEFAULT_SIGNATURE_FONT].family;
}
