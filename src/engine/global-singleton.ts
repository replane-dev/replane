const globalSingletons = new Map<string, any>();

// we have to use global singletons instead of module-level singletons
// because Next.js uses turbopack runtime which isn't used for
// proxy.ts and instrumentation. Only after instrumentation and proxy are running
// turbopack runtime is used. turbopack initializes modules separately, so we
// can have two module level singletons for the same module.
export function getGlobalSingleton<T>(name: string, init: () => T): T {
  // to enable hot reloading in development mode
  if (process.env.NODE_ENV === 'development') {
    if (!globalSingletons.has(name)) {
      globalSingletons.set(name, init());
    }
    return globalSingletons.get(name);
  }

  const token = `__globalSingleton_${name}`;
  if (!(globalThis as any)[token]) {
    (globalThis as any)[token] = init();
  }
  return (globalThis as any)[token];
}
