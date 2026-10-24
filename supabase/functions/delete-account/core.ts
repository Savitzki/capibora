import { readLimitedJson } from "../_shared/request-json.ts";

type Dependencies = {
  authorize: () => Promise<string | null>;
  ready: () => Promise<boolean>;
  remove: (authenticatedUserId: string) => Promise<void>;
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const uuid = /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
/** No target ID is accepted from the client, and no admin error is disclosed. */
export async function deleteAccount(request: Request, deps: Dependencies) {
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: cors });
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    return reply({ error: "Unauthorized" }, 401);
  }
  let userId: string | null;
  try {
    userId = await deps.authorize();
  } catch {
    return reply({ error: "Não foi possível verificar a sessão" }, 503);
  }
  if (!userId || !uuid.test(userId)) {
    return reply({ error: "Unauthorized" }, 401);
  }
  let body: unknown;
  try {
    body = await readLimitedJson(request, 512);
  } catch {
    return reply({ error: "Confirmação inválida" }, 400);
  }
  if (
    !body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    (body as { confirmation?: unknown }).confirmation !== "EXCLUIR MINHA CONTA"
  ) {
    return reply({ error: "Confirmação explícita obrigatória" }, 400);
  }
  try {
    // Fail closed until the anonymization/retention migration is installed.
    if (!(await deps.ready())) {
      return reply({ error: "Exclusão ainda não ativada" }, 503);
    }
  } catch {
    return reply({ error: "Exclusão ainda não ativada" }, 503);
  }
  try {
    await deps.remove(userId);
    return reply({ deleted: true });
  } catch {
    return reply({
      error: "Não foi possível confirmar a exclusão. Tente novamente",
    }, 502);
  }
}
