import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { generateIco, inspectIco, renderSvg, validateDesign } from "./icon-core.mjs";

async function atomicWrite(path, content) {
  const temporary = resolve(dirname(path), `.${path.split(/[\\/]/).at(-1)}.${randomUUID()}.tmp`);
  await writeFile(temporary, content);
  let finalError;
  try {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        await rename(temporary, path);
        return;
      } catch (error) {
        finalError = error;
        if (!["EPERM", "EACCES", "EBUSY"].includes(error.code)) throw error;
        await new Promise((done) => setTimeout(done, 100 * (attempt + 1)));
      }
    }
    throw finalError;
  } finally {
    await rm(temporary, { force: true });
  }
}

const root = resolve(import.meta.dirname, "../..");
const gate = JSON.parse(await readFile(resolve(root, "release-gate.json"), "utf8"));
const definitionPath = resolve(root, gate.application.masterLogoDefinition);
const sourcePath = resolve(root, gate.application.masterLogo);
const outputPath = resolve(root, gate.application.windowsIcon);
const definition = validateDesign(JSON.parse(await readFile(definitionPath, "utf8")));
const generatedSvg = renderSvg(definition);
const sizes = gate.application.windowsIconSizes;
if (!Array.isArray(sizes) || sizes.join(",") !== "16,20,24,32,40,48,64,128,256") {
  throw new Error("release-gate.json must declare the complete ordered Windows icon size set.");
}
const generatedIco = generateIco(sizes, definition);
const entries = inspectIco(generatedIco);

if (process.argv.includes("--check")) {
  const [committedSvg, committedIco] = await Promise.all([readFile(sourcePath, "utf8"), readFile(outputPath)]);
  inspectIco(committedIco);
  if (committedSvg !== generatedSvg) throw new Error("design/icons/meadowmark-master.svg is stale; regenerate the icon family.");
  if (!committedIco.equals(generatedIco)) throw new Error("design/icons/meadowmark.ico is stale; regenerate the icon family.");
  console.log(`Verified master-bound deterministic Meadowmark icon family: ${entries.map((entry) => entry.width).join(", ")} px.`);
} else {
  await atomicWrite(sourcePath, generatedSvg);
  await atomicWrite(outputPath, generatedIco);
  console.log(`Generated committed SVG and ${entries.length}-frame Windows ICO from ${definitionPath}.`);
}
