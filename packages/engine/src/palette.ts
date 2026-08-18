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
  | 'cropSugarcane'
  | 'cropCotton'
  | 'cropStrawberry'
  | 'cropTomato'
  | 'cropPotato'
  | 'cropSoybean'
  | 'cropRice'
  | 'cropPumpkin'
  | 'cropChilli'
  | 'cropCoffeeBean'
  | 'cropLavender'
  | 'cropGrape'
  | 'cropBlueberry'
  | 'cropVanilla'
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
  roofClay: 0xd97a4f,
  roofSlate: 0x49586a,
  roofThatch: 0xe0a94a,
  roofBarn: 0xb23f2e,

  wallCream: 0xf5e8c8,
  wallStone: 0xc2b39f,
  wallBrick: 0xc25a3f,
  wallTimber: 0x93683f,
  wallWhite: 0xfaf6ec,

  wood: 0xa8703f,
  woodDark: 0x744f2c,

  leaf: 0x5fae3f,
  leafDark: 0x36742e,
  leafLight: 0x8fce54,
  trunk: 0x744f2c,

  soil: 0x6e4826,
  soilDry: 0x9a743f,
  // Bright, sunny mid-green — Township-style grass, not forest-floor
  // shade. Kept with a clear value gap from `soil` above so tilled and
  // untilled ground read as distinctly different materials at a glance.
  grass: 0x74c752,
  grassDry: 0xb0a94a,

  water: 0x3fb0d9,
  waterDeep: 0x22688f,

  stone: 0xaa9f8a,
  stoneDark: 0x736a58,

  metal: 0x9aa8b3,
  metalDark: 0x525b63,

  glass: 0xb8e6f0,

  accent: 0xf0b830,
  accentWarm: 0xe8752f,
  accentCool: 0x3f8fcf,

  skinLight: 0xf2cba0,
  skinMid: 0xcf8a52,
  skinDark: 0x8f552e,
  hair: 0x3f2c1c,

  clothPrimary: 0xdb4a34,
  clothSecondary: 0x2f80a3,

  cropWheat: 0xe8c848,
  cropCarrot: 0xe87e22,
  cropCorn: 0xf0d43a,
  cropBerry: 0x9c3468,
  cropSeed: 0x5a4630,
  cropSugarcane: 0xa8dc4f,
  cropCotton: 0xf7f4ee,
  cropStrawberry: 0xdb2f42,
  cropTomato: 0xe23a24,
  cropPotato: 0xcfa268,
  cropSoybean: 0x9fce3f,
  cropRice: 0xecdca0,
  cropPumpkin: 0xf07c1e,
  cropChilli: 0xc91f14,
  cropCoffeeBean: 0x4f3220,
  cropLavender: 0x8f5fc9,
  cropGrape: 0x622f8f,
  cropBlueberry: 0x30539c,
  cropVanilla: 0xe6c880,

  road: 0x726b60,
  roadLine: 0xece2cc,

  sand: 0xe6c778,
  snow: 0xf7f9fb,
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

/**
 * A cheap deterministic pseudo-random number in [0, 1) derived from an
 * integer seed. Not cryptographic; it only has to look scattered enough
 * that repeated instances (a field of a thousand wheat plants, a thousand
 * ground tiles) do not read as one flat repeated swatch.
 */
function seededUnit(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453123;
  return x - Math.floor(x);
}

/**
 * Nudge a 0xRRGGBB colour by up to `amount` (a fraction of full brightness,
 * e.g. 0.08 = +/-8%) so a large field of identical instanced meshes reads
 * as varied plants/tiles rather than a repeated texture stamp.
 *
 * Pass a `seed` (an instance index, a tile coordinate hash, ...) for a
 * result that is stable across frames and reproducible from the same
 * seed; omit it to get a fresh jitter from `Math.random()` each call.
 */
export function varyColor(base: number, amount: number, seed?: number): number {
  const jitterUnit = seed === undefined ? Math.random() : seededUnit(seed);
  const factor = 1 + (jitterUnit * 2 - 1) * amount;
  const clampChannel = (channel: number): number =>
    Math.max(0, Math.min(255, Math.round(channel * factor)));
  const r = clampChannel((base >> 16) & 0xff);
  const g = clampChannel((base >> 8) & 0xff);
  const b = clampChannel(base & 0xff);
  return (r << 16) | (g << 8) | b;
}
