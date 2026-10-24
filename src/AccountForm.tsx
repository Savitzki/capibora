import CapiboraMessage from "./CapiboraMessage";
import { CAPIBORA_PHRASES } from "./capiboraVoice";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Cloud, LogOut, Mail } from "lucide-react";
import type { Account } from "./account";
import {
  AccountAuthError,
  AccountExistsError,
  type AccountField,
} from "./accountErrors";
import PasswordInput from "./PasswordInput";
import Mascot from "./Mascot";
import type { Profile } from "./profile";
import { isEmailAddress, isNickname } from "./nickname";

const signupLines = CAPIBORA_PHRASES.filter((p) => p.context === "signup");

export default function AccountForm({
  account,
  profile,
  onSignedIn,
}: {
  account: Account;
  profile: Profile | null;
  onSignedIn: () => void;
}) {
  const [mode, setMode] = useState<"welcome" | "signup" | "signin" | "recovery">("welcome");
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [message, setMessage] = useState("");
  const [resetCooldown, setResetCooldown] = useState(false);
  useEffect(() => {
    if (!resetCooldown) return;
    const timer = window.setTimeout(() => setResetCooldown(false), 60000);
    return () => window.clearTimeout(timer);
  }, [resetCooldown]);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<AccountField>();
  const [googleError, setGoogleError] = useState("");
  const emailInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const stepRoot = useRef<HTMLDivElement>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const googleErrorElement = useRef<HTMLParagraphElement>(null);
  const messageElement = useRef<HTMLParagraphElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (awaitingConfirmation) {
      confirmationHeading.current?.focus({ preventScroll: true });
      confirmationHeading.current?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    if (account.user || !account.configured) return;
    const input =
      mode === "recovery" ? emailInput.current : mode === "signup"
        ? stepRoot.current?.querySelector<HTMLElement>("input, select")
        : email
          ? passwordInput.current
          : emailInput.current;
    input?.focus({ preventScroll: true });
  }, [mode, step, awaitingConfirmation, account.user, account.configured]);
  useEffect(() => {
    const target = googleError
      ? googleErrorElement.current
      : error
        ? errorElement.current
        : messageElement.current;
    if (!target) return;
    if (googleError || error) target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "nearest", behavior: "instant" });
  }, [googleError, error, message]);

  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function clearFeedback() {
    setError("");
    setErrorField(undefined);
    setGoogleError("");
    setMessage("");
  }
  function showError(error: unknown) {
    setError(
      error instanceof Error
        ? error.message
        : "Não foi possível concluir agora. Tente novamente",
    );
    const field = error instanceof AccountAuthError ? error.field : undefined;
    setErrorField(field);
    if (mode === "signup" && field) setStep(field === "email" ? 0 : 1);
  }
  function validEmail() {
    if (
      email.trim().length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      showError(
        new AccountAuthError("Confira se o e-mail está correto", "email"),
      );
      return false;
    }
    return true;
  }
  function changeMode(next: "signup" | "signin" | "recovery") {
    setMode(next);
    setStep(0);
    setAwaitingConfirmation(false);
    setPassword("");
    if ((next === "signup" || next === "recovery") && !isEmailAddress(email)) setEmail("");
    clearFeedback();
  }
  async function resendConfirmation() {
    if (busy) return;
    clearFeedback();
    if (!isEmailAddress(email)) {
      showError(
        new AccountAuthError(
          "Informe seu e-mail para reenviar a confirmação",
          "email",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      await account.resendConfirmation(email);
      setMessage(
        "Se houver um cadastro pendente, você receberá um novo link. Confira também o spam.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || pending.current) return;
    pending.current = true;
    try {
      await submitCurrent();
    } finally {
      pending.current = false;
    }
  }
  async function submitCurrent() {
    clearFeedback();
    if (mode === "recovery") {
      if (resetCooldown || !validEmail()) return;
      setBusy(true);
      try {
        await account.requestPasswordReset(email);
        if (alive.current) {
          setMessage("Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha. Confira também o spam.");
          setResetCooldown(true);
        }
      } catch (error) { if (alive.current) showError(error); }
      finally { if (alive.current) setBusy(false); }
      return;
    }
    // Previous fields are unmounted; validate them again before the final request.
    const finalStep = step === 1;
    const nicknameLogin =
      mode === "signin" && !isEmailAddress(email) && isNickname(email);
    if (mode === "signin" && !nicknameLogin && !isEmailAddress(email)) {
      showError(
        new AccountAuthError(
          "Informe um e-mail ou nome de usuário válido",
          "email",
        ),
      );
      return;
    }
    if (mode === "signup" && (step === 0 || finalStep) && !validEmail()) return;
    // Email existence is private. Only Auth handles it after final submission.
    if (mode === "signup" && step === 0) {
      setStep(1);
      return;
    }
    if (
      (mode === "signin" || step === 1 || finalStep) &&
      (!password || (mode === "signup" && password.length < 8))
    ) {
      showError(
        new AccountAuthError(
          mode === "signup"
            ? "Use pelo menos 8 caracteres"
            : "Preencha sua senha",
          "password",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const signedIn = await account.signUp(email, password);
        if (signedIn && alive.current) onSignedIn();
        else if (alive.current) setAwaitingConfirmation(true);
      } else {
        await account.signIn(email, password);
        if (alive.current) onSignedIn();
      }
      setPassword("");
    } catch (error) {
      if (error instanceof AccountExistsError) {
        // Same presentation as an unconfirmed signup; never expose existence.
        setPassword("");
        setAwaitingConfirmation(true);
      } else showError(error);
    } finally {
      setBusy(false);
    }
  }

  if (!account.configured)
    return (
      <div className="account-info">
        <Cloud size={30} />
        <h3>Cadastro online em preparação</h3>
        <p>
          O cadastro com e-mail e senha ainda não está disponível nesta versão
          publicada.
        </p>
        <p>
          Enquanto isso, personalize seu perfil na aba Meu perfil e continue
          usando o app neste dispositivo.
        </p>
      </div>
    );
  if (account.user)
    return (
      <div className="account-info">
        <Cloud size={30} />
        <h3>Conta conectada</h3>
        {profile && <p>@{profile.nickname}</p>}
        <p className="account-email">{account.user.email}</p>
        <details className="context-details">
          <summary>Sobre seus dados</summary>
          <p>
            Seus pesos são privados. Ao sair, os dados locais são removidos
            deste aparelho. Os registros sincronizados permanecem na conta.
          </p>
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="outline-button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await account.signOut();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <LogOut size={17} /> Sair da conta
        </button>
      </div>
    );
  if (awaitingConfirmation)
    return (
      <div className="signup-confirmation">
        <Mail size={38} aria-hidden="true" />
        <h3 ref={confirmationHeading} tabIndex={-1}>
          Confira seu e-mail
        </h3>
        <p className="modal-description">
          Se este cadastro precisar de confirmação, você receberá um link em{" "}
          <strong>{email}</strong>. Confira também o spam. Se já tem conta, use
          Entrar.
        </p>
        {error && (
          <p
            ref={errorElement}
            tabIndex={-1}
            className="form-error"
            role="alert"
          >
            {error}
          </p>
        )}
        {message && (
          <p ref={messageElement} className="field-hint" role="status">
            {message}
          </p>
        )}
        <button
          type="button"
          className="primary-button form-submit"
          onClick={() => changeMode("signin")}
          disabled={busy}
        >
          Entrar
        </button>
        <button
          type="button"
          className="text-button auth-mode"
          onClick={resendConfirmation}
          disabled={busy}
        >
          Reenviar confirmação
        </button>
        <button
          type="button"
          className="text-button auth-mode"
          disabled={busy}
          onClick={() => changeMode("signup")}
        >
          Usar outro e-mail
        </button>
      </div>
    );

  if (mode === "recovery") return (
    <form onSubmit={submit} className="account-form" noValidate>
      <h3>Recuperar senha</h3>
      <label className="form-label">E-mail
        <input ref={emailInput} type="email" autoComplete="email" required maxLength={254}
          disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); clearFeedback(); }} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className="primary-button form-submit" disabled={busy || resetCooldown}>
        {busy ? "Enviando…" : resetCooldown ? "Aguarde para reenviar" : "Enviar link de recuperação"}
      </button>
      <button type="button" className="text-button" disabled={busy} onClick={() => changeMode("signin")}>Voltar para entrar</button>
    </form>
  );
  const signingUp = mode === "signup";
  const emailField = (
    <label className="form-label">
      {signingUp ? "E-mail" : "E-mail ou nome de usuário"}
      <input
        ref={emailInput}
        type={signingUp ? "email" : "text"}
        autoComplete={signingUp ? "email" : "username"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={signingUp ? "next" : "go"}
        maxLength={254}
        required
        disabled={busy}
        aria-invalid={errorField === "email" || undefined}
        aria-describedby={errorField === "email" ? "account-error" : undefined}
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (errorField === "email" && isEmailAddress(e.target.value))
            clearFeedback();
          else if (!errorField) clearFeedback();
        }}
      />
    </label>
  );
  const passwordField = (
    <>
      <label className="form-label">
        Senha
        <PasswordInput
          ref={passwordInput}
          autoComplete={signingUp ? "new-password" : "current-password"}
          enterKeyHint={signingUp ? "next" : "go"}
          aria-describedby={
            [
              signingUp && "signup-password-hint",
              errorField === "password" && "account-error",
            ]
              .filter(Boolean)
              .join(" ") || undefined
          }
          aria-invalid={errorField === "password" || undefined}
          minLength={signingUp ? 8 : undefined}
          maxLength={128}
          required
          disabled={busy}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (
              errorField === "password" &&
              e.target.value.length >= (signingUp ? 8 : 1)
            )
              clearFeedback();
          }}
        />
      </label>
      {signingUp && (
        <p id="signup-password-hint" className="password-hint">
          Use pelo menos 8 caracteres
        </p>
      )}
    </>
  );
  if (mode === "welcome")
    return (
      <div className="auth-welcome">
        <Mascot pose="judging" size={130} />
        <h3>Novo por aqui?</h3>
        <button
          type="button"
          className="primary-button"
          onClick={() => changeMode("signin")}
        >
          Entrar
        </button>
        <button
          type="button"
          className="outline-button"
          onClick={() => changeMode("signup")}
        >
          Criar conta
        </button>
        <div className="auth-divider">
          <span>ou</span>
        </div>
        <button
          type="button"
          className="google-signin"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            clearFeedback();
            try {
              await account.signInWithGoogle();
            } catch (error) {
              setGoogleError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 48 48"
            aria-hidden="true"
            focusable="false"
          >
            <path
              fill="#4285F4"
              d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.8-3.5 6.1-8.6 6.1-14.9Z"
            />
            <path
              fill="#34A853"
              d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20.4 20.4 0 0 0 24 44Z"
            />
            <path
              fill="#FBBC05"
              d="M12.6 27.6a12.2 12.2 0 0 1 0-7.2v-5.2H5.8a20 20 0 0 0 0 17.6l6.8-5.2Z"
            />
            <path
              fill="#EA4335"
              d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.6 19.6 0 0 0 24 4 20.4 20.4 0 0 0 5.8 15.2l6.8 5.2C14.2 15.6 18.7 12 24 12Z"
            />
          </svg>
          Continuar com Google
        </button>
        {googleError && (
          <p
            ref={googleErrorElement}
            tabIndex={-1}
            className="form-error google-error"
            role="alert"
          >
            {googleError}
          </p>
        )}
      </div>
    );
  return (
    <form onSubmit={submit} className="account-form" noValidate>
      {signingUp ? (
        <>
          {step > 0 && (
            <>
              <CapiboraMessage
                message={signupLines[step]}
                size={60}
                heading="strong"
              />
            </>
          )}
          <div className="signup-step" ref={stepRoot} key={step}>
            {step === 0 && emailField}
            {step === 1 && passwordField}
          </div>
        </>
      ) : (
        <>
          {emailField}
          {passwordField}
        </>
      )}
      {error && (
        <p
          id="account-error"
          ref={errorElement}
          tabIndex={-1}
          className="form-error"
          role="alert"
        >
          {error}
        </p>
      )}
      {message && (
        <p ref={messageElement} className="field-hint" role="status">
          {message}
        </p>
      )}
      <div className="signup-actions">
        <button
          type="submit"
          className="primary-button form-submit"
          disabled={busy}
        >
          {busy
            ? "Aguarde…"
            : !signingUp
              ? "Entrar"
              : step === 1
                ? "Criar conta"
                : "Continuar"}
          {signingUp &&
            !busy &&
            (step === 1 ? <Check size={19} /> : <ArrowRight size={19} />)}
        </button>
      </div>
      {!signingUp && (
        <button type="button" className="text-button auth-mode" disabled={busy}
          onClick={() => changeMode("recovery")}>Esqueci minha senha</button>
      )}
      {!signingUp && (
        <button
          type="button"
          className="text-button auth-mode"
          disabled={busy}
          onClick={resendConfirmation}
        >
          Reenviar confirmação
        </button>
      )}
      {(!signingUp || step === 0) && (
        <button
          type="button"
          className="text-button auth-mode"
          disabled={busy}
          onClick={() => changeMode(signingUp ? "signin" : "signup")}
        >
          {signingUp ? "Já tenho conta" : "Quero criar uma conta"}
        </button>
      )}
    </form>
  );
}
