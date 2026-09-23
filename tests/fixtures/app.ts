// Test-only upstream substitution: never contact the real FPL API.
const nativeFetch = globalThis.fetch;
globalThis.fetch = Object.assign(
  (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "fantasy.premierleague.com") {
      return nativeFetch(`${process.env.TEST_UPSTREAM}${url.pathname}`, init);
    }
    return nativeFetch(input, init);
  },
  nativeFetch,
);
await import("../../index.ts");
