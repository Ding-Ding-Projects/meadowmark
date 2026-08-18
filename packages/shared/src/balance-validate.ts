/**
 * Validates the balance/*.json content files. Run via `npm run
 * check:balance` (root) or `node dist/balance-validate.js` from this
 * package. Exits non-zero with a precise message naming the offending id
 * the moment any check fails, so a bad content edit is caught long before
 * it reaches a save file.
 *
 * Checks performed:
 *  1. No recipe references an unknown good (as an input or as its output).
 *  2. No unlock entry in unlocks.json is orphaned (references a
 *     crop/recipe/building id that doesn't actually exist).
 *  3. No production chain cycles (good A requires good B which,
 *     transitively, requires good A again).
 *  4. Every good is reachable from crops/animals/mine - i.e. every
 *     crafted good's dependency chain eventually bottoms out at a raw
 *     good that has no recipe producing it (a crop, an animal product, a
 *     mine good, a train material, etc).
 *  5. Every factory's unlockLevel is <= the unlockLevel of every recipe it
 *     holds (a factory can never gate players out of a recipe it should
 *     already have delivered).
 *
 * This file intentionally does zero path-resolution magic beyond walking
 * up from the current working directory looking for a `balance/` folder,
 * so it behaves the same whether compiled to CommonJS or ESM and whatever
 * directory `npm run` happens to invoke it from within the workspace.
 */

import * as fs from "node:fs";
import * as path from "node:path";

interface CropEntry {
  id: string;
  unlockLevel: number;
}

interface AnimalEntry {
  id: string;
  productGoodId: string;
  level: number;
}

interface RecipeEntry {
  id: string;
  factoryTypeId: string;
  inputs: Record<string, number>;
  outputGoodId: string;
  unlockLevel: number;
}

interface FactoryTypeEntry {
  id: string;
  unlockLevel: number;
}

interface GoodEntry {
  id: string;
}

interface BuildingEntry {
  buildingTypeId: string;
}

interface UnlockEntry {
  level: number;
  kind: string;
  id: string;
}

class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

function findBalanceDir(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, "balance");
    if (fs.existsSync(path.join(candidate, "crops.json"))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  fail(`could not locate a "balance" directory (containing crops.json) starting from ${startDir}`);
}

function readJson<T>(dir: string, file: string): T {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) fail(`missing balance file: ${full}`);
  const raw = fs.readFileSync(full, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    fail(`${file} is not valid JSON: ${(e as Error).message}`);
  }
}

export function validateBalance(balanceDir: string): void {
  const crops = readJson<{ crops: CropEntry[] }>(balanceDir, "crops.json").crops;
  const animals = readJson<{ animals: AnimalEntry[] }>(balanceDir, "animals.json").animals;
  const goodsFile = readJson<{ goods: GoodEntry[] }>(balanceDir, "goods.json").goods;
  const factoriesFile = readJson<{ factoryTypes: FactoryTypeEntry[]; recipes: RecipeEntry[] }>(balanceDir, "factories.json");
  const buildings = readJson<{ buildings: BuildingEntry[] }>(balanceDir, "buildings.json").buildings;
  const unlocks = readJson<{ unlocks: UnlockEntry[] }>(balanceDir, "unlocks.json").unlocks;

  const { factoryTypes, recipes } = factoriesFile;

  const knownGoodIds = new Set(goodsFile.map((g) => g.id));
  const knownCropIds = new Set(crops.map((c) => c.id));
  const knownRecipeIds = new Set(recipes.map((r) => r.id));
  const knownBuildingIds = new Set(buildings.map((b) => b.buildingTypeId));
  const knownFactoryTypeIds = new Set(factoryTypes.map((f) => f.id));

  // ---- Check 1: every recipe references only known goods -----------------
  for (const r of recipes) {
    for (const inputGoodId of Object.keys(r.inputs)) {
      if (!knownGoodIds.has(inputGoodId)) {
        fail(`recipe "${r.id}" references unknown input good "${inputGoodId}"`);
      }
    }
    if (!knownGoodIds.has(r.outputGoodId)) {
      fail(`recipe "${r.id}" produces unknown output good "${r.outputGoodId}"`);
    }
    if (!knownFactoryTypeIds.has(r.factoryTypeId)) {
      fail(`recipe "${r.id}" references unknown factory type "${r.factoryTypeId}"`);
    }
  }

  // Crop and animal product ids must also exist in the goods catalog.
  for (const c of crops) {
    if (!knownGoodIds.has(c.id)) fail(`crop "${c.id}" has no matching entry in goods.json`);
  }
  for (const a of animals) {
    if (!knownGoodIds.has(a.productGoodId)) {
      fail(`animal "${a.id}" produces unknown good "${a.productGoodId}"`);
    }
  }

  // ---- Check 2: no orphaned unlocks ---------------------------------------
  const knownFeatureIds = new Set(["ship", "mine"]);
  for (const u of unlocks) {
    switch (u.kind) {
      case "crop":
        if (!knownCropIds.has(u.id)) fail(`unlock entry references unknown crop "${u.id}"`);
        break;
      case "animal":
        if (!animals.some((a) => a.id === u.id)) fail(`unlock entry references unknown animal "${u.id}"`);
        break;
      case "recipe":
        if (!knownRecipeIds.has(u.id)) fail(`unlock entry references unknown recipe "${u.id}"`);
        break;
      case "building":
        if (!knownBuildingIds.has(u.id)) fail(`unlock entry references unknown building "${u.id}"`);
        break;
      case "feature":
        if (!knownFeatureIds.has(u.id)) fail(`unlock entry references unknown feature "${u.id}"`);
        break;
      default:
        fail(`unlock entry has unrecognized kind "${u.kind}" (id "${u.id}")`);
    }
  }

  // ---- Build the good dependency graph for checks 3 and 4 -----------------
  // For each good that has at least one recipe producing it, record the
  // union of every input good across every such recipe as its dependency
  // set. A good with no recipe producing it is a "base" good (a crop,
  // animal product, mine good, train material, feed, etc) and is
  // trivially reachable.
  const dependenciesByGood = new Map<string, Set<string>>();
  for (const r of recipes) {
    const set = dependenciesByGood.get(r.outputGoodId) ?? new Set<string>();
    for (const inputGoodId of Object.keys(r.inputs)) set.add(inputGoodId);
    dependenciesByGood.set(r.outputGoodId, set);
  }

  // ---- Check 3: no production chain cycles --------------------------------
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  function visit(goodId: string, chain: string[]): void {
    const state = color.get(goodId) ?? WHITE;
    if (state === BLACK) return;
    if (state === GRAY) {
      fail(`production chain cycle detected: ${[...chain, goodId].join(" -> ")}`);
    }
    color.set(goodId, GRAY);
    const deps = dependenciesByGood.get(goodId);
    if (deps) {
      for (const dep of deps) visit(dep, [...chain, goodId]);
    }
    color.set(goodId, BLACK);
  }

  for (const goodId of dependenciesByGood.keys()) {
    visit(goodId, []);
  }

  // ---- Check 4: every good is reachable from crops/animals/mine ----------
  // A good is reachable if it is a base good (no recipe produces it) or if
  // every good in its dependency set is itself reachable (checked via the
  // same cycle-safe recursion above - by this point we know there are no
  // cycles, so plain memoized recursion is safe).
  const reachable = new Map<string, boolean>();
  function isReachable(goodId: string): boolean {
    if (reachable.has(goodId)) return reachable.get(goodId)!;
    const deps = dependenciesByGood.get(goodId);
    if (!deps || deps.size === 0) {
      reachable.set(goodId, true);
      return true;
    }
    reachable.set(goodId, true); // provisional, breaks any residual recursion safely post cycle-check
    const ok = [...deps].every((dep) => isReachable(dep));
    reachable.set(goodId, ok);
    return ok;
  }

  for (const goodId of knownGoodIds) {
    if (!isReachable(goodId)) {
      fail(`good "${goodId}" is not reachable from any crop, animal product, or mine good (its dependency chain never bottoms out at a raw source)`);
    }
  }

  // ---- Check 5: factory unlockLevel <= every recipe's unlockLevel --------
  const factoryLevelById = new Map(factoryTypes.map((f) => [f.id, f.unlockLevel]));
  for (const r of recipes) {
    const factoryLevel = factoryLevelById.get(r.factoryTypeId)!;
    if (factoryLevel > r.unlockLevel) {
      fail(
        `factory "${r.factoryTypeId}" unlocks at level ${factoryLevel}, but its recipe "${r.id}" unlocks at level ${r.unlockLevel} - a factory must never unlock after a recipe it holds`,
      );
    }
  }
}

function main(): void {
  const balanceDir = findBalanceDir(process.cwd());
  try {
    validateBalance(balanceDir);
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(`balance-validate: FAILED - ${e.message}`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
  console.log(`balance-validate: OK (${balanceDir})`);
}

// This file is only ever invoked directly as the `check:balance` script
// entry point (see package.json), never imported elsewhere in this
// package, so it always runs main() on load rather than gating on a
// CommonJS-specific `require.main === module` check that would break if
// this package is ever compiled to ESM output.
main();
