/**
 * The Meadowmark colour palette.
 *
 * Every mesh in the game is vertex-coloured straight from this table — there
 * are no texture files anywhere in the engine. Keys are semantic rather than
 * literal ("roof", not "terracotta") so the whole world can be restyled by
 * swapping this one file, and so it can later be driven from Material Design 3
 * seed-colour tokens without touching a single mesh definition.
 *
 * Colours are stored as 0xRRGGBB integers (three.js's native colour input) so
 * they can be handed directly to `Color.setHex`.
 */

export type PaletteKey =
  | 'roofClay'
  | 'roofSlate'
  | 'roofThatch'
  | 'roofBarn'
  | 'wallCream'
  | 'wallStone'
  | 'wallBrick'
  | 'wallTimber'
  | 'wallWhite'
  | 'wood'
  | 'woodDark'
  | 'leaf'
  | 'leafDark'
  | 'leafLight'
  | 'trunk'
  | 'soil'
  | 'soilDry'
  | 'grass'
  | 'grassDry'
  | 'water'
  | 'waterDeep'
  | 'stone'
  | 'stoneDark'
  | 'metal'
  | 'metalDark'
  | 'glass'
  | 'accent'
  | 'accentWarm'
  | 'accentCool'
  | 'skinLight'
  | 'skinMid'
  | 'skinDark'
  | 'hair'
  | 'clothPrimary'
  | 'clothSecondary'
  | 'cropWheat'
  | 'cropCarrot'
  | 'cropCorn'
  | 'cropBerry'
  | 'cropSeed'
  | 'road'
  | 'roadLine'
  | 'sand'
  | 'snow';

export type Palette = Record<PaletteKey, number>;

/**
 * The shipped default palette. A future Material Design 3 integration derives
 * this same shape from seed-colour tokens; nothing downstream needs to know
 * the difference, because every mesh only ever asks the palette for a key.
 */
export const defaultPalette: Palette = {
  roofClay: 0xc96a4b,
  roofSlate: 0x54606e,
  roofThatch: 0xcf9a4c,
  roofBarn: 0x9c3b34,

  wallCream: 0xf1e6cf,
  wallStone: 0xb9ada0,
  wallBrick: 0xb3543f,
  wallTimber: 0x8a6247,
  wallWhite: 0xf7f4ee,

  wood: 0x9a6b45,
  woodDark: 0x6b4a30,

  leaf: 0x5f9a4c,
  leafDark: 0x3f7238,
  leafLight: 0x7fbb5e,
  trunk: 0x6b4a30,

  soil: 0x6b4a34,
  soilDry: 0x8a6a48,
  grass: 0x6fae52,
  grassDry: 0x9fa858,

  water: 0x4fa9c9,
  waterDeep: 0x2f7396,

  stone: 0x9d9689,
  stoneDark: 0x6f6a60,

  metal: 0x9aa3ab,
  metalDark: 0x565d63,

  glass: 0xbfe3ea,

  accent: 0xe8b13e,
  accentWarm: 0xe07a3f,
  accentCool: 0x4c8fbd,

  skinLight: 0xf0c9a0,
  skinMid: 0xc98d5e,
  skinDark: 0x8a5a35,
  hair: 0x4a3626,

  clothPrimary: 0xd0553f,
  clothSecondary: 0x3f7f9c,

  cropWheat: 0xe3c559,
  cropCarrot: 0xe08a34,
  cropCorn: 0xe8d24a,
  cropBerry: 0x8f3f6a,
  cropSeed: 0x5a4630,

  road: 0x7d7871,
  roadLine: 0xe8e0d0,

  sand: 0xe0c98f,
  snow: 0xf4f7fa,
};

/** Mutable palette instance the whole engine reads from. */
let activePalette: Palette = { ...defaultPalette };

export function getPalette(): Readonly<Palette> {
  return activePalette;
}

export function getPaletteColor(key: PaletteKey): number {
  return activePalette[key];
}

/**
 * Replace the active palette (partially or fully). Existing generated meshes
 * hold vertex colours already baked in, so callers that want a live re-theme
 * must regenerate affected geometry after calling this.
 */
export function setPalette(next: Partial<Palette>): void {
  activePalette = { ...activePalette, ...next };
}

export function resetPalette(): void {
  activePalette = { ...defaultPalette };
}
