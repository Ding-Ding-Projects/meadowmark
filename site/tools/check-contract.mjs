#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const text = (path) => readFileSync(resolve(root, path), "utf8").replace(/\r\n?/g, "\n");
const capabilities = text("capabilities.html");
const runtime = text("js/capabilities.js");
const appRuntime = text("js/app.js");
const nav = JSON.parse(text("data/nav.json"));
const release = JSON.parse(text("data/release.json"));
const changelog = JSON.parse(text("data/changelog.json"));

const requiredIds = [
  "cap-status-host", "cap-display-name", "cap-vocab-file", "cap-vocab-clear",
  "cap-schedule-form", "cap-schedule-list", "cap-logo-file", "cap-logo-preview",
  "cap-convert-files", "cap-adapter-catalog", "cap-queue", "cap-ollama-check",
  "cap-ollama-status", "cap-lock-target", "cap-lock-password", "cap-support",
  "cap-ticket-form", "cap-otp-uri", "cap-qr-input", "cap-group-search",
  "cap-master-search", "cap-history-search", "cap-history-list",
  "cap-notification-centre",
];
requiredIds.forEach((id) => assert.match(capabilities, new RegExp(`\\bid=["']${id}["']`), `missing exact surface id ${id}`));

const requiredRuntimeSymbols = [
  "assertNoDuplicateKeys", "validateVocabulary", "scheduleMatches", "detectImage",
  "ADAPTERS", "convertItem", "ollamaFetch", "lockVerifier", "wireTickets",
  "parseOtp", "totp", "wireDiscovery", "wireHistory", "wireNotifications",
];
requiredRuntimeSymbols.forEach((symbol) => assert.match(runtime, new RegExp(`\\b${symbol}\\b`), `missing runtime contract ${symbol}`));
assert.match(appRuntime, /\bapplyLocalBrand\b/, "saved display name and logo must reach the shared site header");

const sandbox = {
  window: {}, console, Blob, URL, TextEncoder, Uint8Array, ArrayBuffer, DataView,
  crypto: globalThis.crypto, performance, setTimeout, clearTimeout, setInterval, clearInterval,
};
sandbox.window.window = sandbox.window;
runInNewContext(runtime, sandbox, { filename: "site/js/capabilities.js" });
const browserContract = sandbox.window.MMCapabilities;
assert.equal(browserContract.validateVocabulary('{"version":1,"replacements":{"Farm":"Town"}}').replacements.Farm, "Town");
assert.throws(() => browserContract.validateVocabulary('{"version":1,"version":1,"replacements":{}}'), /Duplicate key/);
assert.throws(() => browserContract.validateVocabulary('{"version":1,"replacements":{"__proto__":"x"}}'), /Unsafe replacement key/);
assert.equal(browserContract.scheduleMatches({ enabled: true, days: [2], start: "22:00", end: "06:00" }, new Date("2026-08-18T23:30:00")), true);
assert.throws(() => browserContract.parseOtp("otpauth://totp/test?secret="), /Secret is missing/);
const rfcConfig = browserContract.parseOtp("otpauth://totp/RFC?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&algorithm=SHA1&digits=8&period=30");
assert.equal(await browserContract.totp(rfcConfig, 59000), "94287082", "TOTP must match the RFC 6238 SHA-1 vector at 59 seconds");

assert.equal(nav.filter((item) => item.id === "capabilities" && item.href === "/capabilities.html").length, 1, "capabilities navigation item must exist exactly once");
assert.equal(release.schemaVersion, 2);
assert.equal(release.currentBaseline.published, true);
assert.equal(release.currentBaseline.tag, "v0.1.51");
assert.equal(release.currentBaseline.targetCommit, "e5335a146844543ea2747862722821eaaf62828d");
assert.equal(release.currentBaseline.installer.sha256, "130b19f431a26215b872d1031aafbaf6e3cf63f6a1f82db8d493cad2aefe0646");
assert.equal(release.pendingRelease.published, false);
assert.equal(release.pendingRelease.tag, null);
assert.ok(changelog.length > 0);
assert.equal(changelog[0].version, "v0.1.51");
assert.equal(changelog[0].commit, "e5335a146844543ea2747862722821eaaf62828d");
changelog.forEach((entry) => {
  assert.equal(entry.status, "published");
  assert.equal(entry.releaseTag, entry.version);
  assert.match(entry.commit, /^[0-9a-f]{40}$/);
});

assert.match(capabilities, /Nothing is sent anywhere\./, "Support Tickets must state the no-network boundary");
assert.match(capabilities, /Browser storage is not an operating-system credential vault/, "authenticator must state the browser-vault limitation");
assert.match(runtime, /No bundled offline PDF adapter/, "converter must keep unavailable PDF tooling visible");
assert.match(capabilities, /No proxy, cloud model, or guessed catalog is used/, "Ollama boundary must refuse a proxy or guessed catalog");
assert.match(capabilities, /QR generation and camera scanning are unavailable/, "QR limitation must be explicit");
assert.match(capabilities, /No dim-sum photograph or catalog is bundled/, "dim-sum asset limitation must be explicit");

const externalScripts = [...capabilities.matchAll(/<script\b[^>]*\bsrc=["'](https?:\/\/[^"']+)/gi)].map((match) => match[1]);
const externalStyles = [...capabilities.matchAll(/<link\b(?=[^>]*\brel=["'][^"']*\bstylesheet\b)(?=[^>]*\bhref=["']https?:\/\/)[^>]*>/gi)].map((match) => match[0]);
assert.deepEqual([...externalScripts, ...externalStyles], [], "capabilities page must not load scripts or styles from external origins");

const forbiddenMarketing = /\b(?:buy now|premium tier|subscription|checkout|purchase price|trial expires)\b/i;
assert.doesNotMatch(capabilities + runtime, forbiddenMarketing, "site tools must not introduce monetization");

console.log(`PASS site contract: ${requiredIds.length} surfaces, ${requiredRuntimeSymbols.length} runtime contracts, release ${release.currentBaseline.tag}`);
