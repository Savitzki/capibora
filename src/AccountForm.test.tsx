import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import AccountForm from "./AccountForm";
import type { Account } from "./account";
import Modal from "./Modal";
const makeAccount = () =>
  ({
    configured: true,
    user: null,
    signUp: vi.fn().mockResolvedValue(false),
    signIn: vi.fn().mockResolvedValue(undefined),
    signInWithGoogle: vi.fn(),
    resendConfirmation: vi.fn(),
    requestPasswordReset: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Account;
async function signup(auth = makeAccount()) {
  const signedIn = vi.fn(),
    view = render(
      <AccountForm account={auth} profile={null} onSignedIn={signedIn} />,
    ),
    user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Criar conta" }),
  );
  return { auth, user, signedIn, ...view };
}
it.each(["", "inválido", "bad@example", "a".repeat(250) + "@example.com"])(
  "bloqueia e-mail inválido sem consultar: %s",
  async (email) => {
    const { auth, user } = await signup();
    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: email },
    });
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toBeVisible();
    expect(auth.signUp).not.toHaveBeenCalled();
  },
);
it("remove erro imediatamente ao corrigir e-mail e senha, sem sucesso intermediário", async () => {
  const { auth, user } = await signup();
  await user.type(screen.getByLabelText("E-mail"), "erro");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.clear(screen.getByLabelText("E-mail"));
  await user.type(screen.getByLabelText("E-mail"), "valid@example.com");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  expect(screen.getByLabelText("Senha")).toBeVisible();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("Senha"), "curta");
  await user.click(screen.getByRole("button", { name: "Criar conta" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/8 caracteres/);
  await user.type(screen.getByLabelText("Senha"), "123");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Seu nome")).toBeNull();
  expect(screen.queryByLabelText("Sexo")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /Voltar/ }),
  ).not.toBeInTheDocument();
  expect(auth.signUp).not.toHaveBeenCalled();
});
it("deduplica cliques enquanto o Auth responde sem consultar existência", async () => {
  let finish!: () => void;
  const auth = makeAccount();
  vi.mocked(auth.signIn).mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
  render(<AccountForm account={auth} profile={null} onSignedIn={vi.fn()} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.type(screen.getByLabelText("E-mail ou nome de usuário"), "valid@example.com");
  await user.type(screen.getByLabelText("Senha"), "valid-password");
  await user.dblClick(screen.getByRole("button", { name: "Entrar" }));
  expect(auth.signIn).toHaveBeenCalledOnce();
  expect(auth.signUp).not.toHaveBeenCalled();
  await act(async () => finish());
});
it("falha de rede no login preserva campos e permite repetir a operação real", async () => {
  const auth = makeAccount();
  vi.mocked(auth.signIn).mockRejectedValueOnce(new Error("Não foi possível conectar"));
  const signedIn = vi.fn();
  render(<AccountForm account={auth} profile={null} onSignedIn={signedIn} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.type(screen.getByLabelText("E-mail ou nome de usuário"), "valid@example.com");
  await user.type(screen.getByLabelText("Senha"), "valid-password");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/Não foi possível conectar/);
  expect(screen.getByLabelText("Senha")).toHaveValue("valid-password");
  expect(auth.signUp).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(auth.signIn).toHaveBeenCalledTimes(2);
  expect(signedIn).toHaveBeenCalledOnce();
});
it("X cancela etapas não enviadas e reabre sem senha ou e-mail temporários", async () => {
  const auth = makeAccount();
  function Example() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <button onClick={() => setOpen(true)}>Abrir</button>
        {open && (
          <Modal title="Cadastro" onClose={() => setOpen(false)}>
            <AccountForm account={auth} profile={null} onSignedIn={vi.fn()} />
          </Modal>
        )}
      </>
    );
  }
  const user = userEvent.setup();
  render(<Example />);
  await user.click(
    screen.getByRole("button", { name: "Criar conta" }),
  );
  await user.type(screen.getByLabelText("E-mail"), "valid@example.com");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  await user.type(screen.getByLabelText("Senha"), "private-password");
  await user.click(screen.getByRole("button", { name: "Fechar janela" }));
  expect(auth.signUp).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Abrir" }));
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  expect(screen.getByLabelText("Senha")).toHaveValue("");
  expect(screen.getByLabelText("E-mail ou nome de usuário")).toHaveValue("");
});
it.each([true, false])(
  "cadastro com sessão emitida %s mantém contrato seguro",
  async (issued) => {
    const { auth, user, signedIn } = await signup();
    vi.mocked(auth.signUp).mockResolvedValue(issued);
    await user.type(screen.getByLabelText("E-mail"), "valid@example.com");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.type(screen.getByLabelText("Senha"), "valid-password");
    await user.click(screen.getByRole("button", { name: "Criar conta" }));
    expect(auth.signUp).toHaveBeenCalledOnce();
    if (issued) expect(signedIn).toHaveBeenCalledOnce();
    else {
      expect(signedIn).not.toHaveBeenCalled();
      expect(
        screen.getByRole("heading", { name: "Confira seu e-mail" }),
      ).toBeVisible();
    }
    expect(auth.signIn).not.toHaveBeenCalled();
  },
);
it("abre com as três ações na ordem aprovada e Google não depende dos campos", async () => {
  const auth = makeAccount();
  render(<AccountForm account={auth} profile={null} onSignedIn={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Novo por aqui?" })).toBeVisible();
  expect(screen.getAllByRole("button").map(b => b.textContent)).toEqual(["Entrar", "Criar conta", "Continuar com Google"]);
  expect(screen.queryByLabelText("Senha")).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Continuar com Google" }));
  expect(auth.signInWithGoogle).toHaveBeenCalledOnce();
  expect(auth.signUp).not.toHaveBeenCalled();
});

it("oferece recuperação por e-mail com resposta neutra e sem pedir a senha antiga", async () => {
  const auth = makeAccount();
  const user = userEvent.setup();
  render(<AccountForm account={auth} profile={null} onSignedIn={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  await user.type(screen.getByLabelText("E-mail ou nome de usuário"), "synthetic.nick");
  await user.click(screen.getByRole("button", { name: "Esqueci minha senha" }));
  expect(screen.getByLabelText("E-mail")).toHaveValue("");
  expect(screen.queryByLabelText("Senha")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("E-mail"), "synthetic@example.invalid");
  await user.click(screen.getByRole("button", { name: "Enviar link de recuperação" }));
  expect(auth.requestPasswordReset).toHaveBeenCalledWith("synthetic@example.invalid");
  expect(screen.getByRole("status")).toHaveTextContent(/Se houver uma conta/);
  expect(screen.getByRole("button", { name: "Aguarde para reenviar" })).toBeDisabled();
  expect(auth.signIn).not.toHaveBeenCalled();
});
