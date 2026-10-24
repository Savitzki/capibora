import { strict as assert } from "node:assert";
import { createDeleteAccountHandler } from "./service.ts";
const me = "d7450000-0000-4000-8000-000000000001";
const base = "https://synthetic.supabase.invalid";
const request = () =>
  new Request("https://example.invalid/delete-account", {
    method: "POST",
    headers: {
      authorization: "Bearer captured-session",
      "content-type": "application/json",
    },
    body: JSON.stringify({ confirmation: "EXCLUIR MINHA CONTA" }),
  });
Deno.test("Auth verification, readiness and hard deletion use bounded, distinct credentials", async () => {
  const calls: {
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
  }[] = [];
  const handler = createDeleteAccountHandler(
    base,
    "synthetic-admin",
    (async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
      });
      if (String(url).endsWith("/auth/v1/user")) {
        return Response.json({
          id: me,
        });
      }
      if (String(url).endsWith("/rpc/account_deletion_ready")) {
        return Response
          .json(true);
      }
      return Response.json({});
    }) as typeof fetch,
  );
  assert.equal((await handler(request())).status, 200);
  assert.equal(
    calls[0].headers.get("Authorization"),
    "Bearer captured-session",
  );
  assert.equal(calls[1].headers.get("Authorization"), "Bearer synthetic-admin");
  assert.equal(calls[2].url, `${base}/auth/v1/admin/users/${me}`);
  assert.equal(calls[2].method, "DELETE");
  assert.deepEqual(JSON.parse(String(calls[2].body)), {
    should_soft_delete: false,
  });
});
Deno.test("expired Auth, absent migration and provider failure cannot produce successful deletion", async () => {
  for (const failure of ["auth", "migration", "delete"]) {
    let deletes = 0;
    const handler = createDeleteAccountHandler(
      base,
      "synthetic-admin",
      (async (url) => {
        if (String(url).endsWith("/auth/v1/user")) {
          return failure === "auth"
            ? new Response(null, { status: 401 })
            : Response.json({ id: me });
        }
        if (
          String(url).endsWith("/rpc/account_deletion_ready")
        ) return Response.json(failure !== "migration");
        deletes++;
        return new Response("private details", { status: 500 });
      }) as typeof fetch,
    );
    const result = await handler(request());
    assert.equal(
      result.status,
      failure === "auth" ? 401 : failure === "migration" ? 503 : 502,
    );
    assert.equal(deletes, failure === "delete" ? 1 : 0);
    assert(!JSON.stringify(await result.json()).includes("private details"));
  }
});
Deno.test("a concurrent hard deletion can return 404 after verified identity", async () => {
  const handler = createDeleteAccountHandler(
    base,
    "synthetic-admin",
    (async (url) => {
      if (String(url).endsWith("/auth/v1/user")) {
        return Response.json({
          id: me,
        });
      }
      if (String(url).endsWith("/rpc/account_deletion_ready")) {
        return Response
          .json(true);
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch,
  );
  assert.equal((await handler(request())).status, 200);
});
