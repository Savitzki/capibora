import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freshData, STORAGE_KEY } from "./model";

const provider = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUser: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  resetPassword: vi.fn(),
  signIn: vi.fn(),
  setSession: vi.fn(),
  rpc: vi.fn(),
  google: vi.fn(),
  signOut: vi.fn(),
  readProfile: vi.fn(),
  upsert: vi.fn(),
  updateUser: vi.fn(),
  unsubscribe: vi.fn(),
  onChange: null as null | ((_event: string, session: unknown) => void),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getSession: provider.getSession,
      getUser: provider.getUser,
      signUp: provider.signUp,
      resend: provider.resend,
      resetPasswordForEmail: provider.resetPassword,
      signInWithPassword: provider.signIn,
      setSession: provider.setSession,
      signInWithOAuth: provider.google,
      signOut: provider.signOut,
      updateUser: provider.updateUser,
      onAuthStateChange: (callback: typeof provider.onChange) => {
        provider.onChange = callback;
        return {
          data: { subscription: { unsubscribe: provider.unsubscribe } },
        };
      },
    },
    rpc: (...args: unknown[]) => ({ abortSignal: () => provider.rpc(...args) }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: provider.readProfile }) }),
      upsert: provider.upsert,
    }),
  }),
}));
const session = (id = "user-a") => ({
  access_token: `captured-${id}`,
  user: { id, email: "test@example.invalid" },
});
const row = {
  nickname: "dani.treina",
  avatar_color: "orange",
  avatar_style: "initials",
  avatar_photo: null,
};

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_SUPABASE_URL", "https://test-project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_for_unit_tests");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ external: { google: true } })),
  );
  provider.getSession.mockResolvedValue({
    data: { session: session() },
    error: null,
  });
  provider.getUser.mockResolvedValue({ data: { user: null }, error: null });
  provider.readProfile.mockResolvedValue({ data: row, error: null });
  provider.upsert.mockResolvedValue({ error: null });
  provider.signUp.mockResolvedValue({ data: { session: null }, error: null });
  provider.resend.mockResolvedValue({ error: null });
  provider.resetPassword.mockResolvedValue({ data: {}, error: null });
  provider.signIn.mockResolvedValue({ error: null });
  provider.setSession.mockResolvedValue({ error: null });
  provider.rpc.mockResolvedValue({
    data: { valid: true, available: true, suggestions: [] },
    error: null,
  });
  provider.google.mockResolvedValue({
    data: { provider: "google", url: "https://accounts.google.com/" },
    error: null,
  });
  provider.signOut.mockResolvedValue({ error: null });
  provider.updateUser.mockImplementation(async ({ data }) => ({
    data: { user: { ...session().user, user_metadata: data } },
    error: null,
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("integração da conta com o cliente Supabase", () => {
  it("guarda nome e tratamento escolhidos no cadastro e permite mudá-los no perfil", async () => {
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.profileChecked).toBe(true));
    await result.current.signUp("new@example.invalid", "test-password", {
      displayName: "Ana Clara",
      treatment: "feminine",
    });
    expect(provider.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: {
            display_name: "Ana Clara",
            phrase_treatment: "feminine",
          },
        }),
      }),
    );
    await act(async () =>
      result.current.saveProfile(result.current.profile!, {
        displayName: "João",
        treatment: "masculine",
      }),
    );
    expect(result.current.phrasePreferences).toEqual({
      displayName: "João",
      treatment: "masculine",
    });
  });
  it("resposta ofuscada de conta existente mantém o fluxo genérico sem consulta de existência", async () => {
    provider.signUp.mockResolvedValue({data:{session:null,user:{identities:[]}},error:null});
    const {useAccount}=await import("./account");
    const {result}=renderHook(useAccount);
    await waitFor(()=>expect(result.current.initializing).toBe(false));
    await expect(result.current.signUp("test@example.invalid","unit-test-password")).resolves.toBe(false);
    expect(provider.signIn).not.toHaveBeenCalled();
  });
  it.each([
    [
      "signUp",
      "signUp",
      { code: "email_address_not_authorized", status: 403 },
      /liberar o serviço de e-mail/,
    ],
    [
      "signUp",
      "signUp",
      { code: "weak_password", status: 422 },
      /senha mais forte/,
    ],
    [
      "resendConfirmation",
      "resend",
      { code: "over_email_send_rate_limit", status: 429 },
      /limite de envio de e-mails/,
    ],
    [
      "signIn",
      "signIn",
      { code: "email_not_confirmed", status: 400 },
      /Reenviar confirmação/,
    ],
    [
      "signIn",
      "signIn",
      { code: "invalid_credentials", status: 400 },
      /E-mail, nick ou senha incorretos/,
    ],
  ] as const)(
    "preserva o motivo da falha de %s",
    async (method, mock, error, message) => {
      provider[mock].mockResolvedValue({
        data: { user: null, session: null },
        error,
      });
      const { useAccount } = await import("./account");
      const { result } = renderHook(useAccount);
      await waitFor(() => expect(result.current.initializing).toBe(false));
      await expect(
        result.current[method]("new@example.invalid", "test-password"),
      ).rejects.toThrow(message);
    },
  );
  it.each(["signUp", "signIn", "resendConfirmation"] as const)(
    "traduz uma exceção de conexão durante %s",
    async (method) => {
      const mock = method === "resendConfirmation" ? "resend" : method;
      provider[mock].mockRejectedValueOnce(new TypeError("Failed to fetch"));
      const { useAccount } = await import("./account");
      const { result } = renderHook(useAccount);
      await waitFor(() => expect(result.current.initializing).toBe(false));
      await expect(
        result.current[method]("new@example.invalid", "test-password"),
      ).rejects.toThrow(/Confira a conexão/);
    },
  );
  it("distingue um perfil ainda não verificado, erro de consulta e ausência confirmada", async () => {
    let finish!: (value: unknown) => void;
    provider.readProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.user).not.toBeNull());
    expect(result.current.profileLoading).toBe(true);
    expect(result.current.profileChecked).toBe(false);
    await act(async () => finish({ data: null, error: { code: "network" } }));
    expect(result.current.profileLoading).toBe(false);
    expect(result.current.profileChecked).toBe(false);
    expect(result.current.profileError).toBe("");
    expect(result.current.sync?.errorKind).toBeTruthy();
    provider.readProfile.mockResolvedValue({ data: null, error: null });
    await act(async () => {
      await result.current.retry();
    });
    await waitFor(() => expect(result.current.profileChecked).toBe(true));
    expect(result.current.profile).toBeNull();
    expect(result.current.profileError).toBe("");
  });
  it("não substitui o perfil recém-salvo por uma consulta anterior atrasada", async () => {
    let finish!: (value: unknown) => void;
    provider.readProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await act(async () =>
      result.current.saveProfile({
        nickname: "novo.nick",
        style: "bolt",
        color: "blue",
        photo: null,
      }),
    );
    await act(async () => finish({ data: null, error: null }));
    expect(result.current.profile?.nickname).toBe("novo.nick");
    expect(result.current.profileChecked).toBe(true);
  });
  it("limpa dados pessoais no logout e preserva tema e dados alheios ao aplicativo", async () => {
    const personal = `${STORAGE_KEY}:account:user-a`;
    localStorage.setItem(personal, JSON.stringify(freshData()));
    localStorage.setItem(
      `${personal}:weight-sync`,
      JSON.stringify({
        version: 1,
        records: [],
        pending: [],
        guestImported: false,
      }),
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(freshData()));
    localStorage.setItem("fokus-push:user-a", "preferences");
    localStorage.setItem("fokus-trainer:theme", "dark");
    localStorage.setItem("another-app", "keep");
    sessionStorage.setItem(personal, "private");
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.profileChecked).toBe(true));
    await act(async () => result.current.signOut());
    expect(result.current.user).toBeNull();
    expect(result.current.profile).toBeNull();
    for (const key of [
      personal,
      `${personal}:weight-sync`,
      "fokus-push:user-a",
    ])
      expect(localStorage.getItem(key)).toBeNull();
    expect(sessionStorage.getItem(personal)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(freshData()));
    expect(localStorage.getItem("fokus-trainer:theme")).toBe("dark");
    expect(localStorage.getItem("another-app")).toBe("keep");
  });
  it("preserva pesos ainda não sincronizados e informa como resolver antes de sair", async () => {
    const key = `${STORAGE_KEY}:account:user-a:weight-sync`;
    const raw = JSON.stringify({
      version: 1,
      records: [],
      pending: [
        {
          date: "2026-10-17",
          kg: 72.5,
          baseVersion: 0,
          mutationId: crypto.randomUUID(),
        },
      ],
      guestImported: false,
    });
    localStorage.setItem(key, raw);
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await expect(result.current.signOut()).rejects.toThrow(/Há pesos/);
    expect(provider.signOut).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe(raw);
    expect(result.current.user).not.toBeNull();
  });
  it("não limpa dados se o Supabase recusa a saída", async () => {
    localStorage.setItem(`${STORAGE_KEY}:account:user-a`, "private");
    provider.signOut.mockResolvedValueOnce({ error: { code: "network" } });
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.user).not.toBeNull());
    await expect(result.current.signOut()).rejects.toThrow(
      /Não foi possível sair/,
    );
    expect(localStorage.getItem(`${STORAGE_KEY}:account:user-a`)).toBe(
      "private",
    );
  });
  it("usa o endereço público configurado no cadastro, reenvio e Google, mesmo numa prévia local", async () => {
    vi.stubEnv("VITE_APP_URL", "https://savitzki.github.io/capibora/");
    window.history.replaceState(null, "", "/preview/?test=1#local");
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      await result.current.signUp(
        " test@example.invalid ",
        "unit-test-password",
      );
      await result.current.resendConfirmation(" test@example.invalid ");
      await result.current.signInWithGoogle();
    });
    const destination = "https://savitzki.github.io/capibora/";
    expect(provider.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: destination },
      }),
    );
    expect(provider.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "test@example.invalid",
      options: { emailRedirectTo: destination },
    });
    expect(provider.google).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ redirectTo: destination }),
      }),
    );
  });
  it("não anuncia reenvio quando o serviço de e-mail recusa a solicitação", async () => {
    provider.resend.mockResolvedValue({
      error: { code: "over_email_send_rate_limit" },
    });
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await expect(
      result.current.resendConfirmation("test@example.invalid"),
    ).rejects.toThrow(/limite de envio de e-mails/);
  });
  it("orienta pedir um link novo quando a confirmação expira e limpa o erro da URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/FokusTrainer/#error=access_denied&error_code=otp_expired&error_description=untrusted_text",
    );
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.authNotice).toMatch(/Reenviar confirmação/);
    expect(window.location.hash).toBe("");
  });
  it("mantém o usuário no app e explica quando o provedor Google não foi habilitado", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ external: { google: false } }),
    );
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await expect(result.current.signInWithGoogle()).rejects.toThrow(
      /ainda está sendo ativado/,
    );
    expect(provider.google).not.toHaveBeenCalled();
  });
  it("abre o Google sem senha do FokusTrainer e retorna à subpasta do app", async () => {
    window.history.replaceState(null, "", "/FokusTrainer/?source=test#social");
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await act(async () => {
      await result.current.signInWithGoogle();
    });
    expect(provider.google).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/FokusTrainer/`,
        scopes: "openid email profile",
        queryParams: { prompt: "select_account" },
      },
    });
    expect(provider.signIn).not.toHaveBeenCalled();
    expect(provider.signUp).not.toHaveBeenCalled();
  });
  it("trata falha ao abrir o Google sem exibir detalhes internos do provedor", async () => {
    provider.google.mockResolvedValue({
      error: { message: "internal detail" },
    });
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    await expect(result.current.signInWithGoogle()).rejects.toThrow(
      /Não foi possível abrir o Google/,
    );
  });
  it("informa cancelamento do login e limpa os erros da URL sem expor a descrição recebida", async () => {
    window.history.replaceState(
      null,
      "",
      "/FokusTrainer/?source=keep#error=access_denied&error_description=untrusted_text",
    );
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    expect(result.current.authNotice).toMatch(/entrada foi cancelada/);
    expect(result.current.authNotice).not.toContain("untrusted_text");
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?source=keep");
    await act(async () => {
      result.current.dismissAuthNotice();
    });
    expect(result.current.authNotice).toBe("");
  });
  it("carrega o perfil e salva sempre com o ID da sessão, sem senha no perfil", async () => {
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() =>
      expect(result.current.profile?.nickname).toBe("dani.treina"),
    );
    await act(async () => {
      await result.current.saveProfile({
        nickname: "dani.treina",
        style: "bolt",
        color: "blue",
        photo: null,
      });
    });
    expect(provider.upsert).toHaveBeenCalledWith({
      id: "user-a",
      nickname: "dani.treina",
      avatar_style: "bolt",
      avatar_color: "blue",
      avatar_photo: null,
    });
    expect(result.current.profile?.nickname).toBe("dani.treina");
  });
  it("aguarda confirmação de e-mail quando o cadastro não abre uma sessão", async () => {
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() => expect(result.current.initializing).toBe(false));
    let signedIn: boolean | undefined;
    await act(async () => {
      signedIn = await result.current.signUp(
        " test@example.invalid ",
        "unit-test-password",
      );
    });
    expect(signedIn).toBe(false);
    expect(provider.signUp).toHaveBeenCalledWith({
      email: "test@example.invalid",
      password: "unit-test-password",
      options: { emailRedirectTo: expect.any(String) },
    });
  });
  it("não expõe o perfil de uma conta ao trocar de sessão", async () => {
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() =>
      expect(result.current.profile?.nickname).toBe("dani.treina"),
    );
    provider.readProfile.mockResolvedValue({ data: null, error: null });
    await act(async () => {
      provider.onChange?.("SIGNED_IN", session("user-b"));
    });
    expect(result.current.user?.id).toBe("user-b");
    expect(result.current.profile).toBeNull();
    await act(async () => {
      await result.current.signOut();
    });
    expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("exibe falhas de acesso sem afirmar que o perfil foi salvo", async () => {
    const { useAccount } = await import("./account");
    const { result } = renderHook(useAccount);
    await waitFor(() =>
      expect(result.current.profile?.nickname).toBe("dani.treina"),
    );
    provider.upsert.mockResolvedValue({ error: { code: "42501" } });
    await expect(
      result.current.saveProfile({
        nickname: "dani.treina",
        style: "bolt",
        color: "blue",
        photo: null,
      }),
    ).rejects.toThrow(/Não foi possível salvar/);
    expect(result.current.profile?.nickname).toBe("dani.treina");
  });
});

it("recusa alterações do nick existente antes de escrever, preservando avatar e identidade", async () => {
  const { useAccount } = await import("./account");
  const { result } = renderHook(useAccount);
  await waitFor(() => expect(result.current.profileChecked).toBe(true));
  await expect(
    result.current.saveProfile({
      ...result.current.profile!,
      nickname: "outro.nick",
    }),
  ).rejects.toThrow(/permanente/);
  expect(provider.upsert).not.toHaveBeenCalled();
  expect(result.current.profile?.nickname).toBe("dani.treina");
});
it("login por @nick usa a função de senha e entrega só os tokens ao SDK", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({
      access_token: "test-access",
      refresh_token: "test-refresh",
    }),
  );
  const { useAccount } = await import("./account");
  const { result } = renderHook(useAccount);
  await waitFor(() => expect(result.current.initializing).toBe(false));
  await result.current.signIn(" @Dani ", "my-password");
  expect(fetch).toHaveBeenCalledWith(
    "https://test-project.supabase.co/functions/v1/login-with-nickname",
    expect.objectContaining({
      body: JSON.stringify({ nickname: "Dani", password: "my-password" }),
      cache: "no-store",
    }),
  );
  expect(provider.setSession).toHaveBeenCalledExactlyOnceWith({
    access_token: "test-access",
    refresh_token: "test-refresh",
  });
  expect(provider.signIn).not.toHaveBeenCalled();
});
it("a função de nick ausente mantém a sessão vazia e oferece entrar por e-mail", async () => {
  vi.mocked(fetch).mockResolvedValue(
    Response.json({ code: "NOT_FOUND" }, { status: 404 }),
  );
  const { useAccount } = await import("./account");
  const { result } = renderHook(useAccount);
  await waitFor(() => expect(result.current.initializing).toBe(false));
  await expect(result.current.signIn("@Dani", "password")).rejects.toThrow(
    /Entre com seu e-mail/,
  );
  expect(provider.setSession).not.toHaveBeenCalled();
  expect(provider.signIn).not.toHaveBeenCalled();
});
it("conflito de unicidade no servidor retorna sugestões sem substituir o perfil", async () => {
  provider.readProfile.mockResolvedValue({ data: null, error: null });
  provider.upsert.mockResolvedValue({ error: { code: "23505" } });
  provider.rpc.mockResolvedValue({
    data: { valid: true, available: false, suggestions: ["Dani_2"] },
    error: null,
  });
  const { useAccount } = await import("./account");
  const { result } = renderHook(useAccount);
  await waitFor(() => expect(result.current.profileChecked).toBe(true));
  await expect(
    result.current.saveProfile({
      nickname: "Dani",
      color: "orange",
      style: "initials",
      photo: null,
    }),
  ).rejects.toMatchObject({ suggestions: ["Dani_2"] });
  expect(result.current.profile).toBeNull();
});

it("reconhece confirmação real no retorno ao app mesmo sem alteração de metadados", async () => {
  const pendingUser = { ...session().user, email_confirmed_at: undefined, user_metadata: { display_name: "Dani" } };
  provider.getSession.mockResolvedValue({ data: { session: { user: pendingUser } }, error: null });
  provider.getUser.mockResolvedValue({ data: { user: pendingUser }, error: null });
  const { useAccount } = await import("./account");
  const { result } = renderHook(useAccount);
  await waitFor(() => expect(result.current.profileChecked).toBe(true));
  await waitFor(() => expect(provider.getUser).toHaveBeenCalled());
  expect(result.current.user?.email_confirmed_at).toBeUndefined();
  provider.getUser.mockResolvedValue({ data: { user: { ...pendingUser, email_confirmed_at: "2026-10-20T12:00:00Z" } }, error: null });
  const visibility = vi.spyOn(document, "visibilityState", "get");
  visibility.mockReturnValue("hidden");act(()=>document.dispatchEvent(new Event("visibilitychange")));
  visibility.mockReturnValue("visible");act(()=>document.dispatchEvent(new Event("visibilitychange")));
  await waitFor(() => expect(result.current.user?.email_confirmed_at).toBe("2026-10-20T12:00:00Z"));
  visibility.mockRestore();
});
it("resposta de confirmação atrasada não reabre sessão após logout", async () => {
  let finish!: (value: unknown) => void;
  provider.getUser.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const { useAccount } = await import("./account");const { result } = renderHook(useAccount);
  await waitFor(() => expect(provider.getUser).toHaveBeenCalled());
  act(()=>provider.onChange!("SIGNED_OUT",null));
  await act(async()=>finish({ data: { user: { ...session().user, email_confirmed_at: "2026-10-20T12:00:00Z" } }, error: null }));
  expect(result.current.user).toBeNull();
});

it("não descarta um registro manual pendente no logout sem confirmação", async () => {
  const key = `${STORAGE_KEY}:account:user-a`;
  const data = freshData();
  data.workouts = [{ id: crypto.randomUUID(), date: "2026-10-24", activity: "Caminhada", minutes: 35, method: "manual" }];
  localStorage.setItem(key, JSON.stringify(data));
  const { useAccount } = await import("./account");
  const hook = renderHook(useAccount);
  await waitFor(() => expect(hook.result.current.user?.id).toBe("user-a"));
  await expect(hook.result.current.signOut()).rejects.toThrow(/rascunhos serão descartados/);
  expect(provider.signOut).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).not.toBeNull();
  await act(async () => { await hook.result.current.signOut(true); });
  expect(localStorage.getItem(key)).toBeNull();
  expect(hook.result.current.user).toBeNull();
});
it("exclui a própria conta com token capturado e limpa somente seus caches após confirmação", async () => {
  const own = `${STORAGE_KEY}:account:user-a`;
  const other = `${STORAGE_KEY}:account:user-b`;
  localStorage.setItem(own, JSON.stringify(freshData()));
  localStorage.setItem(other, "keep-other-account");
  vi.mocked(fetch).mockResolvedValue(Response.json({ deleted: true }));
  const { useAccount } = await import("./account");
  const hook = renderHook(useAccount);
  await waitFor(() => expect(hook.result.current.user?.id).toBe("user-a"));
  await act(async () => { await hook.result.current.deleteAccount(); });
  const [, init] = vi.mocked(fetch).mock.calls[0];
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer captured-user-a");
  expect(JSON.parse(String(init?.body))).toEqual({ confirmation: "EXCLUIR MINHA CONTA" });
  expect(localStorage.getItem(own)).toBeNull();
  expect(localStorage.getItem(other)).toBe("keep-other-account");
  expect(provider.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(hook.result.current.user).toBeNull();
});
it("não limpa dados nem informa exclusão antes da confirmação do servidor", async () => {
  const key = `${STORAGE_KEY}:account:user-a`;
  localStorage.setItem(key, JSON.stringify(freshData()));
  vi.mocked(fetch).mockResolvedValue(Response.json({ error: "not deployed" }, { status: 503 }));
  const { useAccount } = await import("./account");
  const hook = renderHook(useAccount);
  await waitFor(() => expect(hook.result.current.user?.id).toBe("user-a"));
  await expect(hook.result.current.deleteAccount()).rejects.toThrow(/precisa ser ativada/);
  expect(provider.signOut).not.toHaveBeenCalled();
  expect(localStorage.getItem(key)).not.toBeNull();
  expect(hook.result.current.user?.id).toBe("user-a");
});
it("uma exclusão em andamento não apaga a conta que entrou depois", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
  const other = `${STORAGE_KEY}:account:user-b`;
  localStorage.setItem(other, "new-account-private");
  const { useAccount } = await import("./account");
  const hook = renderHook(useAccount);
  await waitFor(() => expect(hook.result.current.user?.id).toBe("user-a"));
  let operation!: Promise<void>;
  act(() => { operation = hook.result.current.deleteAccount(); });
  await act(async () => { provider.onChange?.("SIGNED_IN", session("user-b")); });
  await act(async () => { resolve(Response.json({ deleted: true })); await operation; });
  expect(hook.result.current.user?.id).toBe("user-b");
  expect(provider.signOut).not.toHaveBeenCalled();
  expect(localStorage.getItem(other)).toBe("new-account-private");
});

it("solicita recuperação pelo Auth sem consultar existência pública de e-mail", async () => {
  const { useAccount } = await import("./account");
  const hook = renderHook(useAccount);
  await act(async () => { await hook.result.current.requestPasswordReset("synthetic@example.invalid"); });
  expect(provider.resetPassword).toHaveBeenCalledWith("synthetic@example.invalid", { redirectTo: expect.any(String) });
  expect(provider.rpc).not.toHaveBeenCalledWith("account_email_exists", expect.anything());
});
it("recupera o formulário após reabrir e só atualiza a senha com a sessão capturada", async () => {
  const { useAccount } = await import("./account");
  const first = renderHook(useAccount);
  await waitFor(() => expect(first.result.current.user?.id).toBe("user-a"));
  act(() => { provider.onChange?.("PASSWORD_RECOVERY", session()); });
  expect(first.result.current.passwordRecovery).toBe(true);
  first.unmount();
  const reopened = renderHook(useAccount);
  await waitFor(() => expect(reopened.result.current.passwordRecovery).toBe(true));
  vi.mocked(fetch).mockResolvedValue(Response.json({ id: "user-a" }));
  await act(async () => { await reopened.result.current.updatePassword("synthetic-new-password"); });
  const [, init] = vi.mocked(fetch).mock.calls.at(-1)!;
  expect(init?.method).toBe("PUT");
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer captured-user-a");
  expect(JSON.parse(String(init?.body))).toEqual({ password: "synthetic-new-password" });
  act(() => reopened.result.current.dismissPasswordRecovery());
  expect(reopened.result.current.passwordRecovery).toBe(false);
  expect(sessionStorage.getItem(`${STORAGE_KEY}:account:user-a:password-recovery`)).toBeNull();
});
it("um link expirado não confirma alteração de senha nem encerra a recuperação", async () => {
  const { useAccount } = await import("./account");
  const hook = renderHook(useAccount);
  await waitFor(() => expect(hook.result.current.user?.id).toBe("user-a"));
  act(() => { provider.onChange?.("PASSWORD_RECOVERY", session()); });
  vi.mocked(fetch).mockResolvedValue(Response.json({}, { status: 401 }));
  await expect(hook.result.current.updatePassword("synthetic-new-password")).rejects.toThrow(/link expirou/);
  expect(hook.result.current.passwordRecovery).toBe(true);
});
it("limpa o cache privado ao trocar diretamente de usuário e informa a perda de pendências", async () => {
  const key = `${STORAGE_KEY}:account:user-a`;
  const data = freshData();
  data.workouts = [{ id: crypto.randomUUID(), date: "2026-10-24", activity: "Yoga", minutes: 35, method: "manual" }];
  localStorage.setItem(key, JSON.stringify(data));
  const { useAccount } = await import("./account");
  const hook = renderHook(useAccount);
  await waitFor(() => expect(hook.result.current.user?.id).toBe("user-a"));
  act(() => { provider.onChange?.("SIGNED_IN", session("user-b")); });
  expect(localStorage.getItem(key)).toBeNull();
  expect(hook.result.current.authNotice).toContain("registros locais sem confirmação");
  act(() => { provider.onChange?.("SIGNED_IN", session("user-b")); });
  expect(hook.result.current.authNotice).toContain("registros locais sem confirmação");
  expect(hook.result.current.user?.id).toBe("user-b");
});
