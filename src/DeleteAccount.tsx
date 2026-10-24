import { useEffect, useRef, useState } from "react";

export default function DeleteAccount(
  { onDelete, disabled = false, onBusyChange }: {
    onDelete: () => Promise<void>;
    disabled?: boolean;
    onBusyChange?: (busy: boolean) => void;
  },
) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  if (!open) {
    return (
      <button
        className="text-button"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Excluir minha conta
      </button>
    );
  }
  return (
    <form
      className="profile-editor"
      aria-label="Excluir minha conta"
      data-critical-operation
      aria-busy={busy}
      onSubmit={async (event) => {
        event.preventDefault();
        if (confirmation !== "EXCLUIR" || running.current || disabled) return;
        running.current = true;
        setBusy(true);
        setError("");
        onBusyChange?.(true);
        try {
          await onDelete();
        } catch (failure) {
          if (alive.current) {
            setError(
              failure instanceof Error
                ? failure.message
                : "Não foi possível confirmar a exclusão",
            );
          }
        } finally {
          running.current = false;
          if (alive.current) {
            setBusy(false);
            onBusyChange?.(false);
          }
        }
      }}
    >
      <p>
        Esta ação é definitiva. Ela exclui sua conta, perfil, treinos, pesos,
        CapiWhey, itens e avisos. Registros ainda não sincronizados neste
        aparelho também serão descartados.
      </p>
      <p>
        Seus grupos serão encerrados. Resultados coletivos já concluídos
        permanecem sem identificar sua conta.
      </p>
      <label className="form-label">
        Digite EXCLUIR para confirmar
        <input
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          autoComplete="off"
          disabled={busy}
        />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button
          type="button"
          className="outline-button"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setConfirmation("");
            setError("");
          }}
        >
          Cancelar
        </button>
        <button
          className="primary-button"
          disabled={busy || disabled || confirmation !== "EXCLUIR"}
        >
          {busy ? "Excluindo…" : "Excluir definitivamente"}
        </button>
      </div>
    </form>
  );
}
