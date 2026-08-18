# Meadowmark — design and delivery plan

## What this is

Meadowmark is a real-time town-and-farm building game for Windows, in the spirit of Township.
Crops grow on wall-clock timers, factories turn crops into goods through production chains, orders
and vehicles consume those goods for coins and experience, and coins plus population unlock more
town.

It is built as an Electron desktop application: TypeScript throughout, a genuine 3D world rendered
with three.js, and a Material Design 3 interface layered over it.

**Nothing in Meadowmark is ever for sale.** Township is free-to-play with purchasable currency;
this game has no store, no premium tier, no advertising, and no prompt asking anyone for money.
Premium currency is earned only, through play. Every capability is available to everyone who runs
it.

## Decisions

| Decision | Choice |
|---|---|
| Scope | The full game — core loop, city depth, helicopter, ship, zoo, mine, expansions, boosters, achievements, local co-op |
| Rendering | Real 3D, low-poly, three.js with procedurally generated meshes and real lighting |
| Camera | Full freedom: zoom, pan, rotate and tilt |
| Art | Generated in code from a mesh language — no texture files, no downloaded assets |
| Platform | Windows only |
| Distribution | Squirrel.Windows installer, unsigned, published as a GitHub Release |

The camera choice has a consequence worth stating: because the player can orbit freely, every
building must read correctly from all sides. There are no front-only facades here.

---

# Gameplay

Everything runs on the wall clock. Nothing withers, nothing is lost by being away, and no timer can
be bought past with money — only with earned currency or by waiting.

## Currencies and progression

| | Earned from | Spent on |
|---|---|---|
| **Coins** | orders, train, ship, helicopter, selling goods, town charm | seeds, buildings, plots, expansions, barn upgrades |
| **Cash** (earned only) | levelling up, daily-task chest, achievements, ship chests, museum exhibits, selling gems | rushing timers, extra queue slots, rerolling orders, zoo decorations |
| **Experience** | every harvest, production, order, delivery and build | the level curve |
| **Population** | houses | gates community buildings and factory count |
| **Energy** | +1 every 2 minutes to a cap of 100, restaurant meals, mine finds | mine digging, 1 per tile |
| **Barn space** | upgrades bought with train materials | caps every stored good |

Level curve: `xpToNext(L) = round(60 · L^1.55)` — 60 at level 1, about 2,100 at level 10, 12,000 at
30, 28,000 at 50. Levels continue past 100. Each level pays coins and 2 cash, and usually unlocks
something new.

Rushing any timer costs `max(1, ceil(remainingMinutes / 5))` cash. A small pool of village helpers
also shaves time for free on a cooldown.

## Fields and crops

Six plots to start, buyable with coins on an escalating curve up to sixty. Plant-all and
harvest-all are single actions, and they report honest partial results when the barn fills partway
through rather than pretending the whole sweep succeeded.

| Crop | Level | Grow | | Crop | Level | Grow |
|---|---|---|---|---|---|---|
| Wheat | 1 | 2 min | | Rice | 33 | 4 h |
| Corn | 3 | 5 min | | Pumpkin | 38 | 6 h |
| Carrot | 6 | 10 min | | Chilli | 44 | 8 h |
| Sugarcane | 9 | 20 min | | Coffee bean | 50 | 10 h |
| Cotton | 12 | 40 min | | Lavender | 56 | 12 h |
| Strawberry | 16 | 1 h | | Grape | 62 | 14 h |
| Tomato | 20 | 1 h 30 | | Blueberry | 70 | 16 h |
| Potato | 24 | 2 h | | Vanilla | 80 | 20 h |
| Soybean | 28 | 3 h | | | | |

Animals run as a parallel branch fed by animal feed: chickens (eggs, 20 min), cows (milk, 1 h),
sheep (wool, 2 h), pigs (bacon, 4 h), goats (5 h) and bees (honey, 8 h). Each species needs its
shed, and sheds upgrade for more slots.

## Factories and production chains

About twenty-two factories, each with a production queue starting at two slots and upgradeable to
six, unlocking by level. Production continues while the application is closed. **A full barn pauses
a queue and the interface says so plainly** rather than silently discarding output.

Chains run up to three tiers deep. Cake is flour (from wheat) plus cream (from milk) plus sugar
(from sugarcane) plus an egg. Pizza is dough plus cheese plus tomato. Perfume is lavender essence
plus alcohol plus a glass bottle from the mine foundry.

Bakery, Feed Mill, Mill, Dairy, Sugar Mill, Textile, Preserves, Snack, Bottler, Pizzeria,
Ice Cream, Candy, Sauce, Tailor, Sawmill, Cosmetics, Furniture, Coffee House, Jewellery,
Chocolate, Winery, Toy Factory.

## The four consumers

- **Order board** — six slots, each wanting one to three goods at level-scaled quantities, paying
  coins, experience and up to two reputation stars. Orders are generated only from goods the player
  can actually produce, so an impossible order never appears. A completed slot refills after about
  three minutes; rerolling costs 1 cash.
- **Train** — three outbound wagons wanting goods, returning **building materials** (planks, bricks,
  nails, glass, slabs, paint, screws) on a twenty-to-sixty-minute round trip. Materials are the only
  route to town buildings and barn upgrades, which is what stops coins alone from buying the city.
- **Helicopter** — two small fast orders every half hour, paying coins and reputation. A filled
  reputation bar opens a chest of cash, boosters and animal cards.
- **Ship** — at the dock, from level 18. Six crates of three goods each on a twenty-four-hour
  window. Each crate pays coins and experience; clearing all six opens a chest with cash, animal
  cards and expansion permits.

## The town

A 3D grid the player builds on directly.

- **Houses** cost coins and materials, take ten minutes to six hours to build, and each adds 8 to 40
  population.
- **Community buildings** are gated behind population, and each switches a system on: Town Hall,
  Farmers Market, Train Station (8), Dock (18), Mine (22), Zoo (25), Museum (30), Restaurant,
  Cinema, School, Hospital, Fire Station, Airport, Sports Arena.
- **Decorations** feed a *town charm* score paying a small daily coin bonus, so cosmetics are never
  purely cosmetic.
- **Roads** connect it all, and villagers walk them. The town is alive whether or not you are.
- **Expansions** — around forty land parcels, each costing escalating coins and two to six permits
  earned from ship chests, the mine and achievements.

## Zoo, from level 25

Enclosures by habitat: grass, water, rock, arctic. Animal cards drop from ship chests, the mine and
orders, and collecting a full card set for a species hatches it. Animals draw visitors, visitors pay
coins and zoo currency, and matching a species to its habitat or grouping families pays bonuses —
so enclosure layout is a real decision rather than a shelf.

## Mine, from level 22

A grid of rock beneath the town, one energy per tile dug. Tiles hide ore (copper, iron, silver,
gold, platinum), gems, tools (picks, dynamite clearing a cross, TNT clearing a block) and artifact
fragments. Six fragments complete an artifact, which goes to the Museum for cash and a small
permanent bonus. The foundry smelts ore into bars, feeding jewellery, furniture and perfume. The
mine regenerates daily.

## Boosters, achievements, dailies and the village

Boosters — earned only — double grow speed, double factory speed, speed the train, refill energy,
reroll orders, or grant temporary barn overflow. Around forty tiered achievements pay cash and
coins. Five daily tasks are seeded from the local date, with a completion chest and a streak.

**The village is the co-operative mode, and it is entirely local.** Named offline villagers post
requests and help with tasks, and a weekly local regatta runs a task list against a score bar. The
game makes no network calls at all — no accounts, no telemetry, no leaderboard, no other players —
and the interface says so plainly rather than implying company that is not there.

## Coming back

On resume the simulation ticks forward by the elapsed time, clamped to thirty days. Timers
complete, production runs until the barn fills, animals finish, the mine regenerates, and a summary
shows exactly what happened while you were gone.

---

# The 3D

three.js on WebGL2, bundled into the installer. No CDN, no remote assets; it works with the network
unplugged.

**Camera.** A perspective camera at a narrow field of view and long distance, which gives the
miniature tilt-shift diorama read rather than a flat isometric one. Yaw is unrestricted with an
optional snap to four corners, pitch is clamped between 20 and 75 degrees, zoom is clamped, and pan
is bounded to the town plus a margin so the town cannot be lost off-screen. Every camera action has
a keyboard equivalent; the world is not mouse-only.

**Assets are generated, not authored.** A committed mesh language — boxes, prisms, extruded
polygons, roofs, lathes — builds every building, crop, animal and prop in code, vertex-coloured
from a semantic palette. It is deterministic, so an asset change is a reviewable diff; there are no
binary art files to lose track of; and the whole world restyles when the palette changes.

**Lighting.** Hemisphere fill plus a directional sun with soft shadows and contact shadows, and a
subtle day/night cycle following the real local clock that can be switched off.

**Performance.** Instanced meshes for crops, trees, props and villagers, merged static geometry per
chunk, and a billboard level-of-detail swap at far zoom, targeting 60fps at 1080p on integrated
graphics. Render quality is exposed both as the raw advanced values and as a novice Speed level 1
to 5 mapped onto them, with the mapping documented so it can be checked rather than trusted. When
the raw values match no level, the control reports Custom rather than snapping.

**Placement** uses a ghost mesh with a valid/invalid tint, grid snap, `R` to rotate, and a
squash-stretch pop on drop that reduced-motion disables. Picking raycasts against a simplified
collider set, never against full geometry.

---

# Architecture

```
build.bat  build-installer.bat  download-dependencies.bat
packages/
  shared/   pure TypeScript: rules, economy, save schema, seeded RNG, tick()
  engine/   three.js scene, camera, mesh language, instancing, picking, placement
  ui/       Material Design 3 interface: panels, tabs, settings, palette, dialogs
  app/      Electron main and preload: window, IPC, stores, local history
tools/      mesh generation, line counter, completeness checks
balance/    crops, recipes, buildings, unlocks — data, with a validator
docs/       feature articles and the documentation site
```

**The simulation is headless and deterministic.** Everything in `shared` runs with no three.js and
no DOM, driven by `tick(state, elapsedMs) -> state` over a seeded random number generator. The
engine renders state and never owns it. This is what makes the game testable at all, and it is what
makes offline progress the same code path as live play rather than a second implementation that
quietly drifts from the first.

**Balance lives in data**, not in code, with a validator proving no recipe is unreachable, no
unlock is orphaned and no chain contains a cycle.

**Saves** are versioned JSON written through an atomic-write helper that retries the rename on
`EPERM`, `EACCES` and `EBUSY`. This is not defensive decoration: on Windows a rename fails with a
sharing violation whenever the destination is momentarily open, and a virus scanner, the search
indexer or a sync client opens every file you just wrote. Without the retry a save intermittently
throws and the town is gone — and it happens most often on the best-protected machines. A scan
refuses a bare `fs.rename` anywhere in the tree so the helper cannot be bypassed by accident.

---

# Delivery

Work is split into independent lanes, each on its own branch in its own worktree, integrated and
published as it becomes ready rather than batched to the end.

| Lane | Contents |
|---|---|
| Foundation | Workspace, TypeScript, Electron shell, unsigned Squirrel packaging, one-click build scripts, release workflow, line counter, completeness inventory, atomic-write helper |
| Simulation | State shape, save schema and migrations, `tick`, economy, fields, animals, factories, orders, train, helicopter, ship, town, expansions, zoo, mine, boosters, achievements, dailies, village, offline resume, balance data and validator |
| Engine | three.js scene, mesh language, generated buildings and nature and props and characters, free-orbit camera, lighting, instancing, picking, placement, villagers |
| Interface | Material Design 3 system, HUD, every game panel, language modes, settings, search with regex builders, notifications, destructive-action gate, command palette |
| Site and release | Documentation site, captures of the real build, the published installer |

## Verification, and its stated limits

The simulation is checked by running the real `tick` over long horizons and asserting that
`tick(24h)` equals 1,440 applications of `tick(1min)` — offline progress is the one bug class every
player notices. Anything crossing the Electron preload bridge is checked against the real bridge,
because a test with an injected host proves the screen and nothing about the wiring. The 3D is
measured rather than eyeballed, with draw-call and instance counts recorded per release so a
regression shows up as arithmetic. Screenshots are taken from the installed build, never from the
development server.

Checks run locally, in the change that introduces them. The release workflow deliberately runs no
tests and no linting — it builds, packages and publishes. That is a standing project decision and
not an oversight, and it means a release can ship from a commit whose checks would have failed.
Release notes state which checks actually ran.

## Not in scope

- No macOS or Linux builds.
- No code signing, ever. The installer is unsigned and will show an unknown-publisher warning; the
  release notes say so rather than implying otherwise.
- No payments, store, premium tier or nagging.
- No network features of any kind.
