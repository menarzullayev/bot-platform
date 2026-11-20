import { afterEach, describe, expect, it, vi } from "vitest";
import { globalFetch } from "../../src/http";

describe("globalFetch", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("works when called as an object method (Workers: native fetch would throw Illegal invocation)", async () => {
    const strict = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Illegal invocation");
      return Promise.resolve(new Response("ok"));
    };
    vi.stubGlobal("fetch", strict);
    const holder = { fetchFn: globalFetch };
    const res = await holder.fetchFn("https://example.test/");
    expect(await res.text()).toBe("ok");
  });
});
