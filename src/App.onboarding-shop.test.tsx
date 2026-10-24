import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "./App";
// The real opening duration is covered in startupScreen.test.tsx.
vi.mock("./useMinimumLoading", () => ({
  useMinimumLoading: (pending: boolean) => pending,
}));
import type { Account } from "./account";
import type { EconomyController } from "./useEconomy";

const mock = vi.hoisted(() => ({
  account: null as Account | null,
  economy: null as EconomyController | null,
  enable: vi.fn(),
  decline: vi.fn(),
}));
vi.mock("./useNotificationOnboarding", async () => {
  const { useState } = await import("react");
  return {
    useNotificationOnboarding: () => {
      const [prompt, setPrompt] = useState(false);
      return {
        prompt:
          prompt &&
          typeof Notification !== "undefined" &&
          Notification.permission === "default",
        allowed: false,
        dismiss: () => setPrompt(false),
        request: () => {
          if (
            typeof Notification !== "undefined" &&
            Notification.permission === "default"
          )
            setPrompt(true);
        },
        enable: mock.enable,
        decline: mock.decline,
      };
    },
  };
});
vi.mock("./account", () => ({ useAccount: () => mock.account! }));
vi.mock("./useEconomy", () => ({ useEconomy: () => mock.economy! }));

const profile = {
  nickname: "dani.treina",
  color: "orange",
  style: "initials",
  photo: null,
} as const;
let requestPermission = vi.fn<() => Promise<NotificationPermission>>();
beforeEach(() => {
  requestPermission = vi.fn<() => Promise<NotificationPermission>>().mockResolvedValue("granted");
  mock.enable.mockReset().mockImplementation(() => requestPermission());
  mock.decline.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("Notification", { permission: "default", requestPermission });
  mock.account = {
    configured: true,
    initializing: false,
    user: { id: "new-user", email: "dani@example.invalid" } as Account["user"],
    phrasePreferences: { displayName: "Dani", treatment: "neutral" },
    profile: null,
    profileChecked: true,
    profileLoading: false,
    profileError: "",
    error: "",
    authNotice: "",
    dismissAuthNotice: vi.fn(),
    retry: vi.fn(),
    checkNickname: vi
      .fn()
      .mockResolvedValue({ valid: true, available: true, suggestions: [] }),
    signUp: vi.fn(),
    resendConfirmation: vi.fn(),
    signIn: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
    passwordRecovery: false,
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    dismissPasswordRecovery: vi.fn(),
    saveProfile: vi.fn().mockResolvedValue(undefined),
  };
  mock.economy = {
    enabled: true,
    busy: false,
    error: "",
    notice: "",
    noticeReward: undefined,
    clearNotice: vi.fn(),
    refresh: vi.fn(),
    buy: vi.fn().mockResolvedValue(true),
    acknowledgeAutomatic: vi.fn().mockResolvedValue(true),
    useKit: vi.fn(),
    loadMore: vi.fn(),
    state: {
      revision: 1,
      balance: 300,
      kits: 2,
      today: "2026-10-17",
      timezone: "America/Sao_Paulo",
      kitsUsedThisWeek: 0,
      protections: [],
      rules: {
        workoutReward: 10,
        weightReward: 2,
        kitPrice: 250,
        weeklyKitLimit: 0,
        kitUsageLimit: "inventory",
      },
      monthlyKits: {
        month: "2026-10-01",
        renewsOn: "2026-11-01",
        allowance: 2,
        freeAvailable: 2,
        purchasedAvailable: 0,
      },
      history: { entries: [], hasMore: false },
    },
    history: {
      entries: [
        {
          id: "1",
          kind: "workout",
          description: "Treino concluído",
          amount: 10,
          balanceAfter: 300,
          createdAt: "2026-10-17T15:00:00Z",
          day: "2026-10-17",
        },
      ],
      hasMore: false,
    },
  };
});
afterEach(() => vi.unstubAllGlobals());

async function completeProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Complete se perfil/ }));
  await user.type(await screen.findByLabelText("Nome de usuário"), "dani.treina");
  await user.selectOptions(screen.getByLabelText("Sexo"), "neutral");
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
}

it("convida após salvar o primeiro perfil e só pede a permissão ao tocar em SIM", async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await completeProfile(user);
  const prompt = await screen.findByRole("dialog", {
    name: "Quer receber notificações?",
  });
  expect(requestPermission).not.toHaveBeenCalled();
  await user.click(within(prompt).getByRole("button", { name: "SIM" }));
  expect(requestPermission).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    screen
      .getAllByRole("status")
      .some((status) => status.textContent?.includes("Notificações ativadas")),
  ).toBe(true);
});

it("permite pular o convite e não repete em edições de um perfil já cadastrado", async () => {
  const user = userEvent.setup(),
    view = render(<App />);
  await completeProfile(user);
  await user.click(await screen.findByRole("button", { name: "NÃO" }));
  expect(requestPermission).not.toHaveBeenCalled();
  mock.account!.profile = profile;
  view.rerender(<App />);
  await user.click(
    screen.getByRole("button", { name: "Editar perfil de dani.treina" }),
  );
  await user.click(screen.getByRole("button", { name: "Editar perfil" }));
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(requestPermission).not.toHaveBeenCalled();
});

it.each(["granted", "denied", "unsupported"])(
  "respeita a permissão %s ao terminar o cadastro",
  async (permission) => {
    if (permission === "unsupported") vi.stubGlobal("Notification", undefined);
    else vi.stubGlobal("Notification", { permission, requestPermission });
    const user = userEvent.setup();
    render(<App />);
    await completeProfile(user);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(requestPermission).not.toHaveBeenCalled();
  },
);

it("não convida se o salvamento do cadastro falhar", async () => {
  vi.mocked(mock.account!.saveProfile).mockRejectedValue(
    new Error("Não foi possível salvar"),
  );
  render(<App />);
  await completeProfile(userEvent.setup());
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível salvar",
  );
  expect(
    screen.queryByRole("dialog", { name: "Quer receber notificações?" }),
  ).not.toBeInTheDocument();
  expect(requestPermission).not.toHaveBeenCalled();
});

it("o saldo abre a Loja com o mesmo estoque, histórico e compra segura de kits", async () => {
  mock.account!.profile = profile;
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: /Ver loja e kits/ }));
  expect(window.location.hash).toBe("#/loja");
  expect(screen.getByRole("heading", { level: 1, name: "Loja" })).toHaveFocus();
  expect(screen.getByText("2 disponíveis · 2 grátis")).toBeInTheDocument();
  expect(screen.queryByText("Treino concluído")).not.toBeInTheDocument();
  expect(mock.economy!.history.entries).toHaveLength(1);
  expect(mock.economy!.buy).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Comprar Kit Médico por 250 CapiWhey" }));
  await user.click(screen.getByRole("button", { name: "Confirmar compra" }));
  expect(mock.economy!.buy).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("link", { name: "Início" }));
  expect(
    screen.getByRole("button", { name: /300 CapiWhey · Ver loja/ }),
  ).toBeInTheDocument();
});

it("fecha um convite já aberto se a permissão passar a concedida", async () => {
  const user = userEvent.setup(),
    view = render(<App />);
  await completeProfile(user);
  expect(
    await screen.findByRole("dialog", { name: "Quer receber notificações?" }),
  ).toBeInTheDocument();
  vi.stubGlobal("Notification", { permission: "granted", requestPermission });
  view.rerender(<App />);
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Quer receber notificações?" }),
    ).not.toBeInTheDocument(),
  );
  expect(requestPermission).not.toHaveBeenCalled();
});
