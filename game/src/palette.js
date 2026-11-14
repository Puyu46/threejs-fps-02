// The look plan, in one place. Dusk in an industrial yard: cold blue-grey concrete,
// rust-orange containers, teal accents, and one warm amber for the sun and the HUD.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#20262e',
  ground: '#3b3f45',
  surface: '#4c463d',
  hairline: '#2c2822',
  rust: '#b4552a',
  teal: '#2e6f6a',
  ink: '#f2ede3',
  muted: '#9aa3ab',
  accent: '#f0a830',
  danger: '#e2483d',
  ally: '#4d8fd1',
  enemy: '#d1542e',
};

export function shade(name) {
  return PALETTE[name];
}
