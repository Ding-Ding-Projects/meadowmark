import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`Missing ${name}.`);
  return resolve(process.argv[index + 1]);
}

async function atomicWrite(path, content) {
  const temporary = resolve(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  await writeFile(temporary, content);
  try {
    let lastError;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await rename(temporary, path);
        return;
      } catch (error) {
        lastError = error;
        if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
        await new Promise((done) => setTimeout(done, 100 * (attempt + 1)));
      }
    }
    throw lastError;
  } finally {
    await rm(temporary, { force: true });
  }
}

const catalog = JSON.parse(await readFile(argument("--catalog"), "utf8"));
const catalogReleasesPages = JSON.parse(await readFile(argument("--catalog-releases"), "utf8"));
const projectReleasesPages = JSON.parse(await readFile(argument("--project-releases"), "utf8"));
const output = argument("--output");
if (catalog.schemaVersion !== "1.0.0" || !Array.isArray(catalog.dishes) || catalog.dishes.length < 1) {
  throw new Error("Public dim-sum catalog has an unsupported or empty schema.");
}
const flatten = (value) => (Array.isArray(value[0]) ? value.flat() : value);
const catalogReleases = flatten(catalogReleasesPages).filter((release) => !release.draft && String(release.tag_name).startsWith("catalog-v1"));
const projectReleases = flatten(projectReleasesPages);
const usedBodies = projectReleases.map((release) => String(release.body ?? "")).join("\n");
const assets = new Map();
for (const release of catalogReleases) {
  for (const asset of release.assets ?? []) {
    assets.set(asset.name, {
      assetName: asset.name,
      photoUrl: asset.browser_download_url,
      catalogReleaseUrl: release.html_url,
      catalogReleaseTag: release.tag_name,
    });
  }
}
let selected;
for (const dish of catalog.dishes) {
  const codeName = `${dish.name?.en} · ${dish.name?.zhHant}`;
  const imageName = basename(String(dish.image?.path ?? ""));
  const asset = assets.get(imageName);
  if (asset && dish.name?.en && dish.name?.zhHant && !usedBodies.includes(codeName)) {
    selected = { codeName, dishId: dish.id, photoAlt: dish.image.alt?.en ?? codeName, ...asset };
    break;
  }
}
if (!selected) {
  const unavailable = { available: false, reason: "No unused dish with a published catalog-v1 photo asset was available." };
  await atomicWrite(output, `${JSON.stringify(unavailable, null, 2)}\n`);
  console.log(unavailable.reason);
} else {
  selected.available = true;
  await atomicWrite(output, `${JSON.stringify(selected, null, 2)}\n`);
  console.log(`Selected unused published dim-sum code name: ${selected.codeName}`);
}
