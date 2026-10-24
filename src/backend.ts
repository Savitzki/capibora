const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
export const accountConfigured = Boolean(url && key);
const clientPromise = accountConfigured
  ? import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(url, key),
    )
  : Promise.resolve(null);
export const getBackendClient = () => clientPromise;

export async function requestPasswordChange(accessToken: string, password: string) {
  const response = await fetch(`${url.replace(/\/+$/, "")}/auth/v1/user`, {
    method: "PUT", headers: { apikey: key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password }), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new Error("O link expirou. Solicite outro link de recuperação");
  if (!response.ok) throw new Error("Não foi possível alterar a senha. Use uma senha forte e tente novamente");
}

/** The captured session prevents a later account switch from changing the target. */
export async function requestAccountDeletion(accessToken: string) {
  if (!accountConfigured) throw new Error("O serviço online ainda não foi configurado");
  const response = await fetch(`${url.replace(/\/+$/, "")}/functions/v1/delete-account`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "EXCLUIR MINHA CONTA" }),
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if ([404, 503].includes(response.status))
    throw new Error("A exclusão de conta ainda precisa ser ativada pelo responsável pelo app");
  if (response.status === 401)
    throw new Error("Entre novamente antes de excluir sua conta");
  if (!response.ok || result?.deleted !== true)
    throw new Error("Não foi possível confirmar a exclusão da conta. Confira a conexão e tente novamente");
}

export async function requestNicknameSession(
  nickname: string,
  password: string,
): Promise<{ access_token: string; refresh_token: string }> {
  if (!accountConfigured)
    throw new Error("O serviço online ainda não foi configurado");
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/functions/v1/login-with-nickname`,
    {
      method: "POST",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, password }),
      signal: AbortSignal.timeout(15000),
      redirect: "error",
      cache: "no-store",
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw Object.assign(new Error("Nickname login failed"), {
      code:
        response.status === 404 || response.status >= 500
          ? "nickname_login_unavailable"
          : result.code,
      status: response.status,
    });
  if (
    typeof result.access_token !== "string" ||
    !result.access_token ||
    typeof result.refresh_token !== "string" ||
    !result.refresh_token
  )
    throw Object.assign(new Error("Invalid nickname session"), {
      code: "nickname_login_unavailable",
    });
  return {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  };
}

export async function googleProviderEnabled(): Promise<boolean> {
  if (!accountConfigured) return false;
  const response = await fetch(
    new URL("auth/v1/settings", `${url.replace(/\/+$/, "")}/`),
    {
      headers: { apikey: key },
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!response.ok)
    throw new Error("Não foi possível verificar o login Google.");
  const settings = await response.json();
  return settings.external?.google === true;
}

export async function backendRpc<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const client = await clientPromise;
  if (!client) throw new Error("O serviço online ainda não foi configurado.");
  const { data, error, status } = await client
    .rpc(name, args)
    .abortSignal(AbortSignal.timeout(15000));
  if (
    error &&
    ["sync_weights", "sync_weight_entries"].includes(name) &&
    ["PGRST202", "42883", "42P01"].includes(error.code)
  )
    throw new Error(
      "A sincronização de peso ainda precisa ser ativada pelo responsável pelo app. Seus pesos continuam neste aparelho.",
    );
  if (
    error &&
    [
      "check_nickname",
      "find_friend_by_nickname",
      "send_friend_request_by_nickname",
    ].includes(name) &&
    ["PGRST202", "42883", "42P01"].includes(error.code)
  )
    throw new Error(
      "Essa função de nicks ainda precisa ser ativada pelo responsável pelo app",
    );
  if (
    error &&
    ["PGRST202", "42883", "42P01"].includes(error.code) &&
    [
      "get_gamification_state",
      "get_progress_report",
      "get_friend_challenges",
      "get_friend_showcase",
      "set_featured_medals",
      "create_friend_challenge",
      "reply_challenge_invite",
      "buy_cosmetic",
      "equip_cosmetic",
      "get_workout_recording_state",
      "start_workout_session",
      "finish_workout_session",
      "cancel_workout_session",
      "confirm_manual_workout",
      "submit_workout_review",
      "create_recording_challenge",
    ].includes(name)
  )
    throw new Error("Estas novidades ainda precisam ser ativadas no servidor");
  if (error) {
    const kind =
      error.code === "P0001"
        ? "validation"
        : status === 401 || status === 403 || /PGRST30/.test(error.code)
          ? "auth"
          : !navigator.onLine ||
              /fetch|network|timeout|abort/i.test(error.message)
            ? "network"
            : "server";
    throw Object.assign(
      new Error(
        error.code === "P0001"
          ? error.message
          : kind === "auth"
            ? "Entre novamente para sincronizar sua conta"
            : kind === "network"
              ? "Não foi possível conectar. Confira a internet e tente novamente"
              : "Não foi possível atualizar no servidor. Tente novamente em instantes",
      ),
      { kind, code: error.code, status },
    );
  }
  return data as T;
}
