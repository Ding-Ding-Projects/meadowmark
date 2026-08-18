/**
 * Public entry point for the app-logo customization subsystem.
 *
 * Everything a caller (IPC handlers, settings UI) needs is re-exported
 * from `manager.ts`. See that file's header comment for the fail-closed
 * contract every operation here follows.
 */
export * from './manager';
