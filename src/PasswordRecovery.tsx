import { useEffect, useRef, useState } from "react";
import PasswordInput from "./PasswordInput";

export default function PasswordRecovery({ onSave, onSaved, onBusyChange }: {
  onSave: (password: string) => Promise<void>;
  onSaved: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <form
      className="account-form"
      data-critical-operation
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (running.current) return;
        if (password.length < 8 || password.length > 128) {
          setError("Use uma senha entre 8 e 128 caracteres");
          return;
        }
        if (password !== confirmation) {
          setError("As senhas não conferem");
          return;
        }
        running.current = true;
        setBusy(true);
        setError("");
        onBusyChange(true);
        try {
          await onSave(password);
          if (alive.current) {
            setPassword("");
            setConfirmation("");
            onSaved();
          }
        } catch (failure) {
          if (alive.current) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Não foi possível alterar a senha",
            );
          }
        } finally {
          running.current = false;
          if (alive.current) {
            setBusy(false);
            onBusyChange(false);
          }
        }
      }}
    >
      <label className="form-label">
        Nova senha
        <PasswordInput
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          disabled={busy}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setError("");
          }}
        />
      </label>
      <label className="form-label">
        Confirmar nova senha
        <PasswordInput
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          disabled={busy}
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
            setError("");
          }}
        />
      </label>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="primary-button form-submit" disabled={busy}>
        {busy ? "Salvando…" : "Salvar nova senha"}
      </button>
    </form>
  );
}
