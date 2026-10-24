import { deleteAccount } from "./core.ts";

export function createDeleteAccountHandler(
  supabaseURL: string,
  serviceKey: string,
  fetcher: typeof fetch = fetch,
) {
  const adminHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };

  return (request: Request) =>
    deleteAccount(request, {
      authorize: async () => {
        const response = await fetcher(`${supabaseURL}/auth/v1/user`, {
          headers: {
            apikey: serviceKey,
            Authorization: request.headers.get("authorization") ?? "",
          },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
        if (response.status >= 500) throw new Error("Auth unavailable");
        if (!response.ok) return null;
        return (await response.json()).id ?? null;
      },
      ready: async () => {
        const response = await fetcher(
          `${supabaseURL}/rest/v1/rpc/account_deletion_ready`,
          {
            method: "POST",
            headers: adminHeaders,
            body: "{}",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
          },
        );
        return response.ok && (await response.json()) === true;
      },
      remove: async (userId) => {
        // Auth hard deletion and its database cascades/triggers form one server transaction.
        const response = await fetcher(
          `${supabaseURL}/auth/v1/admin/users/${userId}`,
          {
            method: "DELETE",
            headers: adminHeaders,
            body: JSON.stringify({ should_soft_delete: false }),
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          },
        );
        await response.body?.cancel();
        // Concurrent requests may already have removed this verified identity.
        if (!response.ok && response.status !== 404) {
          throw new Error("Account deletion failed");
        }
      },
    });
}
