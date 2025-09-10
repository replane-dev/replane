// Deprecated: migrations now run from the custom server before startup.
// Keeping a no-op register to avoid any side effects if Next tries to load it locally.
export async function register() {
  // no-op
}
