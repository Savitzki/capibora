import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import type { Account } from "./account";
import { clearAccountStorage } from "./accountStorage";
import { freshData, localDate, STORAGE_KEY } from "./model";
import { usePageNavigation } from "./navigation";
import { MASCOT_ASSETS } from "./mascotAssets";

const store = vi.hoisted(() => ({
  account: null as Account | null,
  revision: 0,
  listeners: new Set<() => void>(),
  rpc: vi.fn(),
}));
vi.mock("./backend", () => ({
  accountConfigured: false,
  backendRpc: store.rpc,
}));
vi.mock("./useMinimumLoading", () => ({
  useMinimumLoading: (pending: boolean) => pending,
}));
vi.mock("./account", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useAccount: () => {
      useSyncExternalStore(
        (callback) => {
          store.listeners.add(callback);
          return () => {
            store.listeners.delete(callback);
          };
        },
        () => store.revision,
      );
      return store.account!;
    },
  };
});
function changeAccount(next: Partial<Account>) {
  Object.assign(store.account!, next);
  store.revision++;
  for (const listener of store.listeners) listener();
}
const profile = {
  nickname: "conta.privada",
  color: "orange",
  style: "initials",
  photo: null,
} as const;
beforeEach(() => {
  store.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === "sync_weight_entries") return { records: [], applied: [] };
    throw new Error(`Unexpected RPC: ${name}`);
  });
  store.account = {
    configured: true,
    initializing: false,
    user: null,
    profile: null,
    profileChecked: true,
    profileLoading: false,
    profileError: "",
    error: "",
    authNotice: "",
    dismissAuthNotice: vi.fn(),
    retry: vi.fn(),
    phrasePreferences: { displayName: "Pessoa", treatment: "neutral" },
    checkNickname: vi.fn(),
    signUp: vi.fn(),
    resendConfirmation: vi.fn(),
    saveProfile: vi.fn(),
    signInWithGoogle: vi.fn(),
    signIn: vi.fn().mockImplementation(async () =>
      changeAccount({
        user: {
          id: "guest-login",
          email: "conta@example.invalid",
        } as Account["user"],
        profile,
      }),
    ),
    deleteAccount: vi.fn(),
    passwordRecovery: false,
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    dismissPasswordRecovery: vi.fn(),
    signOut: vi.fn().mockImplementation(async () => {
      clearAccountStorage("guest-login");
      changeAccount({ user: null, profile: null });
    }),
  };
});
function legacy() {
  const data = freshData();
  data.profile = { ...profile, nickname: "legado.local" };
  data.workouts = [
    { id: "guest-old", date: localDate(), activity: "Corrida", minutes: 45 },
  ];
  data.weights = [{ date: localDate(), kg: 72.5 }];
  const raw = JSON.stringify(data);
  localStorage.setItem(STORAGE_KEY, raw);
  return raw;
}
it("mostra apenas a apresentação e duas abas, sem status, dados locais ou consultas pessoais", () => {
  const raw = legacy();
  render(<App />);
  expect(
    within(screen.getByRole("navigation"))
      .getAllByRole("link")
      .map((el) => el.getAttribute("aria-label")),
  ).toEqual(["Início", "Treinos"]);
  expect(
    screen.getByRole("heading", { level: 1, name: "Duvido que vc comece" }),
  ).toHaveFocus();
  expect(
    screen.getByText("Organize seus treinos e mantenha sua rotina"),
  ).toBeVisible();
  const header = screen.getByRole("banner");
  expect(within(header).queryByRole("button")).toBeNull();
  expect(
    within(header).getByRole("img", { name: "Capibora" }),
  ).toBeInTheDocument();
  expect(
    document.querySelector(".guest-intro .capibora-mascot"),
  ).toHaveAttribute("src", MASCOT_ASSETS.judging!.src);
  expect(
    screen.getByRole("list", { name: "O que você encontra no Capibora" })
      .children,
  ).toHaveLength(3);
  expect(
    document.querySelector(
      ".coin-balance,.header-streak,.profile-button,.weekly-goals,.training-progress,.kit-shop,.workout-history",
    ),
  ).toBeNull();
  expect(
    screen.queryByText(/legado.local|conta.privada|72,5|Visitante/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Registrar treino" }),
  ).not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(store.rpc).not.toHaveBeenCalled();
});
it("a semana é estática e explícita, sem calendário pessoal, bloqueios ou mutações", async () => {
  const raw = legacy(),
    user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "Treinos" }));
  expect(screen.getByText("Demonstração")).toBeVisible();
  const week = screen.getByRole("list", { name: "Semana de demonstração" });
  expect(within(week).getAllByRole("listitem")).toHaveLength(7);
  expect(week.querySelectorAll(".is-training")).toHaveLength(3);
  expect(week.querySelectorAll(".is-rest")).toHaveLength(4);
  for (const day of within(week).getAllByRole("listitem")) fireEvent.click(day);
  expect(week.querySelector("button,input")).toBeNull();
  expect(
    document.querySelector(
      ".streak-calendar,.workout-history,.calendar-actions,.training-save-row",
    ),
  ).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: /Reagendar|Descansar|Kit|Cronômetro|Registrar treino/,
    }),
  ).not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(store.rpc).not.toHaveBeenCalled();
});
it.each(["Início", "Treinos"])(
  "%s abre o formulário existente de login/cadastro",
  async (name) => {
    const user = userEvent.setup();
    render(<App />);
    if (name === "Treinos")
      await user.click(screen.getByRole("link", { name: "Treinos" }));
    await user.click(screen.getByRole("button", { name: "Começar agora" }));
    const dialog = screen.getByRole("dialog", { name: "Sua conta Capibora" });
    expect(within(dialog).getByRole("heading", { name: "Novo por aqui?" })).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Entrar" }));
    expect(within(dialog).getByLabelText("Senha")).toHaveAttribute(
      "autocomplete",
      "current-password",
    );
    expect(
      within(dialog).getByRole("button", { name: "Quero criar uma conta" }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Seu nick")).not.toBeInTheDocument();
    expect(store.rpc).not.toHaveBeenCalled();
  },
);
it.each([
  "/arena",
  "/loja",
  "/peso",
  "/perfil",
  "/configuracoes",
  "/treino-em-andamento",
  "/juntos",
  "/avisos",
])("redireciona %s antes de montar conteúdo restrito", (path) => {
  window.history.replaceState(null, "", `/#${path}`);
  render(<App />);
  expect(window.location.hash).toBe("#/");
  expect(
    screen.getByRole("heading", { level: 1, name: "Duvido que vc comece" }),
  ).toBeInTheDocument();
  expect(
    document.querySelector(
      ".profile-page,.social-panel,.shop-page,.weight-page,.settings-page,.session-page",
    ),
  ).toBeNull();
  expect(store.rpc).not.toHaveBeenCalled();
});
it("protege mudanças de URL e Voltar sem montar dados restritos", async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("link", { name: "Treinos" }));
  act(() => {
    window.history.pushState(null, "", "/#/perfil");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  expect(window.location.hash).toBe("#/");
  expect(
    screen.getByRole("heading", { name: "Duvido que vc comece" }),
  ).toBeVisible();
  act(() => {
    window.location.hash = "/treinos";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(screen.getByText("Demonstração")).toBeVisible();
  expect(store.rpc).not.toHaveBeenCalled();
});
it("preserva o fragmento de autenticação enquanto apresenta a Home", () => {
  const url = "/?code=auth-code#access_token=example&refresh_token=example";
  window.history.replaceState(null, "", url);
  render(<App />);
  expect(location.search + location.hash).toBe(url.slice(1));
  expect(
    screen.getByRole("heading", { name: "Duvido que vc comece" }),
  ).toBeInTheDocument();
});
it("o login restaura as seis abas sem recarregar e não confirma registros do visitante", async () => {
  const raw = legacy(),
    user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Começar agora" }));
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.type(screen.getByLabelText(/^E-mail/), "conta@example.invalid");
  await user.type(screen.getByLabelText("Senha"), "senha-teste-123");
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", { name: "Entrar" }),
  );
  await waitFor(() =>
    expect(
      within(screen.getByRole("navigation")).getAllByRole("link"),
    ).toHaveLength(6),
  );
  expect(store.account!.signIn).toHaveBeenCalledOnce();
  expect(
    screen.getByRole("button", { name: "Editar perfil de conta.privada" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Registrar treino" }),
  ).toBeEnabled();
  expect(
    JSON.parse(localStorage.getItem(`${STORAGE_KEY}:account:guest-login`)!)
      .workouts,
  ).toEqual([]);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(
    store.rpc.mock.calls.some(([name]) =>
      /confirm|start_workout|buy_/.test(name),
    ),
  ).toBe(false);
});
it("o logout fecha o perfil, limpa dados da conta e mantém o legado oculto e recuperável", async () => {
  const raw = legacy(),
    user = userEvent.setup();
  const personal = freshData();
  personal.profile = profile;
  personal.weights = [{ date: localDate(), kg: 81 }];
  localStorage.setItem(
    `${STORAGE_KEY}:account:guest-login`,
    JSON.stringify(personal),
  );
  store.account!.user = { id: "guest-login" } as Account["user"];
  store.account!.profile = profile;
  render(<App />);
  await user.click(
    screen.getByRole("button", { name: "Editar perfil de conta.privada" }),
  );
  await user.click(await screen.findByRole("button", { name: "Sair da conta" }));
  await screen.findByRole("heading", { name: "Duvido que vc comece" });
  expect(store.account!.signOut).toHaveBeenCalledOnce();
  expect(
    within(screen.getByRole("navigation")).getAllByRole("link"),
  ).toHaveLength(2);
  expect(window.location.hash).toBe("#/");
  expect(
    screen.queryByText(/conta.privada|legado.local|81/),
  ).not.toBeInTheDocument();
  expect(
    document.querySelector(".profile-page,.coin-balance,.header-streak"),
  ).toBeNull();
  expect(localStorage.getItem(`${STORAGE_KEY}:account:guest-login`)).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it("a navegação interna também rejeita destinos restritos sem empilhar a página privada", () => {
  const view = renderHook(() => usePageNavigation(true));
  act(() => view.result.current.navigate("workouts"));
  expect(view.result.current.page).toBe("workouts");
  act(() => view.result.current.navigate("profile"));
  expect(view.result.current.page).toBe("overview");
  expect(location.hash).toBe("#/");
});
it("leva uma conta autenticada sem perfil ao preenchimento somente depois da leitura confirmada", async () => {
  store.account!.signUp = vi.fn().mockImplementation(async () => {
    changeAccount({ user: {id:"new-entry",email:"new@example.invalid"} as Account["user"],profile:null,profileChecked:false,profileLoading:true });
    return true;
  });
  render(<App />); const user=userEvent.setup();
  await user.click(screen.getByRole("button",{name:"Começar agora"}));
  await user.click(screen.getByRole("button",{name:"Criar conta"}));
  await user.type(screen.getByLabelText("E-mail"),"new@example.invalid");
  await user.click(screen.getByRole("button",{name:"Continuar"}));
  await user.type(screen.getByLabelText("Senha"),"example-password");
  await user.click(screen.getByRole("button",{name:"Criar conta"}));
  expect(screen.queryByRole("heading",{name:"Completar o perfil"})).toBeNull();
  await act(async()=>changeAccount({profileChecked:true,profileLoading:false}));
  expect(await screen.findByRole("heading",{name:"Completar o perfil"})).toBeVisible();
  expect(screen.getByLabelText("Nome de usuário")).toBeRequired();
  expect(screen.getByLabelText("Nome",{exact:true})).toBeRequired();
  expect(screen.getByLabelText("Sexo")).toBeRequired();
  expect(screen.getByRole("button",{name:"Salvar perfil"})).toHaveClass("primary-button");
  expect(location.hash).toBe("#/perfil");
});
