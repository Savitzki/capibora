import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { clearAccountStorage } from "./accountStorage";
import { registerSync } from "./sync";
import ProgressReports from "./ProgressReports";
import { freshData, parseData, type Workout } from "./model";
import {
  readRecordingState,
  minimumCrossesMidnight,
  sessionSeconds,
  timerText,
  validReview,
  type RecordingState,
} from "./workoutRecording";
import {
  useWorkoutSession,
  type WorkoutSessionController,
} from "./useWorkoutSession";
import {
  ActiveWorkoutBanner,
  OptionalWorkoutReview,
  WorkoutInProgress,
  WorkoutRegistration,
} from "./WorkoutRegistration";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("./backend", () => ({ backendRpc: rpc, accountConfigured: true }));
const review = {
  intensity: 3,
  feeling: "normal",
  completion: "partial",
} as const;
const workout: Workout = {
  id: "workout",
  date: "2026-10-18",
  activity: "Corrida",
  minutes: 35,
  method: "timed",
  confirmedAt: "2026-10-18T12:35:00Z",
};
function state(seconds = 0): RecordingState {
  return {
    serverNow: new Date(
      Date.parse("2026-10-18T12:00:00Z") + seconds * 1000,
    ).toISOString(),
    today: "2026-10-18",
    timezone: "UTC",
    minimumMinutes: 35,
    maximumMinutes: 240,
    session: {
      id: "session",
      activity: "Corrida",
      startedAt: "2026-10-18T12:00:00Z",
      endedAt: null,
      validatedSeconds: null,
      minimumSeconds: 2100,
      maximumSeconds: 14400,
      status: "active",
      workout: null,
    },
  };
}
function controller(
  s: RecordingState | null = state(),
): WorkoutSessionController {
  return {
    state: s,
    error: "",
    busy: false,
    recovering: false,
    refresh: vi.fn(),
    act: vi.fn(),
    anchor: { current: performance.now() },
  };
}
beforeEach(() => {
  rpc.mockReset();
  Object.defineProperty(navigator, "onLine", {
    value: true,
    configurable: true,
  });
});
it("validates review completeness and rejects invalid server envelopes", () => {
  expect(validReview(review)).toBe(true);
  expect(validReview({ ...review, intensity: 0 })).toBe(false);
  expect(validReview({ intensity: 3 })).toBe(false);
  expect(() => readRecordingState({})).toThrow();
  expect(readRecordingState(state())).toEqual(state());
});
it("keeps old durations and provenance absent when restoring historical storage", () => {
  const d = freshData();
  d.workouts.push({
    id: "old",
    date: "2026-01-01",
    activity: "Yoga",
    minutes: 10,
  });
  expect(parseData(JSON.stringify(d)).workouts[0]).toEqual(d.workouts[0]);
});
it("uses a server anchor plus monotonic elapsed time, independent of device clock", () => {
  const s = state(1000);
  const clock = vi.spyOn(Date, "now").mockReturnValue(0);
  expect(sessionSeconds(s, 1100)).toBe(2100);
  expect(timerText(2100)).toBe("35:00");
  expect(sessionSeconds(s, 1e9)).toBe(14400);
  clock.mockRestore();
});
it("retains validated duration for a completed session without counting time after finish", () => {
  const s = state(2200);
  s.session = {
    ...s.session!,
    status: "completed",
    endedAt: s.serverNow,
    validatedSeconds: 2200,
    workout,
  };
  expect(sessionSeconds(s, 5000)).toBe(2200);
});
it("recovers the same persisted session after remount and on another device", async () => {
  rpc.mockResolvedValue(state(800));
  const first = renderHook(() => useWorkoutSession("timer-account", true));
  await waitFor(() =>
    expect(first.result.current.state?.session?.id).toBe("session"),
  );
  first.unmount();
  rpc.mockResolvedValue(state(1800));
  const second = renderHook(() => useWorkoutSession("timer-account", true));
  await waitFor(() =>
    expect(second.result.current.state?.serverNow).toBe(state(1800).serverNow),
  );
  const otherDevice = renderHook(() =>
    useWorkoutSession("timer-account", true),
  );
  await waitFor(() =>
    expect(otherDevice.result.current.state?.session?.id).toBe("session"),
  );
  expect(localStorage.length).toBe(0);
});
it("refreshes authoritative elapsed time after a suspended page resumes", async () => {
  rpc.mockResolvedValueOnce(state(10)).mockResolvedValue(state(2200));
  const hook = renderHook(() => useWorkoutSession("resume-account", true));
  await waitFor(() =>
    expect(hook.result.current.state?.serverNow).toBe(state(10).serverNow),
  );
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 20000);
  await act(async () => {
    fireEvent(document, new Event("visibilitychange"));
  });
  now.mockRestore();
  expect(sessionSeconds(hook.result.current.state!)).toBe(2200);
});
it("blocks offline session start without persisting any guessed start time", async () => {
  rpc.mockResolvedValue({ ...state(), session: null });
  const hook = renderHook(() => useWorkoutSession("offline-account", true));
  await waitFor(() => expect(hook.result.current.recovering).toBe(false));
  rpc.mockClear();
  Object.defineProperty(navigator, "onLine", {
    value: false,
    configurable: true,
  });
  await act(async () => {
    expect(
      await hook.result.current.act("start_workout_session", {
        p_request_id: "request",
        p_activity: "Corrida",
      }),
    ).toBeNull();
  });
  expect(rpc).not.toHaveBeenCalled();
  expect(hook.result.current.error).toMatch(/internet/);
});
it("keeps a timed session recoverable after timeout and retries the same ID", async () => {
  rpc.mockResolvedValue(state(2200));
  const hook = renderHook(() => useWorkoutSession("retry-account", true));
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  rpc.mockRejectedValueOnce(new Error("Timeout"));
  await act(async () => {
    expect(
      await hook.result.current.act("finish_workout_session", {
        p_id: "session",
      }),
    ).toBeNull();
  });
  expect(hook.result.current.state?.session?.status).toBe("active");
  const completed = state(2200);
  completed.session = {
    ...completed.session!,
    status: "completed",
    endedAt: completed.serverNow,
    validatedSeconds: 2200,
    workout,
  };
  rpc.mockResolvedValueOnce(completed);
  await act(async () => {
    expect(
      (
        await hook.result.current.act("finish_workout_session", {
          p_id: "session",
        })
      )?.session?.workout?.id,
    ).toBe("workout");
  });
  expect(
    rpc.mock.calls
      .filter(([name]) => name === "finish_workout_session")
      .map(([, args]) => args.p_id),
  ).toEqual(["session", "session"]);
});
it("ignores delayed recovery after logout, isolating account state", async () => {
  let resolve!: (v: RecordingState) => void;
  rpc.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const hook = renderHook(() => useWorkoutSession("leaving-timer", true));
  clearAccountStorage("leaving-timer");
  await act(async () => resolve(state()));
  expect(hook.result.current.state).toBeNull();
});
it("never enables finishing before the minimum and does not cancel on navigation", async () => {
  const c = controller(state(2090)),
    back = vi.fn();
  render(
    <WorkoutInProgress
      controller={c}
      authenticated
      onLogin={vi.fn()}
      onBack={back}
      onConfirmed={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Finalizar treino" }),
  ).toBeDisabled();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Voltar à tela anterior" }));
  expect(back).toHaveBeenCalledOnce();
  expect(c.act).not.toHaveBeenCalled();
});
it("finalizes after the minimum and confirms before any optional evaluation", async () => {
  const c = controller(state(2110)),
    done = vi.fn();
  const completed = state(2110);
  completed.session = {
    ...completed.session!,
    status: "completed",
    endedAt: completed.serverNow,
    validatedSeconds: 2110,
    workout,
  };
  vi.mocked(c.act).mockResolvedValue(completed);
  render(
    <WorkoutInProgress
      controller={c}
      authenticated
      onLogin={vi.fn()}
      onBack={vi.fn()}
      onConfirmed={done}
    />,
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Finalizar treino" }));
  expect(c.act).toHaveBeenCalledExactlyOnceWith("finish_workout_session", {
    p_id: "session",
  });
  expect(done).toHaveBeenCalledWith(workout);
});
it("requires explicit confirmation to cancel and does not finalize expired sessions", async () => {
  const c = controller(state()),
    user = userEvent.setup();
  const view = render(
    <WorkoutInProgress
      controller={c}
      authenticated
      onLogin={vi.fn()}
      onBack={vi.fn()}
      onConfirmed={vi.fn()}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Cancelar treino" }));
  expect(c.act).not.toHaveBeenCalled();
  await user.click(
    screen.getByRole("button", { name: "Sim, cancelar treino" }),
  );
  expect(c.act).toHaveBeenCalledExactlyOnceWith("cancel_workout_session", {
    p_id: "session",
  });
  view.rerender(
    <WorkoutInProgress
      controller={controller(state(14400))}
      authenticated
      onLogin={vi.fn()}
      onBack={vi.fn()}
      onConfirmed={vi.fn()}
    />,
  );
  expect(screen.getByText("Sessão expirada")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Finalizar treino" }),
  ).not.toBeInTheDocument();
});
it("shows recovery explicitly and links to the active workout from home", () => {
  const c = controller(state(80)),
    back = vi.fn();
  render(<ActiveWorkoutBanner controller={c} onResume={back} />);
  fireEvent.click(screen.getByRole("button", { name: /Voltar ao treino/ }));
  expect(back).toHaveBeenCalledOnce();
});
it("requires 35 declared minutes and every manual answer, then uses the canonical server confirmation", async () => {
  const c = controller({ ...state(), session: null }),
    done = vi.fn(),
    user = userEvent.setup();
  rpc.mockResolvedValue({
    ...workout,
    method: "manual",
    manualConfirmed: true,
  });
  render(
    <WorkoutRegistration
      controller={c}
      today="2026-10-18"
      onStarted={vi.fn()}
      onResume={vi.fn()}
      onConfirmed={done}
    />,
  );
  await user.click(
    screen.getByRole("button", { name: /Registrar manualmente/ }),
  );
  await user.type(screen.getByLabelText("Duração (minutos)"), "34");
  expect(screen.getByRole("button", { name: "Continuar" })).toBeDisabled();
  await user.clear(screen.getByLabelText("Duração (minutos)"));
  await user.type(screen.getByLabelText("Duração (minutos)"), "35");
  await user.click(screen.getByRole("button", { name: "Continuar" }));
  expect(rpc).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Sim" }));
  await user.click(screen.getByRole("button", { name: "Sim" }));
  expect(rpc).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Você confirma que realmente treinou por pelo menos 35 minutos?",
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Sim, eu confirmo." }));
  expect(rpc).toHaveBeenCalledWith(
    "confirm_manual_workout",
    expect.objectContaining({
      p_minutes: 35,
      p_confirmation: expect.objectContaining({
        version: 1,
        answers: [true, true, true],
      }),
    }),
  );
  expect(done).toHaveBeenCalledWith(
    expect.objectContaining({
      method: "manual",
      confirmedAt: workout.confirmedAt,
    }),
  );
});
it("shows the recovered state if an old start request is retried after session expiration", async () => {
  const c = controller({ ...state(), session: null });
  const expired = state(14400);
  expired.session = {
    ...expired.session!,
    status: "expired",
    endedAt: expired.serverNow,
  };
  vi.mocked(c.act).mockResolvedValue(expired);
  const resume = vi.fn(),
    done = vi.fn(),
    user = userEvent.setup();
  render(
    <WorkoutRegistration
      controller={c}
      today="2026-10-18"
      onStarted={vi.fn()}
      onResume={resume}
      onConfirmed={done}
    />,
  );
  await user.click(screen.getByRole("button", { name: /Iniciar treino/ }));
  await user.click(screen.getByRole("button", { name: "Iniciar treino" }));
  expect(resume).toHaveBeenCalledOnce();
  expect(done).not.toHaveBeenCalled();
});
it("offers optional review without blocking the confirmed workout when skipped or saving fails", async () => {
  const skip = vi.fn(),
    saved = vi.fn(),
    user = userEvent.setup();
  render(
    <OptionalWorkoutReview workout={workout} onDone={skip} onSaved={saved} />,
  );
  await user.click(screen.getByRole("button", { name: "3 Moderado" }));
  await user.click(screen.getByRole("button", { name: "Normal" }));
  await user.click(
    screen.getByRole("button", { name: "Sim, fiz tudo que pretendia" }),
  );
  rpc.mockRejectedValueOnce(new Error("Sem conexão"));
  await user.click(screen.getByRole("button", { name: "Salvar avaliação" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Sem conexão");
  expect(saved).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Agora não" }));
  expect(skip).toHaveBeenCalledOnce();
  expect(
    rpc.mock.calls.every(([name]) => name === "submit_workout_review"),
  ).toBe(true);
});

it("omite a saída alternativa da avaliação quando o modal usa somente X, sem modificar o treino confirmado", () => {
  const saved = vi.fn(), done = vi.fn();
  const before = structuredClone(workout);
  render(<OptionalWorkoutReview closeOnly workout={workout} onDone={done} onSaved={saved} />);
  expect(screen.queryByRole("button", { name: "Agora não" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salvar avaliação" })).toBeDisabled();
  expect(workout).toEqual(before);
  expect(saved).not.toHaveBeenCalled();
  expect(done).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});
it("shows private method totals and assessment percentages without penalizing missing reviews", async () => {
  rpc.mockResolvedValue({
    period: "week",
    start: "2026-10-12",
    end: "2026-10-18",
    today: "2026-10-18",
    timezone: "UTC",
    partial: true,
    summary: {
      completed: 3,
      planned: 5,
      due: 3,
      mandatory_completed: 3,
      missed: 0,
      minutes: 105,
      average: 35,
      compliance: 100,
    },
    streak: { current: 3, best: 5 },
    days: [],
    weeks: [],
    goals: [],
    weights: [],
    recording: {
      manual: 1,
      timed: 1,
      legacy: 1,
      minutes: 105,
      evaluated: 2,
      averageIntensity: 3,
      feelings: { tired: 1, normal: 1, great: 0 },
      completion: { full: 1, partial: 1, adapted: 0 },
    },
  });
  render(
    <ProgressReports
      userId="report-timer"
      today="2026-10-18"
      timezone="UTC"
      onClose={vi.fn()}
    />,
  );
  expect(
    await screen.findByText("Intensidade percebida: 3/5"),
  ).toBeInTheDocument();
  expect(screen.getByText("Completos · 50%")).toBeInTheDocument();
  expect(screen.getByText("Parciais · 50%")).toBeInTheDocument();
  expect(screen.getByText(/2 avaliações preenchidas/)).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith("get_progress_report", {
    p_period: "week",
    p_start: "2026-10-12",
    p_timezone: "UTC",
  });
});

it("sincroniza uma gravação confirmada mesmo após fechar o formulário", async () => {
  let finish!: (w: Workout) => void;
  rpc.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const refresh = vi.fn(),
    done = vi.fn(),
    user = userEvent.setup();
  const registered = registerSync({
    userId: "closed-form",
    resource: "economy",
    refresh,
    invalidate: vi.fn(),
    status: {
      initialLoading: false,
      refreshing: false,
      writing: false,
      stale: false,
      error: "",
      errorKind: null,
      lastSuccess: Date.now(),
    },
  });
  try {
    const view = render(
      <WorkoutRegistration
        userId="closed-form"
        controller={controller({ ...state(), session: null })}
        today="2026-10-18"
        onStarted={vi.fn()}
        onResume={vi.fn()}
        onConfirmed={done}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Registrar manualmente/ }),
    );
    await user.type(screen.getByLabelText("Duração (minutos)"), "35");
    await user.click(screen.getByRole("button", { name: "Continuar" }));
    await user.click(screen.getByRole("button", { name: "Sim" }));
    await user.click(screen.getByRole("button", { name: "Sim" }));
    await user.click(screen.getByRole("button", { name: "Sim, eu confirmo." }));
    expect(rpc).toHaveBeenCalledOnce();
    view.unmount();
    await act(async () =>
      finish({ ...workout, method: "manual", manualConfirmed: true }),
    );
    expect(refresh).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
  } finally {
    registered.dispose();
  }
});

it("orienta a virada usando o relógio e o fuso do servidor", () => {
  const s = { ...state(), timezone: "America/Sao_Paulo", serverNow: "2026-10-19T02:25:00Z" };
  expect(minimumCrossesMidnight(s)).toBe(true);
  expect(minimumCrossesMidnight({ ...s, serverNow: "2026-10-19T02:24:59Z" })).toBe(false);
  expect(minimumCrossesMidnight({ ...s, serverNow: "2026-10-19T01:30:00Z" })).toBe(false);
  expect(minimumCrossesMidnight({ ...s, serverNow: "2026-10-19T02:24:00Z" }, 60)).toBe(true);
  expect(minimumCrossesMidnight({ ...s, timezone: "Pacific/Kiritimati" })).toBe(false);
});
it("mostra a orientação somente no cronômetro perto da meia-noite", async () => {
  const s = { ...state(), timezone: "America/Sao_Paulo", serverNow: "2026-10-19T02:40:00Z", session: null };
  render(<WorkoutRegistration controller={controller(s)} today={s.today} onStarted={vi.fn()} onConfirmed={vi.fn()} onResume={vi.fn()} />);
  const message = "O treino conta para o dia em que for finalizado.";
  expect(screen.queryByText(message)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /Iniciar treino/i }));
  expect(screen.getByText(message)).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
