import CapiboraMessage from "./CapiboraMessage";
import { capiboraMessage } from "./capiboraVoice";
import { useEffect, useRef, useState, useId, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Dumbbell,
  Play,
  X,
} from "lucide-react";
import { accountStorageGeneration } from "./accountStorage";
import { notifySyncWrite } from "./sync";
import { OperationSpinner } from "./SyncFeedback";
import { backendRpc } from "./backend";
import ManualWorkoutInterrogation from "./ManualWorkoutInterrogation";
import {
  MANUAL_MINIMUM_MINUTES,
  pickManualQuestions,
  recentManualQuestions,
  rememberManualQuestions,
  validManualConfirmation,
  type ManualConfirmation,
} from "./manualConfirmation";
import { deviceTimezone } from "./social";
import type { Workout, WorkoutReview } from "./model";
import {
  COMPLETION_NAMES,
  FEELING_NAMES,
  WORKOUT_ACTIVITIES,
  timerText,
  minimumCrossesMidnight,
  validReview,
} from "./workoutRecording";
import {
  useSessionClock,
  type WorkoutSessionController,
} from "./useWorkoutSession";

function ActivityField({
  value,
  onChange,
}: {
  value: string;
  onChange: (x: string) => void;
}) {
  return (
    <label className="form-label">
      Atividade
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {WORKOUT_ACTIVITIES.map((activity) => (
          <option key={activity}>{activity}</option>
        ))}
      </select>
    </label>
  );
}
export function WorkoutReviewFields({
  value,
  onChange,
}: {
  value: Partial<WorkoutReview>;
  onChange: (r: Partial<WorkoutReview>) => void;
}) {
  return (
    <div className="workout-review">
      <fieldset>
        <legend>Qual foi a intensidade do treino?</legend>
        <div className="intensity-options">
          {["Muito leve", "Leve", "Moderado", "Intenso", "Muito intenso"].map(
            (label, i) => (
              <button
                key={label}
                type="button"
                aria-pressed={value.intensity === i + 1}
                onClick={() => onChange({ ...value, intensity: i + 1 })}
              >
                <strong>{i + 1}</strong>
                <small>{label}</small>
              </button>
            ),
          )}
        </div>
      </fieldset>
      <fieldset>
        <legend>Como você se sentiu depois?</legend>
        <div className="review-options">
          {Object.entries(FEELING_NAMES).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={value.feeling === key}
              onClick={() =>
                onChange({ ...value, feeling: key as WorkoutReview["feeling"] })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Você concluiu o treino planejado?</legend>
        <div className="review-options completion-options">
          {Object.entries(COMPLETION_NAMES).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={value.completion === key}
              onClick={() =>
                onChange({
                  ...value,
                  completion: key as WorkoutReview["completion"],
                })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
export function WorkoutRegistration({
  controller,
  today,
  onStarted,
  onConfirmed,
  onResume,
  onQueued,
  draft,
  userId,
  onCancel,
  closeOnly = false,
  onBusyChange,
}: {
  controller: WorkoutSessionController;
  today: string;
  onStarted: () => void;
  onConfirmed: (w: Workout) => void;
  onResume: () => void;
  onQueued?: (w: Workout) => void;
  draft?: Workout;
  userId?: string;
  onCancel?: () => void;
  closeOnly?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [method, setMethod] = useState<"manual" | "timed" | null>(
    draft ? "manual" : null,
  );
  const [activity, setActivity] = useState(draft?.activity ?? "Musculação"),
    [minutes, setMinutes] = useState(draft ? String(draft.minutes) : "");
  const [interrogating, setInterrogating] = useState(false);
  const [questions] = useState(() =>
    pickManualQuestions(recentManualQuestions(userId)),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [requestId] = useState(() => draft?.id ?? crypto.randomUUID());
  const [generation] = useState(() =>
    userId ? accountStorageGeneration(userId) : 0,
  );
  const mounted = useRef(true),
    submitting = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const durationHintId = useId();
  useEffect(() => {
    onBusyChange?.(busy || controller.busy);
    return () => onBusyChange?.(false);
  }, [busy, controller.busy, onBusyChange]);
  useEffect(() => {
    if (method && !interrogating)
      formHeading.current?.focus({ preventScroll: true });
  }, [method, interrogating]);
  const minimum = controller.state?.minimumMinutes ?? 35;
  const [, refreshHint] = useState(0);
  useEffect(() => {
    if (method !== "timed") return;
    const timer = window.setInterval(() => refreshHint((n) => n + 1), 30000);
    return () => window.clearInterval(timer);
  }, [method]);
  const crossesMidnight = controller.state && minimumCrossesMidnight(
    controller.state, (performance.now() - controller.anchor.current) / 1000,
  );
  const manualMinimum = Math.max(MANUAL_MINIMUM_MINUTES, minimum);
  const durationTooShort =
    minutes.trim() !== "" &&
    Number.isFinite(Number(minutes)) &&
    Number(minutes) < manualMinimum;
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    setError("");
    if (method === "timed") {
      if (!navigator.onLine) {
        setError(
          "É necessária conexão com a internet para iniciar o cronômetro",
        );
        return;
      }
      const result = await controller.act("start_workout_session", {
        p_request_id: requestId,
        p_activity: activity,
      });
      if (result?.session?.status === "active") onStarted();
      else if (
        result?.session?.status === "completed" &&
        result.session.workout
      )
        onConfirmed(result.session.workout);
      else if (result?.session) onResume();
      return;
    }
    if (!method) return;
    if (!validDuration()) return;
    setInterrogating(true);
  }
  function validDuration() {
    if (
      !Number.isInteger(Number(minutes)) ||
      Number(minutes) < manualMinimum ||
      Number(minutes) > 1440
    ) {
      setError(
        durationTooShort
          ? ""
          : `Informe entre ${manualMinimum} e 1440 minutos inteiros`,
      );
      return false;
    }
    return true;
  }
  async function confirmManual(confirmation: ManualConfirmation) {
    if (submitting.current || !validDuration()) return;
    if (!validManualConfirmation(confirmation)) {
      setError("Responda às três perguntas para confirmar");
      return;
    }
    setError("");
    if (!navigator.onLine) {
      if (!onQueued) {
        setError("Conecte-se à internet para confirmar seu treino");
        return;
      }
      submitting.current = true;
      onQueued({
        id: requestId,
        date: controller.state?.today ?? today,
        activity,
        minutes: Number(minutes),
        method: "manual",
        manualConfirmation: confirmation,
        recordedAt: new Date().toISOString(),
      });
      rememberManualQuestions(userId, confirmation.questionIds);
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      const workout = await backendRpc<Workout>("confirm_manual_workout", {
        p_request_id: requestId,
        p_day: controller.state?.today ?? today,
        p_activity: activity,
        p_minutes: Number(minutes),
        p_confirmation: confirmation,
        p_timezone: deviceTimezone(),
      });
      if (userId && generation === accountStorageGeneration(userId))
        notifySyncWrite(userId, "confirm_manual_workout");
      if (!userId || generation === accountStorageGeneration(userId))
        rememberManualQuestions(userId, confirmation.questionIds);
      if (mounted.current) onConfirmed(workout);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (controller.state?.session?.status === "active")
    return (
      <div className="session-resume-prompt">
        <Clock3 size={30} />
        <p>Seu treino já está em andamento</p>
        <button className="primary-button" onClick={onResume}>
          Voltar ao treino <ArrowRight size={18} />
        </button>
      </div>
    );
  if (!method)
    return (
      <div className="registration-intro">
        <div className="registration-mascot-copy">
          <CapiboraMessage
            message={capiboraMessage("registration-greeting")}
            variant="centered"
            size={120}
          />
        </div>
        <div className="registration-choices">
          <button onClick={() => setMethod("timed")}>
            <Clock3 size={25} aria-hidden="true" />
            <span>
              <strong>{capiboraMessage("registration-timed").title}</strong>
              <small>
                {capiboraMessage("registration-timed").body} · mínimo {minimum}{" "}
                min
              </small>
            </span>
          </button>
          <button onClick={() => setMethod("manual")}>
            <Dumbbell size={25} aria-hidden="true" />
            <span>
              <strong>{capiboraMessage("registration-manual").title}</strong>
              <small>{capiboraMessage("registration-manual").body}</small>
            </span>
          </button>
        </div>
      </div>
    );
  if (method === "manual" && interrogating)
    return (
      <ManualWorkoutInterrogation
        closeOnly={closeOnly}
        questions={questions}
        busy={busy || controller.busy}
        error={error}
        onComplete={(confirmation) => void confirmManual(confirmation)}
        onReturn={() => {
          setInterrogating(false);
          setError("");
        }}
        onCancel={
          onCancel ??
          (() => {
            setInterrogating(false);
            setMethod(null);
          })
        }
      />
    );
  return (
    <form className="workout-registration" onSubmit={submit}>
      <button
        type="button"
        className="text-button"
        onClick={() => setMethod(null)}
        disabled={busy || controller.busy}
      >
        <ArrowLeft size={16} /> Outros métodos
      </button>
      <h3 className="registration-step-title" ref={formHeading} tabIndex={-1}>
        {method === "manual" ? "Registro manual" : "Iniciar treino"}
      </h3>
      <ActivityField value={activity} onChange={setActivity} />
      {method === "manual" ? (
        <>
          <label className="form-label">
            Duração (minutos)
            <input
              required
              type="number"
              inputMode="numeric"
              min={manualMinimum}
              max={1440}
              step={1}
              placeholder="Ex.: 45"
              value={minutes}
              aria-invalid={durationTooShort || undefined}
              aria-describedby={durationTooShort ? durationHintId : undefined}
              onChange={(e) => {
                setMinutes(e.target.value);
                setError("");
              }}
            />
          </label>
          {durationTooShort && (
            <div
              className="manual-duration-warning"
              id={durationHintId}
              role="status"
            >
              <CapiboraMessage
                message={{
                  ...capiboraMessage("manual-duration-short"),
                  body: `${capiboraMessage("manual-duration-short").body} · O mínimo é ${manualMinimum} min`,
                }}
                size={40}
                heading="strong"
              />
            </div>
          )}
        </>
      ) : (
        <p className="field-hint">
          Mínimo {minimum} min · expira em{" "}
          {(controller.state?.maximumMinutes ?? 240) / 60} h
        </p>
      )}
      {(error || controller.error) && (
        <p className="form-error" role="alert">
          {error || controller.error}
        </p>
      )}
      {method === "timed" && crossesMidnight && (
        <p className="field-hint">O treino conta para o dia em que for finalizado.</p>
      )}
      <button
        className="primary-button form-submit"
        disabled={
          busy ||
          controller.busy ||
          (method === "manual" &&
            (!Number.isInteger(Number(minutes)) ||
              Number(minutes) < manualMinimum ||
              Number(minutes) > 1440))
        }
      >
        {busy || controller.busy ? (
          <OperationSpinner active />
        ) : method === "manual" ? (
          <Check size={18} />
        ) : (
          <Play size={18} />
        )}
        {busy || controller.busy
          ? "Confirmando…"
          : method === "manual"
            ? "Continuar"
            : "Iniciar treino"}
      </button>
    </form>
  );
}
export function ActiveWorkoutBanner({
  controller,
  onResume,
}: {
  controller: WorkoutSessionController;
  onResume: () => void;
}) {
  const seconds = useSessionClock(controller);
  if (controller.state?.session?.status !== "active") return null;
  return (
    <button className="active-workout-banner" onClick={onResume}>
      <Clock3 size={19} />
      <span>
        Treino em andamento <strong>{timerText(seconds)}</strong>
      </span>
      <span>
        Voltar ao treino <ArrowRight size={16} />
      </span>
    </button>
  );
}
export function WorkoutInProgress({
  controller,
  onConfirmed,
  onBack,
  onLogin,
  authenticated,
}: {
  controller: WorkoutSessionController;
  onConfirmed: (w: Workout) => void;
  onBack: () => void;
  onLogin: () => void;
  authenticated: boolean;
}) {
  const seconds = useSessionClock(controller),
    s = controller.state?.session;
  const [cancel, setCancel] = useState(false);
  const expiryRefreshed = useRef<string | null>(null);
  useEffect(() => {
    if (
      s?.status === "active" &&
      seconds >= s.maximumSeconds &&
      expiryRefreshed.current !== s.id
    ) {
      expiryRefreshed.current = s.id;
      void controller.refresh();
    }
  }, [seconds, s, controller.refresh]);
  const expired =
    s?.status === "expired" || Boolean(s && seconds >= s.maximumSeconds);
  return (
    <section className="session-page">
      <div className="screen-heading">
        <h1 id="page-title" tabIndex={-1}>
          Treino em andamento
        </h1>
        <button
          className="icon-button"
          aria-label="Voltar à tela anterior"
          onClick={onBack}
        >
          <ArrowLeft />
        </button>
      </div>
      {!authenticated ? (
        <button className="primary-button" onClick={onLogin}>
          Entrar para recuperar treino
        </button>
      ) : (
        <>
          {controller.recovering && (
            <p role="status">Recuperando sua sessão no servidor…</p>
          )}
          {controller.error && (
            <div className="form-error" role="alert">
              {controller.error}
              <button
                className="text-button"
                onClick={() => void controller.refresh()}
              >
                Tentar recuperar
              </button>
            </div>
          )}
          {s ? (
            <div className="card session-card">
              <Dumbbell size={28} />
              <h2>{s.activity}</h2>
              <p className="session-status" role="status">
                {expired
                  ? "Sessão expirada"
                  : s.status === "completed"
                    ? "Treino confirmado"
                    : s.status === "cancelled"
                      ? "Sessão cancelada"
                      : "Em andamento"}
              </p>
              <output className="session-clock" aria-label="Tempo decorrido">
                {timerText(seconds)}
              </output>
              <progress
                max={s.minimumSeconds}
                value={Math.min(seconds, s.minimumSeconds)}
                aria-label="Progresso até o tempo mínimo"
              />
              <p className="field-hint">
                Mínimo {s.minimumSeconds / 60} min · limite{" "}
                {s.maximumSeconds / 3600} h
              </p>
              {s.status === "active" && !expired ? (
                <>
                  <button
                    className="primary-button"
                    disabled={controller.busy || seconds < s.minimumSeconds}
                    onClick={async () => {
                      const result = await controller.act(
                        "finish_workout_session",
                        { p_id: s.id },
                      );
                      if (
                        result?.session?.status === "completed" &&
                        result.session.workout
                      )
                        onConfirmed(result.session.workout);
                    }}
                  >
                    {controller.busy ? "Validando…" : "Finalizar treino"}
                    <Check size={18} />
                  </button>
                  <p className="field-hint">
                    {seconds < s.minimumSeconds
                      ? `Faltam ${timerText(s.minimumSeconds - seconds)} para finalizar`
                      : "Tempo mínimo alcançado. Finalize quando encerrar seu treino"}
                  </p>
                  {cancel ? (
                    <div className="session-cancel" role="alert">
                      <p>
                        Cancelar este treino? O tempo será descartado e não gera
                        moedas nem pontos
                      </p>
                      <button
                        className="outline-button"
                        disabled={controller.busy}
                        onClick={async () => {
                          await controller.act("cancel_workout_session", {
                            p_id: s.id,
                          });
                          setCancel(false);
                        }}
                      >
                        Sim, cancelar treino
                      </button>
                      <button
                        className="text-button"
                        onClick={() => setCancel(false)}
                      >
                        Continuar treinando
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-button"
                      disabled={controller.busy}
                      onClick={() => setCancel(true)}
                    >
                      <X size={16} /> Cancelar treino
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p className="field-hint">
                    {s.status === "completed"
                      ? "Seu treino está no histórico"
                      : "Nenhum treino, moeda ou ponto foi gerado por esta sessão"}
                  </p>
                  <button className="outline-button" onClick={onBack}>
                    Voltar
                  </button>
                </>
              )}
              {s.status === "active" && !expired && (
                <p className="privacy-note">
                  Pode sair do app ou bloquear a tela
                </p>
              )}
            </div>
          ) : (
            !controller.recovering && <p>Nenhum treino em andamento</p>
          )}
        </>
      )}
    </section>
  );
}
export function OptionalWorkoutReview({
  workout,
  onDone,
  onSaved,
  userId,
  closeOnly = false,
  onBusyChange,
}: {
  workout: Workout;
  onDone: () => void;
  onSaved: (w: Workout) => void;
  userId?: string;
  closeOnly?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [review, setReview] = useState<Partial<WorkoutReview>>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [generation] = useState(() =>
    userId ? accountStorageGeneration(userId) : 0,
  );
  const alive = useRef(true),
    running = useRef(false);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return (
    <div>
      <p className="modal-description">
        Treino confirmado! Quer contar como foi?
      </p>
      <WorkoutReviewFields value={review} onChange={setReview} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-button form-submit"
        disabled={busy || !validReview(review)}
        onClick={async () => {
          if (!validReview(review) || running.current) return;
          running.current = true;
          setBusy(true);
          setError("");
          try {
            const w = await backendRpc<Workout>("submit_workout_review", {
              p_id: workout.id,
              p_review: review,
            });
            if (userId && generation === accountStorageGeneration(userId))
              notifySyncWrite(userId, "submit_workout_review");
            if (alive.current) onSaved(w);
          } catch (e) {
            if (alive.current) setError((e as Error).message);
          } finally {
            running.current = false;
            if (alive.current) setBusy(false);
          }
        }}
      >
        {busy ? "Salvando…" : "Salvar avaliação"}
      </button>
      {!closeOnly && (
        <button className="text-button optional-review-skip" onClick={onDone}>
          Agora não
        </button>
      )}
    </div>
  );
}
