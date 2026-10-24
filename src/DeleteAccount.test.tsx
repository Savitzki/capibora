import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import DeleteAccount from "./DeleteAccount";

it("exige confirmação explícita e informa também a perda de registros pendentes", async () => {
  const remove = vi.fn();
  const user = userEvent.setup();
  render(<DeleteAccount onDelete={remove} />);
  await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));
  expect(screen.getByText(/ainda não sincronizados/)).toBeVisible();
  const submit = screen.getByRole("button", {
    name: "Excluir definitivamente",
  });
  expect(submit).toBeDisabled();
  await user.type(
    screen.getByLabelText("Digite EXCLUIR para confirmar"),
    "EXCLUIR",
  );
  await user.click(submit);
  expect(remove).toHaveBeenCalledTimes(1);
});
it("cancelar não exclui nem preserva uma confirmação para a próxima tentativa", async () => {
  const remove = vi.fn();
  const user = userEvent.setup();
  render(<DeleteAccount onDelete={remove} />);
  await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));
  await user.type(
    screen.getByLabelText("Digite EXCLUIR para confirmar"),
    "EXCLUIR",
  );
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));
  expect(screen.getByLabelText("Digite EXCLUIR para confirmar")).toHaveValue(
    "",
  );
  expect(remove).not.toHaveBeenCalled();
});
it("preserva o formulário se a rede falhar e bloqueia confirmações simultâneas", async () => {
  let reject!: (reason: Error) => void;
  const remove = vi.fn(() =>
    new Promise<void>((_, fail) => {
      reject = fail;
    })
  );
  const user = userEvent.setup();
  render(<DeleteAccount onDelete={remove} />);
  await user.click(screen.getByRole("button", { name: "Excluir minha conta" }));
  await user.type(
    screen.getByLabelText("Digite EXCLUIR para confirmar"),
    "EXCLUIR",
  );
  await user.dblClick(
    screen.getByRole("button", { name: "Excluir definitivamente" }),
  );
  expect(remove).toHaveBeenCalledTimes(1);
  await act(async () => {
    reject(new Error("Falha temporária"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Falha temporária");
  expect(screen.getByLabelText("Digite EXCLUIR para confirmar")).toHaveValue(
    "EXCLUIR",
  );
});
