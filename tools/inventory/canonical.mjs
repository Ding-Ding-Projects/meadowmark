export const INVENTORY_SCHEMA_VERSION = 2;

export const EVIDENCE_FIELDS = Object.freeze([
  'implementation',
  'article',
  'localization',
  'tests',
  'persistence',
  'bundledArtifactProof',
  'builtArtifactInteraction',
  'capture',
]);

export const STATUS_VALUES = Object.freeze(['missing', 'partial', 'done']);

// Evidence classes are deliberately not interchangeable. A package manifest,
// for example, cannot impersonate an article, focused test, or real capture.
export const EVIDENCE_PATH_RULES = Object.freeze({
  implementation: /^(?:packages\/(?:app|shared|engine|renderer|ui)\/src\/.+\.(?:ts|tsx|js|mjs|cjs|css|html)|site\/(?:js\/.+\.(?:js|mjs)|.+\.html))$/,
  article: /^(?:docs\/.+\.md|site\/docs\/.+\.html)$/,
  localization: /^(?:packages\/.+\/(?:i18n|locales?|localization)\/.+\.(?:ts|tsx|js|json)|site\/js\/i18n\.js)$/,
  tests: /(?:^|\/)(?:tests?|__tests__|specs?|guards)(?:\/|$)|\.(?:test|spec)\.(?:ts|tsx|js|mjs)$|\/self-test\.mjs$/,
  persistence: /^packages\/.+\/src\/.*(?:store|storage|history|persist|repository|database|settings|atomic-write|skip-budget)[^/]*\.(?:ts|tsx|js|mjs)$/,
  bundledArtifactProof: /^(?:packages\/.+\/(?:build|package)\.mjs|tools\/.*(?:bundle|artifact|packag)[^/]*\.(?:js|mjs|json))$/,
  builtArtifactInteraction: /^(?:tools\/.*(?:interaction|smoke|capture)[^/]*\.(?:js|mjs|json)|docs\/assets\/interaction-manifests\/.+\.json)$/,
  capture: /^docs\/assets\/captures\/.+\.(?:png|jpe?g|webp)$/,
});

export const CANONICAL_CONTRACTS = Object.freeze([
  ['language-modes', 'Language modes (English / Cantonese / Bilingual)'],
  ['funny-level-sliders', 'Per-language funny-level sliders (1-5, English and Cantonese independently)'],
  ['emoji-toggle', 'Show emojis in dialogs and message boxes toggle'],
  ['school-mode', 'School mode (universal, shared credential, forces English)'],
  ['narrator', 'Spoken narrator with per-language voice pickers'],
  ['scheduled-settings', 'Scheduled language/appearance/external settings sources'],
  ['regex-builders', 'Anchored full regex builder on every search field, dropdown, and context menu'],
  ['notification-centre', 'Non-blocking notifications with a reviewable history/centre'],
  ['material3-appearance-editors', 'Material Design 3 appearance system with per-element Edit appearance editors'],
  ['tabs-groups-searches', 'Browser-style tabbed navigation, tab groups, and the four tab-discovery searches'],
  ['landing-page-offline-docs', 'Material Design 3 landing page and bundled offline documentation browser'],
  ['command-palette', 'Command palette (Ctrl+Shift+F) with teleport-to-element results'],
  ['destructive-action-confirmation', 'Two-key destructive-action super-confirmation gate'],
  ['local-history', 'Local Git-backed version history for saves, settings, and other user records'],
  ['changelog-viewer', 'In-app changelog viewer with date filter, search, and per-entry commit links'],
  ['external-editor-handoff', 'Open in external editor (VS Code) handoff for exports'],
  ['exports', 'Export every record/view/list/log/document in every applicable format'],
  ['bulk-actions', 'Bulk actions on every list, table, grid, and collection'],
  ['accessibility', 'Keyboard reachability, focus, roles/names/states, contrast, reduced-motion'],
  ['responsive-sizing', 'No clipping/truncation at supported window sizes, scales, densities, languages'],
  ['personal-vocabulary-upload', 'Local personal-vocabulary JSON upload control'],
  ['toy-locks-support-tickets', 'Per-element toy locks (password/TOTP) and the Support Tickets recovery route'],
  ['unlock-ladder', 'The unlock ladder (dim sum -> sums -> whack-a-mole -> clock)'],
  ['shared-link-embed-graphic', 'Product-specific Open Graph / shared-link embed graphic'],
  ['app-logo-customization', 'App-logo customization (presets + local custom upload + safe conversion)'],
  ['file-conversion', 'Universal local file converter'],
  ['ollama-suite-manager', 'Universal local Ollama suite manager'],
  ['status-reporting', 'Live status reporting surface'],
  ['dim-sum-surprise', 'Dim-sum startup surprise'],
  ['browser-download-start', 'Browser-extension Start download surface'],
  ['browser-download-progress', 'Browser-extension active Downloading surface'],
  ['browser-download-complete', 'Browser-extension completion surface'],
  ['display-name', 'App display-name rename/reset'],
  ['automatic-updates', 'Automatic-update states, manual check, and restart'],
  ['totp-registration-qr', 'QR-based TOTP registration'],
  ['built-in-authenticator', 'Built-in authenticator'],
  ['settings-explanations', 'Settings explanations and default provenance'],
  ['guided-forms', 'Guided forms and native path browsing'],
  ['rich-live-controls', 'Rich live controls wherever values appear'],
  ['context-menu-shortcuts', 'Context-menu shortcut display'],
  ['in-place-operation-progress', 'In-place long-operation progress and re-entry refusal'],
  ['provider-markup-renderer', 'Shared provider-authored-markup renderer'],
  ['forge-publishing', 'Forge multi-account, owner, and copy-and-push flow'],
  ['collapsible-filters-statistics', 'Collapsible filters and statistics'],
  ['release-dim-sum-codename', 'Release dim-sum code-name presentation'],
].map(([id, title]) => Object.freeze({ id, title })));

export const CANONICAL_SURFACES = Object.freeze([
  ['desktop-app', 'desktop-app', null, 'Packaged Windows desktop application'],
  ['site-home', 'site-endpoint', 'site/index.html', 'Documentation site home'],
  ['site-settings', 'site-endpoint', 'site/settings.html', 'Documentation site settings'],
  ['site-changelog', 'site-endpoint', 'site/changelog.html', 'Documentation site changelog'],
  ['site-capabilities', 'site-endpoint', 'site/capabilities.html', 'Documentation site capability inventory'],
  ['site-og-fallback-source', 'site-endpoint', 'site/img/og-fallback.html', 'Open Graph fallback source page'],
  ['site-docs-index', 'site-endpoint', 'site/docs/index.html', 'Documentation index'],
  ['site-docs-achievements', 'site-endpoint', 'site/docs/achievements.html', 'Achievements documentation'],
  ['site-docs-animals', 'site-endpoint', 'site/docs/animals.html', 'Animals documentation'],
  ['site-docs-boosters', 'site-endpoint', 'site/docs/boosters.html', 'Boosters documentation'],
  ['site-docs-camera-rendering', 'site-endpoint', 'site/docs/camera-rendering.html', 'Camera and rendering documentation'],
  ['site-docs-dailies', 'site-endpoint', 'site/docs/dailies.html', 'Dailies documentation'],
  ['site-docs-expansions', 'site-endpoint', 'site/docs/expansions.html', 'Expansions documentation'],
  ['site-docs-factories', 'site-endpoint', 'site/docs/factories.html', 'Factories documentation'],
  ['site-docs-fields-crops', 'site-endpoint', 'site/docs/fields-crops.html', 'Fields and crops documentation'],
  ['site-docs-helicopter', 'site-endpoint', 'site/docs/helicopter.html', 'Helicopter documentation'],
  ['site-docs-mine', 'site-endpoint', 'site/docs/mine.html', 'Mine documentation'],
  ['site-docs-museum', 'site-endpoint', 'site/docs/museum.html', 'Museum documentation'],
  ['site-docs-order-board', 'site-endpoint', 'site/docs/order-board.html', 'Order board documentation'],
  ['site-docs-progression', 'site-endpoint', 'site/docs/progression.html', 'Progression documentation'],
  ['site-docs-saves-offline', 'site-endpoint', 'site/docs/saves-offline.html', 'Saves and offline documentation'],
  ['site-docs-ship', 'site-endpoint', 'site/docs/ship.html', 'Ship documentation'],
  ['site-docs-town', 'site-endpoint', 'site/docs/town.html', 'Town documentation'],
  ['site-docs-train', 'site-endpoint', 'site/docs/train.html', 'Train documentation'],
  ['site-docs-village', 'site-endpoint', 'site/docs/village.html', 'Village documentation'],
  ['site-docs-zoo', 'site-endpoint', 'site/docs/zoo.html', 'Zoo documentation'],
].map(([id, kind, endpoint, title]) => Object.freeze({ id, kind, endpoint, title })));

export const EXPECTED_CONTRACT_COUNT = 45;
export const EXPECTED_SURFACE_COUNT = 26;

export const NON_ENDPOINT_HTML = Object.freeze([
  Object.freeze({ path: 'site/partials/footer.html', reason: 'Build-time footer fragment; not independently navigable content.' }),
  Object.freeze({ path: 'site/partials/header.html', reason: 'Build-time header fragment; not independently navigable content.' }),
]);
