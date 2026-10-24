import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ProfilePanel from "./ProfilePanel";
import type { Account } from "./account";
import { AccountAuthError, AccountExistsError } from "./accountErrors";

function account() {
  return {
    configured: true,
    initializing: false,
    user: null,
    phrasePreferences: { displayName: "", treatment: "neutral" as const },
    profile: null,
    profileLoading: false,
    profileChecked: false,
    profileError: "",
    error: "",
    authNotice: "",
    dismissAuthNotice: vi.fn(),
    retry: vi.fn(),
    checkNickname: vi
      .fn()
      .mockResolvedValue({ valid: true, available: true, suggestions: [] }),
    signUp: vi.fn(),
    resendConfirmation: vi.fn().mockResolvedValue(undefined),
    signIn: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
    passwordRecovery: false,
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    dismissPasswordRecovery: vi.fn(),
    signInWithGoogle: vi.fn().mockResolvedValue(undefined),
    saveProfile: vi.fn(),
  } satisfies Account;
}
async function advance(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Continuar" }));
}
async function fillSignup(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
) {
  const create = screen.queryByRole("button", {
    name: "Criar conta",
  });
  if (create) await user.click(create);
  await user.type(screen.getByLabelText(/^E-mail/), email);
  await advance(user);
  await user.type(screen.getByLabelText("Senha"), "test-password");
}
it("não revela conta existente no cadastro e oferece confirmação genérica e entrada", async () => {
  const user = userEvent.setup();
  const auth = account();
  auth.signUp.mockRejectedValueOnce(new AccountExistsError());
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Entrar na conta" }));
  await fillSignup(user, "test@example.invalid");
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(await screen.findByRole("heading", {name:"Confira seu e-mail"})).toBeVisible();
  expect(screen.queryByText(/Este e-mail já tem uma conta/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"Entrar"}));
  expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  expect(screen.getByLabelText(/^E-mail/)).toHaveValue("test@example.invalid");
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(screen.getByLabelText("Senha")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  expect(auth.signIn).not.toHaveBeenCalled();
});
it("mantém uma conta nova no cadastro até a confirmação do e-mail", async () => {
  const user = userEvent.setup();
  const auth = account();
  auth.signUp.mockResolvedValueOnce(false);
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Entrar na conta" }));
  await fillSignup(user, "new@example.invalid");
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(auth.signUp).toHaveBeenCalledWith(
    "new@example.invalid",
    "test-password",
  );
  expect(
    await screen.findByRole("heading", { name: "Confira seu e-mail" }),
  ).toHaveFocus();
  expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  if (screen.queryByRole("heading", { name: "Novo por aqui?" })) await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.click(
    screen.getByRole("button", { name: "Reenviar confirmação" }),
  );
  expect(auth.resendConfirmation).toHaveBeenCalledWith("new@example.invalid");
});
it("reenvia a confirmação com e-mail válido sem exigir senha", async () => {
  const user = userEvent.setup();
  const auth = account();
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Entrar na conta" }));
  if (screen.queryByRole("heading", { name: "Novo por aqui?" })) await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.click(
    screen.getByRole("button", { name: "Reenviar confirmação" }),
  );
  expect(auth.resendConfirmation).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText(/^E-mail/), "test@example.invalid");
  if (screen.queryByRole("heading", { name: "Novo por aqui?" })) await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.click(
    screen.getByRole("button", { name: "Reenviar confirmação" }),
  );
  expect(auth.resendConfirmation).toHaveBeenCalledWith("test@example.invalid");
  expect(await screen.findByRole("status")).toHaveTextContent(
    /cadastro pendente/,
  );
  expect(auth.signUp).not.toHaveBeenCalled();
});
it("permite entrar com Google sem preencher os campos obrigatórios de e-mail e senha", async () => {
  const user = userEvent.setup();
  const auth = account();
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Entrar na conta" }));
  await user.click(
    screen.getByRole("button", { name: "Continuar com Google" }),
  );
  expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  expect(auth.signUp).not.toHaveBeenCalled();
  expect(auth.signIn).not.toHaveBeenCalled();
});
it("oferece nova tentativa com Google ou e-mail quando a conexão falha", async () => {
  const user = userEvent.setup();
  const auth = account();
  auth.signInWithGoogle.mockRejectedValueOnce(
    new Error("Não foi possível abrir o Google."),
  );
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Entrar na conta" }));
  await user.click(
    screen.getByRole("button", { name: "Continuar com Google" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível abrir o Google.",
  );
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(
    screen.getByRole("button", { name: "Continuar com Google" })
      .nextElementSibling,
  ).toBe(screen.getByRole("alert"));
  expect(
    screen.getByRole("button", { name: "Continuar com Google" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", { name: "Continuar com Google" }),
  ).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(screen.getByLabelText("Senha")).toBeRequired();
  await user.type(screen.getByLabelText(/^E-mail/), "login@example.invalid");
  await user.type(screen.getByLabelText("Senha"), "secret");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(auth.signIn).toHaveBeenCalledWith("login@example.invalid", "secret");
});
it("mostra uma informação por etapa sem Voltar e só cadastra no final", async () => {
  const user = userEvent.setup();
  const auth = account();
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
      initialTab="account"
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Criar conta" }),
  );
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  await advance(user);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.getByLabelText(/^E-mail/)).toBeInTheDocument();
  await user.type(screen.getByLabelText(/^E-mail/), "steps@example.invalid");
  await advance(user);
  expect(screen.getByLabelText("Senha")).toHaveFocus();
  expect(screen.queryByLabelText("E-mail")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Senha"), "test-password");
  expect(screen.queryByLabelText("Seu nome")).toBeNull();
  expect(screen.queryByLabelText("Sexo")).toBeNull();
  expect(screen.queryByRole("button", { name: /Voltar/ })).toBeNull();
  expect(auth.signUp).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(auth.signUp).toHaveBeenCalledExactlyOnceWith(
    "steps@example.invalid",
    "test-password",
  );
});

it("valida e-mail e senha na própria etapa, com mensagens acessíveis", async () => {
  const user = userEvent.setup();
  const auth = account();
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
      initialTab="account"
    />,
  );
  await user.click(
    screen.getByRole("button", { name: "Criar conta" }),
  );
  await user.type(screen.getByLabelText(/^E-mail/), "ana@servidor");
  await advance(user);
  expect(screen.getByRole("alert")).toHaveTextContent(/e-mail está correto/);
  expect(screen.getByLabelText(/^E-mail/)).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText(/^E-mail/));
  await user.type(
    screen.getByLabelText(/^E-mail/),
    "ana+treino@example.invalid",
  );
  await advance(user);
  await user.type(screen.getByLabelText("Senha"), "curta");
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    /pelo menos 8 caracteres/,
  );
  expect(screen.getByLabelText("Senha")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(auth.signUp).not.toHaveBeenCalled();
});

it.each([
  ["password", "Senha", "Essa senha foi recusada. Use uma senha mais forte"],
  ["email", "E-mail", "Confira se o e-mail está correto"],
] as const)(
  "volta ao campo %s quando o serviço recusa os dados, preservando as outras etapas",
  async (field, label, message) => {
    const user = userEvent.setup();
    const auth = account();
    auth.signUp
      .mockRejectedValueOnce(new AccountAuthError(message, field))
      .mockResolvedValueOnce(false);
    render(
      <ProfilePanel
        profile={null}
        account={auth}
        onSaveLocal={vi.fn()}
        onSaved={vi.fn()}
        initialTab="account"
      />,
    );
    await fillSignup(user, "new@example.invalid");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(label)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(label)).toHaveValue(
      field === "email" ? "new@example.invalid" : "test-password",
    );
    await user.clear(screen.getByLabelText(label));
    await user.type(
      screen.getByLabelText(label),
      field === "email" ? "fixed@example.invalid" : "a-stronger-password",
    );
    if (field === "email") {
      await advance(user);
      expect(screen.getByLabelText("Senha")).toHaveValue("test-password");
    }
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(
      await screen.findByRole("heading", { name: "Confira seu e-mail" }),
    ).toBeInTheDocument();
    expect(auth.signUp).toHaveBeenLastCalledWith(
      field === "email" ? "fixed@example.invalid" : "new@example.invalid",
      field === "password" ? "a-stronger-password" : "test-password",
      );
  },
);

it("mantém os dados após falha do serviço e permite tentar novamente sem anunciar sucesso", async () => {
  const user = userEvent.setup();
  const auth = account();
  const onSaved = vi.fn();
  auth.signUp
    .mockRejectedValueOnce(
      new AccountAuthError("O limite de envio de e-mails foi atingido"),
    )
    .mockResolvedValueOnce(false);
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={onSaved}
      initialTab="account"
    />,
  );
  await fillSignup(user, "retry@example.invalid");
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/limite de envio/);
  expect(screen.getByRole("alert")).toHaveFocus();
  expect(
    screen.queryByRole("heading", { name: "Confira seu e-mail" }),
  ).not.toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Criar conta" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(auth.signUp).toHaveBeenNthCalledWith(
    2,
    "retry@example.invalid",
    "test-password",
  );
  expect(
    await screen.findByRole("heading", { name: "Confira seu e-mail" }),
  ).toBeInTheDocument();
});

it("avança diretamente do e-mail válido para senha sem revelar existência", async () => {
  const auth = account(), user = userEvent.setup();
  render(<ProfilePanel initialTab="account" profile={null} account={auth} onSaveLocal={vi.fn()} onSaved={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  await user.type(screen.getByLabelText("E-mail"), "Existing@Example.com");
  await advance(user);
  expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "new-password");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(auth.signUp).not.toHaveBeenCalled();
  expect(auth.resendConfirmation).not.toHaveBeenCalled();
});
it("e-mail desconhecido não encaminha automaticamente ao cadastro nem revela existência", async () => {
  const auth = account(), user = userEvent.setup();
  auth.signIn.mockRejectedValueOnce(new AccountAuthError("E-mail, nick ou senha incorretos. Confira e tente novamente"));
  render(<ProfilePanel initialTab="account" profile={null} account={auth} onSaveLocal={vi.fn()} onSaved={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.type(screen.getByLabelText("E-mail ou nome de usuário"), "new@example.com");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Preencha sua senha");
  expect(auth.signIn).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Senha"), "my-password");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("E-mail, nick ou senha incorretos");
  expect(screen.getByLabelText("Senha")).toHaveAttribute("autocomplete", "current-password");
  expect(auth.signIn).toHaveBeenCalledWith("new@example.com", "my-password");
  expect(auth.signUp).not.toHaveBeenCalled();
});
it("entra com nick sem consultar e-mail e mantém o cadastro por e-mail disponível", async () => {
  const auth = account(),
    user = userEvent.setup();
  render(
    <ProfilePanel
      initialTab="account"
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.type(screen.getByLabelText("E-mail ou nome de usuário"), "@Dani");
  await user.type(screen.getByLabelText("Senha"), "test-password");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(auth.signIn).toHaveBeenCalledWith("@Dani", "test-password");
});
