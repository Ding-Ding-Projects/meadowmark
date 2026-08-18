import { extractFile } from "@electron/asar";

const [asarPath, expectedVersion, expectedCommit] = process.argv.slice(2);
if (!asarPath || !expectedVersion || !/^[0-9a-f]{40}$/.test(expectedCommit ?? "")) {
  throw new Error("Usage: inspect-asar-package.mjs <app.asar> <version> <40-character commit>");
}
const metadata = JSON.parse(extractFile(asarPath, "package.json").toString("utf8"));
if (metadata.version !== expectedVersion) throw new Error(`Packaged version ${metadata.version} does not match ${expectedVersion}.`);
if (metadata.build?.commit !== expectedCommit) throw new Error(`Packaged commit ${metadata.build?.commit ?? "<missing>"} does not match ${expectedCommit}.`);
console.log(JSON.stringify({ version: metadata.version, commit: metadata.build.commit }));
