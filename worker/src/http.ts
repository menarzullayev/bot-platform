/**
 * Default fetch for production code. The native `fetch` throws "Illegal invocation" in Workers when it is
 * called as a method of another object (e.g. `deps.fetchFn(...)`), so we always go through this wrapper.
 */
export const globalFetch: typeof fetch = (input, init) => fetch(input, init);
