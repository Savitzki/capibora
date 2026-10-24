import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import ProfilePanel from "./ProfilePanel";
import { NicknameConflictError } from "./nickname";
import type { Account } from "./account";
import type { Profile } from "./profile";
const profile: Profile = {
  nickname: "Dani",
  color: "orange",
  style: "initials",
  photo: null,
};
function account(): Account {
  return {
    configured: true,
    initializing: false,
    user: { id: "user", email: "me@example.invalid" } as Account["user"],
    phrasePreferences: { displayName: "Dani", treatment: "neutral" },
    profile: null,
    profileLoading: false,
    profileChecked: true,
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
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
    passwordRecovery: false,
    requestPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    dismissPasswordRecovery: vi.fn(),
    signInWithGoogle: vi.fn(),
    saveProfile: vi.fn().mockResolvedValue(undefined),
  };
}
it("bloqueia o nick salvo, mas permite mudar avatar e nome das frases", async () => {
  const auth = account(),
    user = userEvent.setup();
  auth.profile = profile;
  render(
    <ProfilePanel
      profile={profile}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Editar perfil" }));
  expect(screen.queryByLabelText("Nome de usuário")).not.toBeInTheDocument();
  expect(screen.getByRole("region", {name:"Dados da conta"})).toHaveTextContent("@Dani");
  expect(screen.queryByLabelText("Sexo")).not.toBeInTheDocument();
  await user.clear(screen.getByLabelText("Como quer ser chamado no app?"));
  await user.type(screen.getByLabelText("Como quer ser chamado no app?"), "Daniela");
  await user.click(screen.getByRole("radio", { name: "Azul" }));
  if (screen.queryByLabelText("Sexo")) await user.selectOptions(screen.getByLabelText("Sexo"), "neutral");
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
  expect(auth.saveProfile).toHaveBeenCalledWith(
    expect.objectContaining({ nickname: "Dani", color: "blue" }),
    expect.objectContaining({ displayName: "Daniela" }),
  );
  expect(auth.checkNickname).not.toHaveBeenCalled();
});
it("mostra sugestões livres para nick ocupado e salva a escolhida", async () => {
  const auth = account(),
    user = userEvent.setup(),
    onSaved = vi.fn();
  vi.mocked(auth.checkNickname).mockImplementation(async (n) => ({
    valid: true,
    available: n !== "Dani",
    suggestions: n === "Dani" ? ["Dani_1", "Dani_2", "Dani_3"] : [],
  }));
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={onSaved}
    />,
  );
  await user.type(screen.getByLabelText("Nome de usuário"), "Dani");
  await screen.findByText("Esse nick já está em uso");
  expect(screen.getByRole("button", { name: "Salvar perfil" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Dani_2" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Salvar perfil" })).toBeEnabled(),
  );
  if (screen.queryByLabelText("Sexo")) await user.selectOptions(screen.getByLabelText("Sexo"), "neutral");
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
  expect(auth.saveProfile).toHaveBeenCalledWith(
    expect.objectContaining({ nickname: "Dani_2" }),
    expect.anything(),
  );
  expect(onSaved).toHaveBeenCalledOnce();
});
it("um conflito entre a consulta e o salvamento oferece outras sugestões e não anuncia sucesso", async () => {
  const auth = account(),
    user = userEvent.setup(),
    onSaved = vi.fn();
  vi.mocked(auth.saveProfile).mockRejectedValue(
    new NicknameConflictError(["Dani_8"]),
  );
  render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={onSaved}
    />,
  );
  await user.type(screen.getByLabelText("Nome de usuário"), "Dani");
  if (screen.queryByLabelText("Sexo")) await user.selectOptions(screen.getByLabelText("Sexo"), "neutral");
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
  await screen.findByRole("button", { name: "Dani_8" });
  expect(onSaved).not.toHaveBeenCalled();
});

it("o perfil reúne os dados e o botão de sair, sem abas de conta ou configurações", async () => {
  const auth = account(),
    user = userEvent.setup();
  auth.profile = profile;
  render(
    <ProfilePanel
      profile={profile}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  expect(screen.getByText("@Dani")).toBeInTheDocument();
  expect(screen.queryByText("me@example.invalid")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Editar perfil"}));
  expect(screen.getByRole("region", { name: "Dados da conta" })).toHaveTextContent("me@example.invalid");
  expect(screen.queryByText("Sexo")).not.toBeInTheDocument();
  expect(screen.getByRole("form", { name: "Editar perfil" })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "Minha conta" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Configurações" }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Sair da conta" }));
  expect(auth.signOut).toHaveBeenCalledOnce();
});
it("uma falha ao sair mantém o perfil e explica o motivo", async () => {
  const auth = account(),
    user = userEvent.setup();
  vi.mocked(auth.signOut).mockRejectedValue(
    new Error("Aguarde os pesos sincronizarem"),
  );
  render(
    <ProfilePanel
      profile={profile}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Sair da conta" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Aguarde os pesos sincronizarem",
  );
  expect(screen.getByText("@Dani")).toBeInTheDocument();
});

it("descarta a edição sem salvar e restaura a prévia do avatar e o nome", async () => {
  const auth = account(), user = userEvent.setup();
  render(
    <ProfilePanel profile={profile} account={auth} onSaveLocal={vi.fn()} onSaved={vi.fn()} />,
  );
  await user.click(screen.getByRole("button", { name: "Editar perfil" }));
  await user.clear(screen.getByLabelText("Como quer ser chamado no app?"));
  await user.type(screen.getByLabelText("Como quer ser chamado no app?"), "Daniela");
  await user.click(screen.getByRole("radio", { name: "Azul" }));
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("heading", { name: "Dani" })).toBeInTheDocument();
  expect(screen.queryByRole("form", { name: "Editar perfil" })).not.toBeInTheDocument();
  expect(auth.saveProfile).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Editar perfil" }));
  expect(screen.getByLabelText("Como quer ser chamado no app?")).toHaveValue("Dani");
  expect(screen.getByRole("radio", { name: "Laranja" })).toHaveAttribute("aria-checked", "true");
});

it("mostra a trajetória sem expor dados de peso e separa a customização", () => {
  render(
    <ProfilePanel profile={profile} account={account()} onSaveLocal={vi.fn()} onSaved={vi.fn()} stats={{workouts: 30, streak: 4, bestStreak: 10}}>
      <p>Conquistas da conta</p>
    </ProfilePanel>,
  );
  const journey = screen.getByRole("region", { name: "Sua trajetória" });
  expect(journey).toHaveTextContent(/Treinos30\s*Ofensiva4 dias\s*Recorde10 dias/);
  expect(screen.getByText("Conquistas da conta")).toBeInTheDocument();
  expect(screen.queryByLabelText("Peso (kg)")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Salvar perfil" })).not.toBeInTheDocument();
});

it("só anuncia cadastro completo após salvar todas as informações, inclusive numa nova tentativa", async () => {
  const auth = account(),
    user = userEvent.setup(),
    completed = vi.fn(),
    saved = vi.fn();
  vi.mocked(auth.saveProfile)
    .mockRejectedValueOnce(
      new Error("Perfil salvo, mas as preferências falharam"),
    )
    .mockResolvedValueOnce(undefined);
  const view = render(
    <ProfilePanel
      profile={null}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={saved}
      onRegistrationCompleted={completed}
    />,
  );
  await user.type(screen.getByLabelText("Nome de usuário"), "Dani");
  if (screen.queryByLabelText("Sexo")) await user.selectOptions(screen.getByLabelText("Sexo"), "neutral");
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "as preferências falharam",
  );
  expect(completed).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
  auth.profile = profile;
  view.rerender(
    <ProfilePanel
      profile={profile}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={saved}
      onRegistrationCompleted={completed}
    />,
  );
  if (screen.queryByLabelText("Sexo")) await user.selectOptions(screen.getByLabelText("Sexo"), "neutral");
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
  expect(completed).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button",{name:"Editar perfil"}));
  if (screen.queryByLabelText("Sexo")) await user.selectOptions(screen.getByLabelText("Sexo"), "neutral");
  await user.click(screen.getByRole("button", { name: "Salvar perfil" }));
  expect(completed).toHaveBeenCalledOnce();
});

it("integra capa, avatar e nome abaixo da ilustração, com edição acessível por ícone", async () => {
  const auth = account();
  const { container } = render(
    <ProfilePanel
      profile={profile}
      account={auth}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  const copy = container.querySelector(".profile-identity-copy")!;
  const portrait = container.querySelector(".profile-portrait")!;
  const banner = container.querySelector(".profile-banner")!;
  expect(
    banner.compareDocumentPosition(portrait) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    portrait.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(copy).toHaveTextContent("Dani");
  expect(copy).toHaveTextContent("@Dani");
  const edit = screen.getByRole("button", { name: "Editar perfil" });
  expect(edit).toHaveTextContent("");
  expect(edit.querySelector("svg")).not.toBeNull();
  expect(banner.querySelector("button,input,h3")).toBeNull();
  expect(screen.queryByLabelText("Nick permanente")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Foto do avatar")).toBeEnabled();
  expect(
    container.querySelector(".profile-banner-placeholder"),
  ).toHaveAttribute("aria-hidden", "true");
  await userEvent.click(edit);
  expect(screen.getByRole("form", { name: "Editar perfil" })).toBeVisible();
});

it("preserva a moldura equipada sobre a foto sem mudar as dimensões do avatar", () => {
  const { container, rerender } = render(
    <ProfilePanel
      profile={profile}
      account={account()}
      cosmeticFrame="frame-water-wave"
      cosmeticBanner="banner-sunset"
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  const portrait = container.querySelector(".profile-portrait")!;
  expect(portrait.querySelector(".profile-avatar")).toHaveAttribute(
    "width",
    "84",
  );
  expect(portrait.querySelector(".profile-avatar")).toHaveAttribute(
    "height",
    "84",
  );
  expect(portrait.querySelector(".avatar-frame-art")).toHaveAttribute(
    "src",
    expect.stringContaining("onda-aquatica.webp"),
  );
  expect(portrait.querySelector(".framed-avatar")).toHaveStyle({
    width: "84px",
    height: "84px",
  });
  rerender(
    <ProfilePanel
      profile={profile}
      account={account()}
      onSaveLocal={vi.fn()}
      onSaved={vi.fn()}
    />,
  );
  expect(container.querySelector(".avatar-frame-art")).toBeNull();
  expect(container.querySelector(".profile-cover")).toBeNull();
  expect(
    container.querySelector(".profile-banner-placeholder"),
  ).toBeInTheDocument();
});

it("preserva o banner equipado e sua aparência padrão se a imagem falhar", () => {
  const {container}=render(<ProfilePanel profile={profile} account={account()} cosmeticBanner="banner-sunset" onSaveLocal={vi.fn()} onSaved={vi.fn()} />);
  expect(container.querySelector(".profile-cover")).not.toBeNull();
  expect(container.querySelector(".profile-banner-placeholder")).toBeNull();
  fireEvent.error(container.querySelector(".profile-cover")!);
  expect(container.querySelector(".profile-cover")).toBeNull();
  expect(container.querySelector(".profile-banner-placeholder")).not.toBeNull();
});

it("edita só nome e avatar, preservando nick e sexo sem expor campos de edição", async () => {
 const auth=account(),user=userEvent.setup();auth.phrasePreferences={displayName:"Daniela",treatment:"feminine"};
 render(<ProfilePanel profile={profile} account={auth} onSaveLocal={vi.fn()} onSaved={vi.fn()} />);
 await user.click(screen.getByRole("button",{name:"Editar perfil"}));
 expect(screen.queryByLabelText("Nome de usuário")).not.toBeInTheDocument();
 expect(screen.queryByLabelText("Sexo")).not.toBeInTheDocument();
 const details=screen.getByRole("region",{name:"Dados da conta"});
 expect(details).toBeVisible();expect(details).toHaveTextContent("@Dani");expect(details).toHaveTextContent("me@example.invalid");
 expect(details.querySelector("input,select,details")).toBeNull();
 await user.clear(screen.getByLabelText("Como quer ser chamado no app?"));
 await user.type(screen.getByLabelText("Como quer ser chamado no app?"),"Dani nova");
 await user.click(screen.getByRole("radio",{name:"Montanha"}));
 await user.click(screen.getByRole("radio",{name:"Azul"}));
 await user.click(screen.getByRole("button",{name:"Salvar perfil"}));
 expect(auth.saveProfile).toHaveBeenCalledWith(expect.objectContaining({nickname:"Dani",style:"mountain",color:"blue"}),{displayName:"Dani nova",treatment:"feminine"});
 expect(auth.user?.email).toBe("me@example.invalid");expect(auth.checkNickname).not.toHaveBeenCalled();
});
it("exige nome, sexo explícito e usuário sem @ somente no primeiro perfil", async () => {
  const auth = account(); auth.phrasePreferences = { displayName: "", treatment: "neutral" };
  render(<ProfilePanel account={auth} profile={null} onSaveLocal={vi.fn()} onSaved={vi.fn()} />);
  const form = screen.getByRole("form", { name: "Editar perfil" });
  await userEvent.type(screen.getByLabelText("Nome de usuário"), "Dani");
  fireEvent.submit(form); expect(await screen.findByRole("alert")).toHaveTextContent("Informe seu nome");
  await userEvent.type(screen.getByLabelText("Nome", { exact: true }), "Daniela");
  fireEvent.submit(form); expect(await screen.findByRole("alert")).toHaveTextContent("Selecione seu sexo");
  await userEvent.selectOptions(screen.getByLabelText("Sexo"), "feminine");
  await userEvent.clear(screen.getByLabelText("Nome de usuário"));
  await userEvent.type(screen.getByLabelText("Nome de usuário"), "@Dani");
  fireEvent.submit(form); expect(await screen.findByRole("alert")).toHaveTextContent("sem @");
  expect(auth.saveProfile).not.toHaveBeenCalled();
  await userEvent.clear(screen.getByLabelText("Nome de usuário"));
  await userEvent.type(screen.getByLabelText("Nome de usuário"), "Dani");
  await userEvent.click(screen.getByRole("button", { name: "Salvar perfil" }));
  expect(auth.saveProfile).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ nickname: "Dani" }), { displayName: "Daniela", treatment: "feminine" });
});

it("pede confirmação contextual antes de descartar registros manuais no logout", async () => {
  const { PendingWorkoutLogoutError } = await import("./accountStorage");
  const auth = account();
  vi.mocked(auth.signOut).mockRejectedValueOnce(new PendingWorkoutLogoutError()).mockResolvedValueOnce();
  render(<ProfilePanel profile={profile} account={auth} onSaveLocal={vi.fn()} onSaved={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "Sair da conta" }));
  expect(screen.getByRole("alert")).toHaveTextContent(/rascunhos serão descartados/);
  await userEvent.click(screen.getByRole("button", { name: "Sair e descartar rascunhos" }));
  expect(auth.signOut).toHaveBeenLastCalledWith(true);
});
