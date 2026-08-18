import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { inspectIco } from "./icon-core.mjs";

const requested = process.argv.indexOf("--icon");
const iconPath = requested >= 0 ? resolve(process.argv[requested + 1]) : resolve(import.meta.dirname, "../../design/icons/meadowmark.ico");
const entries = inspectIco(await readFile(iconPath));
const actual = entries.map((entry) => entry.width).join(",");
const expected = "16,20,24,32,40,48,64,128,256";
if (actual !== expected) throw new Error(`ICO sizes ${actual} do not match required sizes ${expected}.`);
console.log(`Valid multi-resolution Windows ICO: ${actual}.`);
