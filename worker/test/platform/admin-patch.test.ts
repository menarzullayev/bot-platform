import { describe, expect, it } from "vitest";
import { handleAdmin } from "../../src/admin";
import { ADMIN, FakeDb, makeEnv, seedBot } from "../helpers";

function patch(body: unknown, auth = ADMIN) {
  return new Request("https://w.test/admin/bots/b1", {
    method: "PATCH",
    headers: { authorization: "Bearer " + auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /admin/bots/:id template switch", () => {
  it("switches template and keeps the token row", async () => {
    const db = new FakeDb();
    await seedBot(db);
    const before = db.bots.get("b1")!.token_enc;
    const res = await handleAdmin(patch({ template: "calc", config: {} }), makeEnv(), { db });
    expect(res.status).toBe(200);
    expect(db.bots.get("b1")!.template).toBe("calc");
    expect(db.bots.get("b1")!.token_enc).toBe(before);
  });
  it("rejects unknown template, bad config, empty body, unknown bot, bad auth", async () => {
    const db = new FakeDb();
    await seedBot(db);
    expect((await handleAdmin(patch({ template: "nope" }), makeEnv(), { db })).status).toBe(400);
    expect((await handleAdmin(patch({ template: "calc", config: { proStars: 0 } }), makeEnv(), { db })).status).toBe(400);
    expect((await handleAdmin(patch({}), makeEnv(), { db })).status).toBe(400);
    expect((await handleAdmin(patch({ enabled: false }, "wrong"), makeEnv(), { db })).status).toBe(401);
    const r = new Request("https://w.test/admin/bots/zz", {
      method: "PATCH",
      headers: { authorization: "Bearer " + ADMIN, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect((await handleAdmin(r, makeEnv(), { db })).status).toBe(404);
  });
});
