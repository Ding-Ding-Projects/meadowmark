import {
  PERSONAL_VOCABULARY_MAX_ENTRIES,
  UNIVERSAL_SURFACE_IDS,
  assertUniversalSurfaceContract,
  scheduleMatches,
  validatePersonalVocabulary,
  type ScheduleRule,
} from "./state";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Focused executable contract Chut, intentionally framework-free. */
export function runUniversalContractTests(): void {
  assertUniversalSurfaceContract(UNIVERSAL_SURFACE_IDS);

  let guardTurnedRed = false;
  try { assertUniversalSurfaceContract(UNIVERSAL_SURFACE_IDS.filter((id) => id !== "security")); }
  catch { guardTurnedRed = true; }
  assert(guardTurnedRed, "The negative surface guard did not turn red when security disappeared.");

  const valid = validatePersonalVocabulary('{"version":1,"replacements":{"hello":"world"}}');
  assert(valid.ok && valid.value?.replacements.hello === "world", "Valid vocabulary was rejected.");
  assert(!validatePersonalVocabulary('{"version":1,"replacements":{"__proto__":"no"}}').ok, "Unsafe vocabulary key was accepted.");
  assert(!validatePersonalVocabulary('{"version":2,"replacements":{}}').ok, "Unknown vocabulary version was accepted.");
  const tooMany = Object.fromEntries(Array.from({ length: PERSONAL_VOCABULARY_MAX_ENTRIES + 1 }, (_, index) => [`k${index}`, "v"]));
  assert(!validatePersonalVocabulary(JSON.stringify({ version: 1, replacements: tooMany })).ok, "Unbounded vocabulary was accepted.");

  const overnight: ScheduleRule = { id: "night", label: "Night", enabled: true, weekdays: [1], startTime: "22:00", endTime: "06:00", language: "en", theme: null };
  const mondayLate = new Date(2026, 7, 17, 23, 30);
  assert(scheduleMatches(overnight, mondayLate), "Cross-midnight schedule did not match its opening day.");
  assert(!scheduleMatches({ ...overnight, startTime: "22:00", endTime: "22:00" }, mondayLate), "Equal-time schedule failed closed.");
}
