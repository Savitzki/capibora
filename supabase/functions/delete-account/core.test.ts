import { strict as assert } from "node:assert";
import { deleteAccount } from "./core.ts";

const me = "d7450000-0000-4000-8000-000000000001";
function request(
  body: unknown = { confirmation: "EXCLUIR MINHA CONTA" },
  authorization = "Bearer synthetic",
) {
  return new Request("https://example.invalid/delete-account", {
    method: "POST",
    headers: { authorization, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function dependencies() {
  const removed: string[] = [];
  return {
    removed,
    authorize: async (): Promise<string | null> => me,
    ready: async () => true,
    remove: async (id: string) => {
      removed.push(id);
    },
  };
}
Deno.test("deletes only the identity verified by Auth after explicit confirmation", async () => {
  const deps = dependencies();
  const result = await deleteAccount(request(), deps);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { deleted: true });
  assert.deepEqual(deps.removed, [me]);
  assert.equal(result.headers.get("Cache-Control"), "no-store");
});
for (
  const body of [
    null,
    [],
    {},
    { confirmation: true },
    { confirmation: "EXCLUIR" },
    { confirmation: "EXCLUIR MINHA CONTA", user_id: "another-user" },
    { confirmation: "x".repeat(600) },
  ]
) {
  Deno.test(`rejects invalid confirmation or client-selected targets: ${JSON.stringify(body).slice(0, 80)}`, async () => {
    const deps = dependencies();
    assert.equal((await deleteAccount(request(body), deps)).status, 400);
    assert.deepEqual(deps.removed, []);
  });
}
Deno.test("missing/expired credentials never reach the administrative delete", async () => {
  const deps = dependencies();
  deps.authorize = async () => null;
  assert.equal((await deleteAccount(request(), deps)).status, 401);
  assert.equal((await deleteAccount(request(undefined, ""), deps)).status, 401);
  assert.deepEqual(deps.removed, []);
});
Deno.test("requires the database privacy migration and never reports success on failure", async () => {
  const deps = dependencies();
  deps.ready = async () => false;
  assert.equal((await deleteAccount(request(), deps)).status, 503);
  assert.deepEqual(deps.removed, []);
  deps.ready = async () => true;
  deps.remove = async () => {
    throw new Error("private provider details");
  };
  const result = await deleteAccount(request(), deps);
  assert.equal(result.status, 502);
  assert(
    !JSON.stringify(await result.json()).includes("private provider details"),
  );
});
Deno.test("preflight and unsupported methods do not access credentials or delete", async () => {
  const deps = dependencies();
  deps.authorize = async () => {
    throw new Error("Must not authorize");
  };
  assert.equal(
    (await deleteAccount(
      new Request("https://example.invalid", { method: "OPTIONS" }),
      deps,
    )).status,
    204,
  );
  assert.equal(
    (await deleteAccount(new Request("https://example.invalid"), deps)).status,
    405,
  );
  assert.deepEqual(deps.removed, []);
});
