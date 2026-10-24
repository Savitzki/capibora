import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import PasswordRecovery from "./PasswordRecovery";
it("valida confirmação e mantém os campos quando o servidor recusa", async () => {
  const save = vi.fn().mockRejectedValue(new Error("Link expirado"));
  const done = vi.fn();
  const user = userEvent.setup();
  render(
    <PasswordRecovery onSave={save} onSaved={done} onBusyChange={vi.fn()} />,
  );
  await user.type(screen.getByLabelText("Nova senha"), "synthetic-password");
  await user.type(
    screen.getByLabelText("Confirmar nova senha"),
    "synthetic-different",
  );
  await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("As senhas não conferem");
  await user.clear(screen.getByLabelText("Confirmar nova senha"));
  await user.type(
    screen.getByLabelText("Confirmar nova senha"),
    "synthetic-password",
  );
  await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
  expect(done).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Link expirado");
  expect(screen.getByLabelText("Nova senha")).toHaveValue("synthetic-password");
});
it("informa conclusão somente após resposta de sucesso", async () => {
  const save = vi.fn().mockResolvedValue(undefined), done = vi.fn();
  const user = userEvent.setup();
  render(
    <PasswordRecovery onSave={save} onSaved={done} onBusyChange={vi.fn()} />,
  );
  await user.type(screen.getByLabelText("Nova senha"), "synthetic-password");
  await user.type(
    screen.getByLabelText("Confirmar nova senha"),
    "synthetic-password",
  );
  await user.click(screen.getByRole("button", { name: "Salvar nova senha" }));
  expect(save).toHaveBeenCalledOnce();
  expect(done).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Nova senha")).toHaveValue("");
});
