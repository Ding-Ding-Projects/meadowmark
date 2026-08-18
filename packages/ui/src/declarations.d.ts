/**
 * Ambient module declarations so importing a stylesheet directly from a .ts
 * entry point (`import "./tokens.css"`) type-checks under tsc. The actual
 * asset handling is the host bundler's responsibility (expected to be
 * Vite or a similar CSS-import-aware bundler, per packages/app).
 */
declare module "*.css";
