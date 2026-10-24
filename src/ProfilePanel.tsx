import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Camera,
  Image as ImageIcon,
  Check,
  Smartphone,
  LogOut,
  Pencil,
  Mail,
  Flame,
  Trophy,
  Dumbbell,
} from "lucide-react";
import { useFormViewport } from "./useDialogViewport";
import { PendingWorkoutLogoutError } from "./accountStorage";
import DeleteAccount from "./DeleteAccount";
import { Avatar } from "./Avatar";
import { ProfileCover } from "./ProfileCosmetics";
import type { Account } from "./account";
import AccountForm from "./AccountForm";
import PhrasePreferencesFields from "./PhrasePreferencesFields";
import { defaultPhrasePreferences } from "./phrasePreferences";
import {
  isNickname,
  NicknameConflictError,
  type NicknameAvailability,
} from "./nickname";
import {
  AVATAR_COLORS,
  AVATAR_STYLES,
  blankProfile,
  normalizeNickname,
  preparePhoto,
  validateProfile,
  type Profile,
} from "./profile";

export { Avatar } from "./Avatar";

export default function ProfilePanel({
  profile,
  account,
  onSaveLocal,
  onSaved,
  onRegistrationCompleted,
  cosmeticFrame,
  cosmeticBanner,
  stats,
  children,
  initialTab = "profile",
}: {
  profile: Profile | null;
  account: Account;
  onSaveLocal: (profile: Profile) => void;
  onSaved: (message: string) => void;
  onRegistrationCompleted?: () => void;
  cosmeticFrame?: string;
  cosmeticBanner?: string;
  stats?: { workouts: number; streak: number; bestStreak: number };
  children?: ReactNode;
  initialTab?: "profile" | "account";
}) {
  const formViewport = useRef<HTMLDivElement>(null);
  useFormViewport(formViewport);
  const [authOpen, setAuthOpen] = useState(initialTab === "account");
  const [editing, setEditing] = useState(!profile);
  const registrationPending = useRef(false);
  useEffect(() => {
    if (
      account.user &&
      account.profileChecked &&
      !account.profileLoading &&
      !account.profileError &&
      !profile
    )
      registrationPending.current = true;
  }, [
    account.user?.id,
    account.profileChecked,
    account.profileLoading,
    account.profileError,
    profile,
  ]);
  const [phrasePreferences, setPhrasePreferences] = useState(
    account.phrasePreferences ?? defaultPhrasePreferences(),
  );
  useEffect(
    () =>
      setPhrasePreferences(
        account.phrasePreferences ?? defaultPhrasePreferences(),
      ),
    [
      account.phrasePreferences?.displayName,
      account.phrasePreferences?.treatment,
    ],
  );
  const [draft, setDraft] = useState<Profile>(() => profile ?? blankProfile());
  const [busy, setBusy] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  useEffect(() => { setConfirmSignOut(false); }, [account.user?.id]);
  const saving = useRef(false);
  const [initialTreatment, setInitialTreatment] = useState(
    account.phrasePreferences?.treatment === "neutral"
      ? ""
      : (account.phrasePreferences?.treatment ?? ""),
  );
  const completingProfile = !profile || registrationPending.current;
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [availability, setAvailability] = useState<NicknameAvailability | null>(
    null,
  );
  const [checkingNick, setCheckingNick] = useState(false);
  const nicknameLocked = Boolean(account.user && profile);
  const displayName =
    phrasePreferences.displayName.trim() || draft.nickname || "Seu perfil";
  function cancelEditing() {
    setDraft(profile ?? blankProfile());
    setPhrasePreferences(
      account.phrasePreferences ?? defaultPhrasePreferences(),
    );
    setAvailability(null);
    setError("");
    setEditing(false);
  }
  useEffect(() => {
    setAvailability(null);
    setCheckingNick(false);
    if (!account.user || nicknameLocked || !isNickname(draft.nickname)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setCheckingNick(true);
      void account
        .checkNickname(draft.nickname)
        .then((result) => {
          if (!cancelled) {
            setAvailability(result);
            setError("");
          }
        })
        .catch(() => {
          if (!cancelled)
            setError(
              "Não foi possível conferir seu nick. Tente salvar novamente",
            );
        })
        .finally(() => {
          if (!cancelled) setCheckingNick(false);
        });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [account.user?.id, nicknameLocked, draft.nickname]);
  useEffect(() => {
    setDraft(profile ?? blankProfile());
  }, [profile]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current || photoBusy) return;
    saving.current = true;
    setError("");
    setBusy(true);
    try {
      if (completingProfile) {
        if (!phrasePreferences.displayName.trim())
          throw new Error("Informe seu nome");
        if (!initialTreatment) throw new Error("Selecione seu sexo");
        if (draft.nickname.includes("@"))
          throw new Error("Informe o nome de usuário sem @");
      }
      const valid = validateProfile({
        ...draft,
        nickname: nicknameLocked
          ? profile!.nickname
          : normalizeNickname(draft.nickname),
      });
      if (account.user && !nicknameLocked) {
        const checked = await account.checkNickname(valid.nickname);
        setAvailability(checked);
        if (!checked.valid || !checked.available)
          throw new NicknameConflictError(checked.suggestions);
      }
      if (account.user)
        await account.saveProfile(valid, {
          ...phrasePreferences,
          treatment: completingProfile
            ? (initialTreatment as typeof phrasePreferences.treatment)
            : (account.phrasePreferences?.treatment ??
              phrasePreferences.treatment),
        });
      else onSaveLocal(valid);
      setEditing(false);
      onSaved(
        account.user
          ? "Perfil salvo na sua conta."
          : "Perfil salvo neste dispositivo.",
      );
      if (account.user && registrationPending.current) {
        registrationPending.current = false;
        onRegistrationCompleted?.();
      }
    } catch (error) {
      if (error instanceof NicknameConflictError)
        setAvailability({
          valid: true,
          available: false,
          suggestions: error.suggestions,
        });
      setError((error as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  if (authOpen && !account.user)
    return (
      <div ref={formViewport} className="profile-panel auth-panel">
        <AccountForm
          account={account}
          profile={profile}
          onSignedIn={() => setAuthOpen(false)}
        />
      </div>
    );
  return (
    <div
      ref={formViewport}
      className="profile-panel profile-redesign"
      data-critical-operation
      aria-busy={busy || photoBusy}
    >
      <section
        className={`profile-identity${editing ? " profile-identity-editing" : ""}`}
        aria-label="Identidade do perfil"
      >
        {!editing && (
          <div className="profile-banner">
            <ProfileCover
              banner={cosmeticBanner}
              fallback={
                <span className="profile-banner-placeholder" aria-hidden="true">
                  <ImageIcon size={32} />
                </span>
              }
            />
          </div>
        )}
        <div className="profile-identity-main">
          <div className="profile-identity-toolbar">
            <div className="profile-portrait">
              <Avatar
                profile={draft.nickname ? draft : { ...draft, nickname: "CA" }}
                size={84}
                frame={cosmeticFrame}
              />
              <label
                className={`photo-upload profile-photo-button ${photoBusy ? "is-busy" : ""}`}
                title="Alterar foto"
              >
                <Camera size={15} aria-hidden="true" />
                <span className="sr-only">
                  {photoBusy ? "Preparando…" : "Alterar foto"}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Foto do avatar"
                  disabled={photoBusy || busy || account.profileLoading}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    setEditing(true);
                    setPhotoBusy(true);
                    setError("");
                    try {
                      const photo = await preparePhoto(file);
                      setDraft((prev) => ({ ...prev, photo }));
                    } catch (error) {
                      setError((error as Error).message);
                    } finally {
                      setPhotoBusy(false);
                    }
                  }}
                />
              </label>
            </div>
            {!editing && !account.profileLoading && (
              <button
                type="button"
                className="icon-button profile-edit-button"
                aria-label="Editar perfil"
                title="Editar perfil"
                onClick={() => setEditing(true)}
              >
                <Pencil size={19} aria-hidden="true" />
              </button>
            )}
          </div>
          {editing && (
            <>
              {draft.photo && (
                <button
                  className="text-button profile-remove-photo"
                  type="button"
                  disabled={photoBusy || busy}
                  onClick={() => setDraft((prev) => ({ ...prev, photo: null }))}
                >
                  Remover foto
                </button>
              )}
            </>
          )}
          {!editing && (
            <div className="profile-identity-copy">
              <h3>{displayName}</h3>
              <p className="profile-handle">
                {draft.nickname ? "@" + draft.nickname : "Escolha seu @nick"}
              </p>
            </div>
          )}
        </div>
        {!account.user && (
          <div className="profile-identity-footer">
            <span className="profile-connection">
              <Smartphone size={13} /> Neste celular
            </span>
          </div>
        )}
      </section>
      {!account.user && (
        <button
          type="button"
          className="primary-button profile-login"
          onClick={() => setAuthOpen(true)}
        >
          Entrar na conta
        </button>
      )}
      {account.profileLoading ? (
        <p role="status" className="modal-description">
          Carregando seu perfil…
        </p>
      ) : account.profileError && !profile ? (
        <div className="form-error" role="alert">
          {account.profileError}
          <button type="button" className="text-button" onClick={account.retry}>
            Tentar novamente
          </button>
        </div>
      ) : editing ? (
        <form
          className="profile-editor"
          aria-label="Editar perfil"
          onSubmit={save}
        >
          {completingProfile && <h3>Completar o perfil</h3>}

          {!nicknameLocked && (
            <>
              <label className="form-label">
                Nome de usuário
                <input
                  autoComplete="nickname"
                  maxLength={24}
                  placeholder="Ex.: dani.treina"
                  required
                  disabled={busy}
                  aria-describedby="nickname-rules"
                  aria-invalid={availability?.available === false || undefined}
                  value={draft.nickname}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      nickname: event.target.value,
                    }))
                  }
                />
              </label>
              <p className="field-hint nickname-rules" id="nickname-rules">
                {account.user
                  ? "3–24 caracteres · letras, números, . - _ · permanente"
                  : "Nick local · entre na conta para reservar um @nick único"}
              </p>
              {checkingNick && (
                <p className="field-hint" role="status">
                  Conferindo nick…
                </p>
              )}
              {availability && !availability.available && (
                <div className="nickname-feedback" role="alert">
                  <p>Esse nick já está em uso</p>
                  {!!availability.suggestions.length && (
                    <div
                      className="nickname-suggestions"
                      aria-label="Sugestões de nick"
                    >
                      {availability.suggestions.map((nick) => (
                        <button
                          className="outline-button"
                          key={nick}
                          type="button"
                          onClick={() => {
                            setDraft((prev) => ({ ...prev, nickname: nick }));
                            setError("");
                          }}
                        >
                          {nick}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
          <fieldset className="avatar-options" disabled={busy || photoBusy}>
            <legend>Estilo do avatar</legend>
            <div
              className="avatar-styles"
              role="radiogroup"
              aria-label="Estilo do avatar"
            >
              {Object.entries(AVATAR_STYLES).map(([id, label]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={!draft.photo && draft.style === id}
                  aria-label={label}
                  key={id}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      style: id as Profile["style"],
                      photo: null,
                    }))
                  }
                >
                  <Avatar
                    profile={{
                      ...draft,
                      nickname: draft.nickname || "CA",
                      style: id as Profile["style"],
                      photo: null,
                    }}
                    size={43}
                  />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="avatar-options" disabled={busy || photoBusy}>
            <legend>Cor do avatar</legend>
            <div
              className="avatar-colors"
              role="radiogroup"
              aria-label="Cor do avatar"
            >
              {Object.entries(AVATAR_COLORS).map(([id, color]) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={draft.color === id}
                  aria-label={color.label}
                  key={id}
                  style={{
                    background: color.background,
                    color: color.foreground,
                  }}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      color: id as Profile["color"],
                    }))
                  }
                >
                  {draft.color === id && <Check size={20} />}
                </button>
              ))}
            </div>
          </fieldset>

          <PhrasePreferencesFields
            value={phrasePreferences}
            onChange={setPhrasePreferences}
            field="name"
            nameLabel={
              completingProfile ? "Nome" : "Como quer ser chamado no app?"
            }
            required={completingProfile}
          />
          {completingProfile && (
            <label className="form-label">
              Sexo
              <select
                aria-label="Sexo"
                required
                disabled={busy}
                value={initialTreatment}
                onChange={(event) => setInitialTreatment(event.target.value)}
              >
                <option value="" disabled>
                  Selecione
                </option>
                <option value="masculine">Masculino</option>
                <option value="feminine">Feminino</option>
                <option value="neutral">Prefiro não informar</option>
              </select>
            </label>
          )}
          {account.user && (
            <section
              className="profile-details profile-account-details"
              aria-label="Dados da conta"
            >
              <h3>Dados da conta</h3>
              <dl>
                {nicknameLocked && (
                  <div>
                    <dt>Nick permanente</dt>
                    <dd>@{profile!.nickname}</dd>
                  </div>
                )}
                <div>
                  <dt>
                    <Mail size={15} aria-hidden="true" /> E-mail
                  </dt>
                  <dd>{account.user.email || "Não informado"}</dd>
                </div>
              </dl>
            </section>
          )}
          <div className="profile-editor-actions">
            {profile && (
              <button
                type="button"
                className="outline-button"
                disabled={busy || photoBusy}
                onClick={cancelEditing}
              >
                Cancelar
              </button>
            )}
            <button
              type="submit"
              className="primary-button form-submit"
              disabled={
                busy ||
                photoBusy ||
                checkingNick ||
                availability?.available === false
              }
            >
              <Check size={17} aria-hidden="true" />
              {busy ? "Salvando…" : "Salvar perfil"}
            </button>
          </div>
        </form>
      ) : (
        <>
          {account.user && stats && (
            <section className="profile-journey" aria-label="Sua trajetória">
              {[
                { label: "Treinos", value: stats.workouts, Icon: Dumbbell },
                { label: "Ofensiva", value: stats.streak, Icon: Flame },
                { label: "Recorde", value: stats.bestStreak, Icon: Trophy },
              ].map(({ label, value, Icon }) => (
                <div key={label}>
                  <span>
                    <Icon size={16} aria-hidden="true" /> {label}
                  </span>
                  <strong>
                    {value}
                    <small>
                      {label === "Treinos"
                        ? ""
                        : value === 1
                          ? " dia"
                          : " dias"}
                    </small>
                  </strong>
                </div>
              ))}
            </section>
          )}
          {account.user && children}
        </>
      )}
      {account.error && (
        <div className="form-error" role="alert">
          {account.error}
          <button className="text-button" type="button" onClick={account.retry}>
            Tentar novamente
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {account.user && (
        <button
          className="outline-button profile-signout"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await account.signOut(confirmSignOut);
            } catch (failure) {
              if (failure instanceof PendingWorkoutLogoutError) setConfirmSignOut(true);
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Não foi possível sair. Tente novamente",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={17} /> {confirmSignOut ? "Sair e descartar rascunhos" : "Sair da conta"}
        </button>
      )}
      {account.user && confirmSignOut && (
        <button className="text-button" disabled={busy} onClick={() => {
          setConfirmSignOut(false); setError("");
        }}>Continuar na conta</button>
      )}
      {account.user && (
        <DeleteAccount key={account.user.id} disabled={busy || photoBusy}
          onDelete={account.deleteAccount} onBusyChange={setBusy} />
      )}
    </div>
  );
}
