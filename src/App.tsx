import { EmailConfirmationNotice, ProfileCompletionNotice } from "./EntryNotices";
import MedicalKitIcon from "./MedicalKitIcon";
import AppHeader from "./AppHeader";
import AboutApp from "./AboutApp";
import { syncWriting } from "./sync";
import AppNavigation from "./AppNavigation";
import GuestExperience from "./GuestExperience";
import PageHeading from "./PageHeading";
import CapiboraMessage from "./CapiboraMessage";
import { capiboraMessage, phraseText } from "./capiboraVoice";
import { useCapiboraVoice } from "./useCapiboraVoice";
import {
  useEffect,
  useMemo,
  useLayoutEffect,
  useCallback,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  Clock3,
  MessageCircle,
  LockKeyhole,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Settings,
  ShoppingBag,
  Palette,
  Moon,
  Check,
  CheckCheck,
  Dumbbell,
  Plus,
  Share2,
  UserRound,
  X,
} from "lucide-react";
import {
  dueReminders,
  formatDay,
  formatKg,
  freshData,
  localDate,
  parseData,
  shiftDate,
  STORAGE_KEY,
  validDate,
  type Data,
  type Weight,
} from "./model";
import { claimReminder } from "./reminders";
import { notify } from "./notifications";
import PasswordRecovery from "./PasswordRecovery";
import InstallApp from "./InstallApp";
import { useAccount, type Account } from "./account";
import { lazyPanel } from "./LazyPanel";
const ProfilePanel = lazyPanel(() => import("./ProfilePanel"));
const SharePanel = lazyPanel(() => import("./SharePanel"));
import { useSocial, deviceTimezone } from "./social";
import { validManualConfirmation } from "./manualConfirmation";
import SyncFeedback, { InitialLoading } from "./SyncFeedback";
import {
  activateSync,
  invalidateSync,
  retrySync,
  type SyncResource,
} from "./sync";
import { useStartupGate } from "./useStartupGate";
import { useMinimumLoading } from "./useMinimumLoading";
import { useLoadingExit } from "./useLoadingExit";
import { useWorkoutSession } from "./useWorkoutSession";
import {
  ActiveWorkoutBanner,
  OptionalWorkoutReview,
  WorkoutInProgress,
  WorkoutRegistration,
} from "./WorkoutRegistration";
import type { Workout } from "./model";
import type { ArenaTab } from "./SocialPanel";
const SocialPanel = lazyPanel(() => import("./SocialPanel"));
const ArenaTauntPreferences = lazyPanel(() => import("./ArenaTauntPreferences"));
import AchievementsPage, { AchievementsLink } from "./AchievementsPage";
const ArenaInbox = lazyPanel(() => import("./ArenaInbox"), { optional: true });
import { useNotificationOnboarding } from "./useNotificationOnboarding";
import {
  motivationFor,
  personalizeCapiboraMessage,
  MOTIVATIONAL_PHRASES,
} from "./motivation";
import { useWeightSync } from "./useWeightSync";
import WeightSyncStatus from "./WeightSyncStatus";
import { weightOrder } from "./weightSync";
import FlameCelebration from "./FlameCelebration";
import WorkoutCalendar, { type CalendarView } from "./WorkoutCalendar";
import WeeklyTrainingProgress from "./WeeklyTrainingProgress";
import { canOpenMissedWorkout, homeDayPresentation } from "./homeDayPresentation";
import MissedWorkout from "./MissedWorkout";
import { usePageNavigation, type Page } from "./navigation";
import { accountStorageGeneration } from "./accountStorage";
import GroupWorkoutPrompt from "./GroupWorkoutPrompt";
import Modal from "./Modal";
import { themeVariables } from "./cosmetics";
import TrainingScheduleSettings from "./TrainingScheduleSettings";
import { useTrainingPlan } from "./useTrainingPlan";
import { useTrainingCalendar } from "./useTrainingCalendar";
import { useEconomy } from "./useEconomy";
import EconomyPanel from "./EconomyPanel";
import ProteinToken from "./ProteinToken";
import BodyScale from "./BodyScale";
import { isProtectionHour, useHomeProtection } from "./useHomeProtection";
import { kitUsesRemaining } from "./economy";
import MedicalKitConfirmation from "./MedicalKitConfirmation";
import AutomaticKitNotice from "./AutomaticKitNotice";
import AppearanceSettings from "./AppearanceSettings";
import NotificationOptIn from "./NotificationOptIn";
import { useGamification } from "./useGamification";
import {
  CosmeticShop,
  MissionPanel,
  WeeklyGoals,
  equippedItem,
} from "./GamificationPanels";
const ProgressReports = lazyPanel(() => import("./ProgressReports"));
const ChallengesPanel = lazyPanel(() => import("./ChallengesPanel"));
import {
  extraRestsRemaining,
  trainingDayKind,
  isTrainingDay,
  trainingStreak,
  hasTrainingPlan,
} from "./training";

function readInitial(storageKey = STORAGE_KEY): {
  data: Data;
  error: string;
} {
  try {
    const raw = localStorage.getItem(storageKey);
    const data = raw ? parseData(raw) : freshData();
    return {
      data,
      error: "",
    };
  } catch {
    return {
      data: freshData(),
      error:
        "Não foi possível ler seus dados. O armazenamento não será sobrescrito. Verifique as permissões do navegador ou faça uma cópia dos dados antes de continuar.",
    };
  }
}

type StartupFeedback = {
  scope: string;
  blocked: boolean;
  error: string;
  onRetry?: () => void;
  onSignOut?: () => Promise<void>;
};

export default function App() {
  const account = useAccount();
  const scope = account.user?.id ?? "local";
  const previousUser = useRef(account.user?.id);
  const [entryUser, setEntryUser] = useState<string>();
  useEffect(() => {
    const id = account.user?.id;
    if (id && id !== previousUser.current) setEntryUser(id);
    if (!id) setEntryUser(undefined);
    previousUser.current = id;
  }, [account.user?.id]);
  const feedback = useRef<StartupFeedback | null>(null);
  const [startup, setStartup] = useState<Pick<
    StartupFeedback,
    "scope" | "blocked" | "error"
  > | null>(null);
  const reportStartup = useCallback((next: StartupFeedback) => {
    feedback.current = next;
    setStartup((previous) =>
      previous?.scope === next.scope &&
      previous.blocked === next.blocked &&
      previous.error === next.error
        ? previous
        : { scope: next.scope, blocked: next.blocked, error: next.error },
    );
  }, []);
  const reportGuestReady = useCallback(() => {
    reportStartup({ scope: "local", blocked: false, error: "" });
  }, [reportStartup]);
  const pending =
    account.initializing || startup?.scope !== scope || startup.blocked;
  const opening = useMinimumLoading(pending);
  const loading = useLoadingExit(opening);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.toggleAttribute("data-capibora-opening", loading.visible);
    return () => root.removeAttribute("data-capibora-opening");
  }, [loading.visible]);
  const current = feedback.current?.scope === scope ? feedback.current : null;
  return (
    <>
      {loading.visible && (
        <InitialLoading
          leaving={loading.leaving}
          onExited={loading.finish}
          error={current?.error}
          onRetry={current?.onRetry}
          onSignOut={current?.onSignOut}
        />
      )}
      {!account.initializing && !account.user && (
        <GuestExperience
          account={account}
          opening={opening}
          onReady={reportGuestReady}
        />
      )}
      {!account.initializing && account.user && (
        <TrainerApp
          key={scope}
          account={account}
          opening={opening}
          onStartup={reportStartup}
          completeProfileOnEntry={entryUser === account.user.id}
        />
      )}
    </>
  );
}

function TrainerApp({
  account,
  opening,
  completeProfileOnEntry,
  onStartup,
}: {
  account: Account;
  opening: boolean;
  completeProfileOnEntry?: boolean;
  onStartup: (state: StartupFeedback) => void;
}) {
  const storageKey = account.user
    ? `${STORAGE_KEY}:account:${account.user.id}`
    : STORAGE_KEY;
  const [initial] = useState(() => readInitial(storageKey));
  const [storageGeneration] = useState(() =>
    account.user ? accountStorageGeneration(account.user.id) : 0,
  );
  const [data, setData] = useState(initial.data);
  const [storageError, setStorageError] = useState(initial.error);
  const [now, setNow] = useState(() => new Date());
  const [phraseOffset] = useState(() =>
    Math.floor(Math.random() * MOTIVATIONAL_PHRASES.length),
  );
  const [modal, setModal] = useState<
    | "workout"
    | "weight"
    | "auth"
    | "share"
    | "group-notify"
    | "rest"
    | "notification-opt-in"
    | "kit"
    | "protection"
    | "missions"
    | "training-plan"
    | "plan-ready"
    | "workout-review"
    | "automatic-kit"
    | "password-recovery"
    | "missed-workout"
    | null
  >(null);
  const [toast, setToast] = useState("");
  const [reviewWorkout, setReviewWorkout] = useState<Workout | null>(null);
  const [planBusy, setPlanBusy] = useState(false);
  const [workoutBusy, setWorkoutBusy] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  useEffect(() => {
    if (account.passwordRecovery && !opening && !modal) setModal("password-recovery");
    else if (!account.passwordRecovery && modal === "password-recovery") setModal(null);
  }, [account.passwordRecovery, opening, modal]);
  const [missedDay, setMissedDay] = useState<string | null>(null);
  const [missedBusy, setMissedBusy] = useState(false);
  const [missedTitle, setMissedTitle] = useState("Não treinei hoje");
  const [dismissedKitNotices, setDismissedKitNotices] = useState<Set<string>>(() => new Set());
  const [reportsOpen, setReportsOpen] = useState(false);
  const [quickChallengeFriend, setQuickChallengeFriend] = useState<string | undefined>();
  const [challengeInvites, setChallengeInvites] = useState<{
    userId: string;
    count: number;
  } | null>(null);
  const updateChallengeInvites = useCallback((count: number) => {
    const userId = account.user?.id;
    if (!userId) return;
    setChallengeInvites((previous) =>
      previous?.userId === userId && previous.count === count
        ? previous
        : { userId, count },
    );
  }, [account.user?.id]);
  const [arenaTab, setArenaTab] = useState<ArenaTab>("groups");
  const [celebrating, setCelebrating] = useState(false);
  const [newWorkoutDay, setNewWorkoutDay] = useState<string | null>(null);
  const [guestWeights] = useState(() =>
    account.user ? readInitial().data.weights : [],
  );
  const notificationOnboarding = useNotificationOnboarding(
    account.user?.id ?? null,
    Boolean(
      account.profile &&
        account.profileChecked &&
        !account.profileLoading &&
        !account.profileError,
    ),
  );
  useEffect(() => {
    if (notificationOnboarding.prompt && !modal)
      setModal("notification-opt-in");
    else if (!notificationOnboarding.prompt && modal === "notification-opt-in")
      setModal(null);
  }, [notificationOnboarding.prompt, modal]);
  const { page: active, navigate, goBack, resetKey, arenaTab: routeArenaTab, shopSection, arenaGroup, arenaFriend } = usePageNavigation();
  useEffect(() => {
    if (routeArenaTab) setArenaTab(routeArenaTab);
  }, [routeArenaTab]);
  const entryHandled = useRef(false);
  useEffect(() => {
    if (!completeProfileOnEntry || entryHandled.current || !account.profileChecked || account.profileLoading || account.profileError || modal) return;
    entryHandled.current = true;
    if (!account.profile && active !== "profile") navigate("profile", { replace: true });
  }, [completeProfileOnEntry, account.profileChecked, account.profileLoading, account.profileError, account.profile, active, modal, navigate]);
  const mainRef = useRef<HTMLElement>(null);
  const [calendarView, setCalendarView] = useState<CalendarView>(() => ({
    month: localDate().slice(0, 7),
    day: localDate(),
  }));
  useEffect(() => {
    setModal(null);
    setNewWorkoutDay(null);
    window.scrollTo({ top: 0, behavior: "instant" });
    mainRef.current
      ?.querySelector<HTMLElement>("h1")
      ?.focus({ preventScroll: true });
  }, [active]);
  const training = useTrainingPlan(
    account.user?.id ?? null,
    Boolean(initial.error),
  );
  const trainingCalendar = useTrainingCalendar(
    account.user?.id ?? null,
    active === "workouts" && !reportsOpen,
    calendarView.month,
    training.state?.timezone ?? "UTC",
  );
  const economy = useEconomy(account.user?.id ?? null, Boolean(initial.error));
  const automaticKitNotices = (economy.state?.automaticNotices ?? [])
    .filter((notice) => !dismissedKitNotices.has(notice.id));
  const automaticKitNoticeKey = automaticKitNotices.map((notice) => notice.id).join(",");
  useEffect(() => {
    if (!opening && !modal && automaticKitNotices.length &&
      economy.sync?.lastSuccess && !economy.sync.stale) setModal("automatic-kit");
    else if (modal === "automatic-kit" && !automaticKitNotices.length) setModal(null);
  }, [opening, modal, automaticKitNoticeKey, economy.sync?.lastSuccess, economy.sync?.stale]);
  function dismissAutomaticKits() {
    const ids = automaticKitNotices.map((notice) => notice.id);
    setDismissedKitNotices((previous) => new Set([...previous, ...ids]));
    setModal(null);
    // A receipt can be retried; dismissing it must never trap an offline user.
    if (ids.length) void economy.acknowledgeAutomatic(ids);
  }
  // The account's server day is authoritative; device clock changes cannot reopen a day.
  const today = training.state?.today ?? localDate(now);
  const previousServerDay = useRef(localDate());
  useEffect(() => {
    if (!training.state) return;
    const next = training.state.today,
      previous = previousServerDay.current;
    setCalendarView((view) =>
      view.day === previous ? { month: next.slice(0, 7), day: next } : view,
    );
    previousServerDay.current = next;
  }, [training.state?.today]);
  const phraseIndex =
    (phraseOffset + Math.floor(Date.parse(`${today}T00:00:00Z`) / 86400000)) %
    MOTIVATIONAL_PHRASES.length;
  // Old guest records remain stored for recovery, but cannot become an account streak.
  const workouts = useMemo(
    () => account.user ? data.workouts.filter((w) => Boolean(w.confirmedAt)) : [],
    [account.user, data.workouts],
  );
  const trained = workouts.some((w) => w.date === today);
  const todayWorkout = workouts.find((w) => w.date === today);
  const pendingWorkout = account.user
    ? data.workouts.find(
        (w) => w.date === today && w.method === "manual" && !w.confirmedAt,
      )
    : undefined;
  const workoutTime = todayWorkout?.confirmedAt ?? todayWorkout?.recordedAt;
  const { current: currentStreak, best: recordStreak } = useMemo(
    () => trainingStreak(workouts, training.state, today),
    [workouts, training.state, today],
  );
  const todayKind = trainingDayKind(training.state, today);
  const canProtectToday = Boolean(
    account.user &&
      training.state &&
      isTrainingDay(todayKind) &&
      !trained &&
      !economy.state?.protections.some((p) => p.day === today),
  );
  const extraAvailable = training.state
    ? extraRestsRemaining(training.state, today)
    : 0;
  const kitUsesAvailable = economy.state
    ? kitUsesRemaining(economy.state)
    : null;
  const profile = account.user
    ? account.profileChecked
      ? account.profile
      : (account.profile ?? data.profile)
    : data.profile;
  const motivation = motivationFor(
    trained,
    phraseIndex,
    account.phrasePreferences
      ? { ...account.phrasePreferences, fallbackName: profile?.nickname }
      : undefined,
  );
  const weights = useMemo(() => [...data.weights].sort(weightOrder), [data.weights]);
  const latestWeight = weights.at(-1);
  const weightChange =
    weights.length > 1 ? weights.at(-1)!.kg - weights[0].kg : null;
  const trainedDays = useMemo(() => new Set(workouts.map((w) => w.date)), [workouts]);
  const lastData = useRef(data);
  lastData.current = data;
  const social = useSocial(
    Boolean(account.user && account.profile),
    data.workouts,
    (remote, confirmed) => {
      if (initial.error) return;
      setData((prev) => {
        const byDay = new Map(prev.workouts.map((w) => [w.date, w]));
        remote.forEach((w) => {
          const merged = { ...byDay.get(w.date), ...w };
          if (w.confirmedAt) delete merged.manualConfirmation;
          byDay.set(w.date, merged);
        });
        const workouts = [...byDay.values()].sort((a, b) =>
          a.date.localeCompare(b.date),
        );
        return JSON.stringify(workouts) === JSON.stringify(prev.workouts)
          ? prev
          : { ...prev, workouts };
      });
      if (confirmed) completeWorkout(confirmed, false, false);
    },
    training.state?.timezone,
    training.state?.today,
    account.user?.id ?? null,
  );
  const workoutSession = useWorkoutSession(
    account.user?.id ?? null,
    Boolean(account.profile && account.profileChecked),
  );
  const activeSession =
    !trained && workoutSession.state?.session?.status === "active";
  const missedVisibility = {
    authenticated: Boolean(account.user && training.enabled),
    training: training.state,
    recording: workoutSession.state,
    trained,
    pendingWorkout: Boolean(pendingWorkout),
    protectedDay: Boolean(
      economy.state?.protections.some((p) => p.day === today),
    ),
  };
  const missedAvailable = canOpenMissedWorkout({
    ...missedVisibility,
    elapsedMs:
      performance.now() - (workoutSession.anchor?.current ?? performance.now()),
  });
  const reminderSession = useRef(workoutSession.state);
  reminderSession.current = workoutSession.state;
  const homeProtection = useHomeProtection({
    userId: account.user?.id ?? null,
    today,
    eligible: Boolean(
      canProtectToday &&
        currentStreak > 0 &&
        !activeSession &&
        !pendingWorkout &&
        training.state &&
        economy.state?.today === today &&
        (extraAvailable > 0 ||
          (economy.state.kits > 0 && kitUsesAvailable !== 0 && economy.state.kitEligibility?.allowed !== false)) &&
        isProtectionHour(now, today, training.state.timezone),
    ),
    available:
      active === "overview" &&
      !modal &&
      navigator.onLine !== false &&
      document.visibilityState === "visible",
    refresh: async () => {
      const refreshed = await Promise.all([
        training.refresh(),
        economy.refresh(),
        social.refresh(),
        workoutSession.refresh(),
      ]);
      return refreshed.every(Boolean);
    },
  });
  useEffect(() => {
    if (homeProtection.offer && active === "overview" && !modal)
      setModal("protection");
    else if (!homeProtection.offer && modal === "protection") setModal(null);
  }, [homeProtection.offer, active, modal]);
  const previousDay = shiftDate(today, -1);
  const returning =
    workouts.length > 0 &&
    previousDay >= (training.state?.startedOn ?? today) &&
    isTrainingDay(trainingDayKind(training.state, previousDay)) &&
    !workouts.some((w) => w.date === previousDay);
  const needsFirstPlan = Boolean(
    training.enabled && training.state && !hasTrainingPlan(training.state),
  );
  const homeDay = homeDayPresentation(todayKind, trained, motivation, {
    needsPlan:
      !account.user ||
      Boolean(
        training.enabled && training.state && !hasTrainingPlan(training.state),
      ),
    active: activeSession,
    returning,
  });
  const homeVoice = useCapiboraVoice(
    homeDay.context,
    homeDay.facts,
    today,
    account.user?.id,
  );
  const homeSpeech =
    homeProtection.offer && homeDay.context === "pending"
      ? capiboraMessage("protection-risk")
      : (homeVoice ?? {
          title: homeDay.title,
          body: homeDay.body,
          expression: "neutral" as const,
        });
  const homeMessage =
    homeDay.context === "pending" || homeDay.context === "completed"
      ? personalizeCapiboraMessage(
          homeSpeech,
          phraseIndex,
          account.phrasePreferences
            ? { ...account.phrasePreferences, fallbackName: profile?.nickname }
            : undefined,
        )
      : homeSpeech;
  function completeWorkout(
    workout: Workout,
    offerReview = false,
    closeModal = true,
  ) {
    if (
      !account.user ||
      accountStorageGeneration(account.user.id) !== storageGeneration
    )
      return;
    setData((prev) => ({
      ...prev,
      workouts: [
        ...prev.workouts.filter((w) => w.date !== workout.date),
        workout,
      ].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setToast(
      `Treino registrado · ${phraseText("completed", Math.floor(Date.parse(workout.date) / 86400000), { completed: true })}`,
    );
    setNewWorkoutDay(workout.date);
    setCalendarView({ month: workout.date.slice(0, 7), day: workout.date });
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
      setCelebrating(true);
    if (offerReview && !workout.review) {
      setReviewWorkout(workout);
      setModal("workout-review");
    } else if (closeModal) setModal(null);
  }
  const notifyGroups =
    social.state?.groups.filter(
      (g) =>
        g.status === "active" &&
        g.members.some((m) => m.id === account.user?.id && m.accepted),
    ) ?? [];
  const notifyWorkout = social.state?.workouts.find(
    (w) => w.date === newWorkoutDay,
  );
  useEffect(() => {
    if (!newWorkoutDay || !social.state || !notifyWorkout?.confirmedAt || modal)
      return;
    if (notifyGroups.length) setModal("group-notify");
    else setNewWorkoutDay(null);
  }, [newWorkoutDay, social.state, modal]);
  const weightSync = useWeightSync(
    account.user?.id ?? null,
    data.weights,
    (weights) => {
      setData((prev) =>
        JSON.stringify(prev.weights) === JSON.stringify(weights)
          ? prev
          : { ...prev, weights },
      );
    },
    Boolean(initial.error),
    training.state?.timezone,
    () =>
      setToast(
        `Peso registrado · ${phraseText("weight-logged", data.weights.length, { weightLogged: true })}`,
      ),
  );
  const game = useGamification(
    account.user?.id ?? null,
    "",
    Boolean(account.profile && account.profileChecked),
  );
  const lastShopSection = useRef("");
  useEffect(() => {
    if (opening) return;
    if (active !== "shop" || !shopSection) {
      lastShopSection.current = "";
      return;
    }
    if (lastShopSection.current === shopSection) return;
    const selector = shopSection === "kits" ? ".kit-shop" : shopSection === "banners" ? "#shop-banner-heading" : "#shop-frame-heading";
    const target = mainRef.current?.querySelector<HTMLElement>(selector);
    if (!target) return;
    lastShopSection.current = shopSection;
    target.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [opening, active, shopSection, Boolean(economy.state), Boolean(game.state?.cosmetics)]);
  const frameId = equippedItem(game.state, "frame");
  const shareStyle = equippedItem(game.state, "share");
  const cosmeticTheme = equippedItem(game.state, "theme");
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.cosmeticTheme = cosmeticTheme ?? "";
    const keys = ["--accent", "--accent-text", "--accent-soft"];
    const update = () => {
      keys.forEach((key) => root.style.removeProperty(key));
      Object.entries(
        themeVariables(
          cosmeticTheme,
          root.dataset.theme === "light" ? "light" : "dark",
        ),
      ).forEach(([key, value]) => root.style.setProperty(key, String(value)));
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      observer.disconnect();
      delete root.dataset.cosmeticTheme;
      keys.forEach((key) => root.style.removeProperty(key));
    };
  }, [cosmeticTheme]);
  useEffect(() => {
    if (
      game.state?.economyRevision != null &&
      game.state.economyRevision > (economy.state?.revision ?? -1)
    )
      invalidateSync(account.user?.id ?? null, ["economy"]);
  }, [game.state?.economyRevision, economy.state?.revision]);
  useEffect(() => {
    if (!account.user) return;
    const pages: Record<Page, SyncResource[]> = {
      overview: [
        "training",
        "social",
        "economy",
        "gamification",
        "weights",
        "session",
      ],
      workouts: ["training", "social", "reports", "economy", "calendar"],
      weight: ["weights", "economy"],
      social: ["social", "inbox", "reactions", "challenges", "gamification", "economy", "showcase"],
      shop: ["economy", "gamification"],
      settings: ["profile", "economy", "inbox", "gamification"],
      achievements: ["gamification"],
      session: ["session", "economy"],
      profile: ["profile", "gamification", "social", "training", "economy"],
    };
    activateSync(account.user.id, [
      "profile",
      "notifications",
      "session",
      ...(social.state?.tauntNotices ? ["inbox" as const] : []),
      ...pages[active],
    ]);
  }, [active, account.user?.id, modal, social.state?.tauntNotices]);
  useEffect(() => {
    if (economy.notice && active !== "shop") {
      economy.clearNotice();
    }
  }, [economy.notice, active]);

  useEffect(() => {
    if (!celebrating) return;
    const timer = window.setTimeout(() => setCelebrating(false), 2600);
    return () => window.clearTimeout(timer);
  }, [celebrating]);

  useEffect(() => {
    if (account.user && account.profileChecked)
      setData((prev) =>
        prev.profile === account.profile
          ? prev
          : { ...prev, profile: account.profile },
      );
  }, [account.user, account.profile, account.profileChecked]);

  useEffect(() => {
    if (initial.error) return;
    if (
      account.user &&
      accountStorageGeneration(account.user.id) !== storageGeneration
    )
      return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      setStorageError("");
    } catch {
      setStorageError(
        "Não foi possível salvar no navegador. Seus registros podem ser perdidos ao fechar esta página.",
      );
    }
  }, [data, initial.error, storageKey, storageGeneration, account.user]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    let cancelled = false,
      checking = false;
    const checked = new Set<string>();
    const checkReminders = async () => {
      if (checking) return;
      checking = true;
      try {
        setNow(new Date());
        if (
          !account.user ||
          !training.enabled ||
          !notificationOnboarding.allowed ||
          navigator.onLine === false ||
          document.visibilityState !== "visible"
        )
          return;
        const time = new Date(),
          state = training.getCurrent();
        const reminderDay = state?.today ?? localDate(time);
        const due = dueReminders(
          lastData.current,
          time,
          false,
          reminderDay,
          state?.timezone,
        );
        for (const reminder of due) {
          // Session recovery is secondary to opening the app, but must finish
          // before the local workout channel can present a reminder.
          if (reminder.id === "workout" && !reminderSession.current) continue;
          const event = `${reminderDay}:${reminder.id}:${reminder.time}`;
          if (checked.has(event)) continue;
          const copy = await claimReminder(
            reminder,
            state?.timezone ?? deviceTimezone(),
          );
          checked.add(event);
          if (
            cancelled ||
            accountStorageGeneration(account.user.id) !== storageGeneration
          )
            return;
          if (!copy) continue;
          // Recheck preference/account after asynchronous browser preparation too.
          const canPresent = () => {
            const fresh = training.getCurrent();
            const workoutAllowed = reminder.id !== "workout" || Boolean(
              fresh && fresh.today === copy.day &&
              isTrainingDay(trainingDayKind(fresh, copy.day)) &&
              !lastData.current.workouts.some((w) => w.date === copy.day && w.confirmedAt) &&
              reminderSession.current?.session?.status !== "active"
            );
            const current = lastData.current.reminders.find(
              (r) => r.id === reminder.id,
            );
            return (
              !cancelled &&
              workoutAllowed &&
              (typeof Notification === "undefined" || Notification.permission === "granted") &&
              navigator.onLine !== false &&
              document.visibilityState === "visible" &&
              accountStorageGeneration(account.user!.id) ===
                storageGeneration &&
              Boolean(current?.enabled && current.time === reminder.time)
            );
          };
          if (!canPresent()) continue;
          const next = {
            ...lastData.current,
            reminders: lastData.current.reminders.map((r) =>
              r.id === reminder.id ? { ...r, lastSent: copy.day } : r,
            ),
          };
          lastData.current = next;
          setData(next);
          // One presentation per event: OS notification, or an in-app fallback.
          if (
            !(await notify(copy.title, copy.body, copy.tag, canPresent)) &&
            canPresent()
          )
            setToast(`${copy.title} — ${copy.body}`);
        }
      } catch {
        // No offline/unverified reminder, no repeated error alerts on the scheduler.
      } finally {
        checking = false;
      }
    };
    void checkReminders();
    const timer = window.setInterval(() => void checkReminders(), 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkReminders();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [
    training.enabled,
    training.getCurrent,
    notificationOnboarding.allowed,
    Boolean(workoutSession.state),
    account.user?.id,
    storageGeneration,
  ]);

  function requestWorkout() {
    if (training.enabled && !training.state) {
      setToast(
        training.error ||
          "Aguarde carregar sua programação antes de registrar o treino",
      );
      void training.refresh();
      return;
    }
    setModal(
      account.user
        ? training.enabled && !hasTrainingPlan(training.state)
          ? "training-plan"
          : "workout"
        : "auth",
    );
  }
  async function protectToday() {
    if (!canProtectToday || economy.state?.kitEligibility?.allowed === false) return false;
    const protectedDay = await economy.useKit(today);
    return protectedDay;
  }

  const startup = useStartupGate(
    account.user && account.sync ? account.user.id : null,
    [
      { available: account.profileChecked, sync: account.sync },
      { available: Boolean(training.state), sync: training.sync },
      { available: Boolean(economy.state), sync: economy.sync },
      {
        available: Boolean(weightSync.cached || weightSync.synced),
        sync: weightSync.sync,
        error: weightSync.error,
      },
      ...(account.profile
        ? [
            { available: Boolean(social.state), sync: social.sync },
            { available: Boolean(game.state), sync: game.sync },
          ]
        : []),
      ...(active === "workouts" && !reportsOpen
        ? [
            {
              available: Boolean(trainingCalendar.state),
              sync: trainingCalendar.sync,
            },
          ]
        : []),
    ],
    {
      available: !account.profile || Boolean(workoutSession.state),
      sync: workoutSession.sync,
    },
  );
  const startupStorageError =
    initial.error ||
    (weightSync.error && !weightSync.sync?.error ? weightSync.error : "");
  const startupError = startup.blocked
    ? startupStorageError ||
      (startup.authError
        ? "Sua sessão precisa ser renovada. Entre novamente para carregar sua conta"
        : startup.error
          ? navigator.onLine
            ? "Não foi possível carregar todas as informações. Tente novamente"
            : "Sem conexão e sem todos os dados em cache. Conecte-se para carregar sua conta"
          : "")
    : "";
  const scope = account.user?.id ?? "local";
  useEffect(() => {
    onStartup({
      scope,
      blocked: startup.blocked,
      error: startupError,
      onRetry:
        startupStorageError || !account.user
          ? undefined
          : () => retrySync(scope),
      onSignOut: account.signOut,
    });
  }, [
    onStartup,
    scope,
    startup.blocked,
    startupError,
    startupStorageError,
    account.signOut,
  ]);
  function openMainPage(page: Page) {
    const reset = page === active;
    if (reset && (
      modal || planBusy || workoutBusy || missedBusy ||
      syncWriting(account.user!.id) ||
      document.querySelector('dialog[open], [data-critical-operation][aria-busy="true"]')
    )) return;
    if (reset) {
      setCalendarView({ month: today.slice(0, 7), day: today });
      setReportsOpen(false);
      setQuickChallengeFriend(undefined);
      setNewWorkoutDay(null);
      if (page === "social") setArenaTab("groups");
    }
    navigate(page, {
      ...(page === "social" ? { tab: reset ? "groups" : arenaTab } : {}),
      replace: reset,
      reset,
    });
    if (reset) requestAnimationFrame(() =>
      mainRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }),
    );
  }
  if (opening || startup.blocked) return null;
  return (
    <div className="app-shell" data-page={active}>
      {celebrating && <FlameCelebration />}
      <AppHeader
        profile={profile}
        frameId={frameId}
        balance={economy.state?.balance ?? null}
        authenticated
        currentStreak={currentStreak}
        recordStreak={recordStreak}
        trained={trained}
        protectedDay={!isTrainingDay(todayKind) && todayKind !== "unplanned"}
        onHome={() => openMainPage("overview")}
        onStreak={() => {
          setCalendarView({ month: today.slice(0, 7), day: today });
          setReportsOpen(false);
          navigate("workouts");
        }}
        onShop={() => openMainPage("shop")}
        onProfile={() => openMainPage("profile")}
      />
      <AppNavigation page={active} authenticated onNavigate={openMainPage} />
      <main id="main-content" ref={mainRef} aria-labelledby="page-title">
        <div className="page-content">
          {account.user && (
            <SyncFeedback
              userId={account.user.id}
              onLogin={() => setModal("auth")}
            />
          )}
          {storageError && (
            <div className="storage-warning" role="alert">
              {storageError}
            </div>
          )}
          {account.authNotice && (
            <div className="auth-return-notice" role="alert">
              <span>{account.authNotice}</span>
              <button
                className="icon-button"
                aria-label="Fechar aviso de entrada"
                onClick={account.dismissAuthNotice}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {active === "overview" && account.user && (
            <div className="entry-notices">
              <EmailConfirmationNotice key={account.user.id} account={account} />
              {!profile && account.profileChecked && !account.profileError && <ProfileCompletionNotice onOpen={() => navigate("profile")} />}
            </div>
          )}
          {activeSession && active !== "overview" && active !== "session" && (
            <div className="session-resume">
              <ActiveWorkoutBanner
                controller={workoutSession}
                onResume={() => navigate("session")}
              />
            </div>
          )}
          {active === "overview" && (
            <>
              {pendingWorkout && (
                <div>
                  <button
                    className="active-workout-banner"
                    disabled={social.busy}
                    onClick={() =>
                      validManualConfirmation(pendingWorkout.manualConfirmation)
                        ? void social.refresh()
                        : hasTrainingPlan(training.state) || !training.enabled
                          ? setModal("workout")
                          : setModal("training-plan")
                    }
                  >
                    <Clock3 size={19} />
                    <span>
                      {validManualConfirmation(
                        pendingWorkout.manualConfirmation,
                      )
                        ? "Treino aguardando conexão"
                        : "Conclua a confirmação do treino"}
                      <strong>
                        {validManualConfirmation(
                          pendingWorkout.manualConfirmation,
                        )
                          ? "Aguardando confirmação online"
                          : "Responda às três perguntas"}
                      </strong>
                    </span>
                    <span>
                      {validManualConfirmation(
                        pendingWorkout.manualConfirmation,
                      )
                        ? "Sincronizar"
                        : "Revisar"}{" "}
                      <ArrowRight size={16} />
                    </span>
                  </button>
                  {social.error && (
                    <p className="form-error" role="alert">
                      {social.error}
                    </p>
                  )}
                </div>
              )}
              <section
                className={`hero today-card ${trained ? "hero-done" : ""}`}
                aria-label="Treino de hoje"
              >
                {homeDay.information &&
                  ![
                    "Treino de hoje",
                    "Treino concluído",
                    "Treino em andamento",
                  ].includes(homeDay.information) && (
                    <div className="today-card-heading">
                      <span className="today-state">{homeDay.information}</span>
                    </div>
                  )}
                <CapiboraMessage
                  message={homeMessage}
                  variant="hero"
                  heading="h1"
                  titleId="page-title"
                  size={160}
                  animate={trained}
                />
                {homeDay.explanation && (
                  <p className="sr-only">{homeDay.explanation}</p>
                )}
                <div className="today-action">
                  {activeSession ? (
                    <ActiveWorkoutBanner
                      controller={workoutSession}
                      onResume={() => navigate("session")}
                    />
                  ) : (
                    <div
                      className={`hero-actions${missedAvailable ? " has-missed-workout" : ""}`}
                    >
                      {missedAvailable && (
                        <button
                          className="missed-workout-trigger"
                          onClick={() => {
                            if (
                              !canOpenMissedWorkout({
                                ...missedVisibility,
                                elapsedMs:
                                  performance.now() -
                                  (workoutSession.anchor?.current ??
                                    performance.now()),
                              })
                            )
                              return;
                            // This screen replaces the optional suggestion for this visit/day;
                            // it never disables automatic kits or notification preferences.
                            homeProtection.dismiss();
                            setMissedDay(today);
                            setModal("missed-workout");
                          }}
                        >
                          Não treinei hoje
                        </button>
                      )}
                      <button
                        className={`primary-button hero-button${needsFirstPlan ? " needs-first-plan" : ""}`}
                        aria-label={
                          trained
                            ? "Treino de hoje concluído"
                            : "Registrar treino"
                        }
                        aria-describedby={
                          trained && workoutTime
                            ? "today-workout-time"
                            : undefined
                        }
                        disabled={trained}
                        onClick={() => {
                          if (!trained) requestWorkout();
                        }}
                      >
                        {trained ? (
                          <CheckCheck size={21} />
                        ) : (
                          <Plus size={21} />
                        )}
                        <span className="hero-action-label">
                          <span>
                            {trained
                              ? homeDay.voluntary
                                ? "Treino voluntário registrado"
                                : "Treino registrado"
                              : "Registrar treino"}
                          </span>
                          {workoutTime && (
                            <time
                              id="today-workout-time"
                              dateTime={workoutTime}
                            >
                              {" "}
                              às{" "}
                              {new Date(workoutTime).toLocaleTimeString(
                                "pt-BR",
                                {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: training.state?.timezone,
                                },
                              )}
                            </time>
                          )}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <WeeklyTrainingProgress
                compact
                workouts={workouts}
                training={account.user ? training.state : null}
              />
              <WeeklyGoals game={game} onOpen={() => setModal("missions")} />
            </>
          )}
          {active === "session" && (
            <WorkoutInProgress
              controller={workoutSession}
              authenticated={Boolean(account.user)}
              onLogin={() => setModal("auth")}
              onBack={() => goBack("overview")}
              onConfirmed={(w) => completeWorkout(w, true)}
            />
          )}
          {active === "workouts" && reportsOpen && account.user ? (
            <div className="workouts-page">
              <PageHeading title="Treinos" icon={Dumbbell} />
              <ProgressReports
                userId={account.user.id}
                today={today}
                timezone={training.state?.timezone ?? "UTC"}
                onClose={() => setReportsOpen(false)}
              />
            </div>
          ) : (
            active === "workouts" && (
              <WorkoutCalendar
                key={resetKey}
                workouts={workouts}
                today={today}
                view={calendarView}
                onView={setCalendarView}
                calendar={trainingCalendar}
                training={training.state}
                schedule={training}
                onPlanSaved={(firstPlan) => {
                  if (firstPlan) setModal("plan-ready");
                }}
                onRescheduled={(target) => {
                  setToast(
                    `Treino transferido para ${formatDay(target, { weekday: "long", day: "numeric", month: "short" })}`,
                  );
                }}
                onLogin={() => setModal("auth")}
                onKits={account.user ? () => navigate("shop", { section: "kits" }) : undefined}
                kits={economy.state?.kits}
                onRest={
                  training.enabled && training.state
                    ? () => setModal("rest")
                    : undefined
                }
                restBusy={training.busy}
                onReports={
                  game.state?.features?.reports
                    ? () => setReportsOpen(true)
                    : undefined
                }
              />
            )
          )}
          {active === "weight" && (
            <section className="weight-page" id="weight" key={resetKey}>
              <PageHeading title="Meu peso" icon={BodyScale}>
                <button
                  className="outline-button"
                  aria-label="Registrar peso"
                  onClick={() => setModal(account.user ? "weight" : "auth")}
                >
                  <Plus size={18} /> Registrar
                </button>
              </PageHeading>
              <div className="card weight-card">
                {account.user && (
                  <WeightSyncStatus
                    sync={weightSync}
                    guest={guestWeights}
                    onError={setToast}
                  />
                )}
                <div className="weight-summary">
                  <strong>
                    {latestWeight ? formatKg(latestWeight.kg) : "—"}
                    <span> kg</span>
                  </strong>
                  {latestWeight && (
                    <span className="weight-date">
                      {formatDay(latestWeight.date)}
                    </span>
                  )}
                </div>
                {weightChange !== null && (
                  <span className="weight-delta">
                    {weightChange < 0 ? (
                      <ArrowDownRight size={16} />
                    ) : (
                      <ArrowUpRight size={16} />
                    )}
                    {weightChange > 0 ? "+" : ""}
                    {formatKg(weightChange)} kg desde o início
                  </span>
                )}
                <WeightChart weights={weights.slice(-30)} />
                {weights.length > 0 && (
                  <details className="weight-history">
                    <summary>Ver registros de peso ({weights.length})</summary>
                    <div className="weight-list">
                      {[...weights].reverse().map((w) => (
                        <div
                          className="history-row weight-entry-row"
                          key={w.id ?? w.date}
                        >
                          <span>
                            {formatDay(w.date, {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                            {w.recordedAt && (
                              <time
                                dateTime={w.recordedAt}
                                title="Horário do registro"
                              >
                                <Clock3 size={12} />
                                {new Date(w.recordedAt).toLocaleTimeString(
                                  "pt-BR",
                                  {
                                    timeZone: training.state?.timezone,
                                    hour: "2-digit",
                                    minute: "2-digit",
                                    second: "2-digit",
                                  },
                                )}
                              </time>
                            )}
                          </span>
                          <strong>{formatKg(w.kg)} kg</strong>
                          <LockKeyhole
                            size={15}
                            className="weight-entry-lock"
                            aria-label="Registro imutável"
                          />
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
          )}
          {active === "achievements" && account.user && <AchievementsPage key={account.user.id} game={game} onBack={() => goBack()} />}
          {active === "profile" && (
            <section className="profile-page" aria-labelledby="page-title">
              <PageHeading title="Perfil" icon={UserRound} before={<button className="icon-button" aria-label="Voltar do perfil" onClick={() => goBack()}><ArrowLeft size={20} /></button>} />
              <ProfilePanel
                key={resetKey}
                profile={profile}
                account={account}
                cosmeticFrame={frameId}
                cosmeticBanner={equippedItem(game.state, "banner")}
                stats={{
                  workouts: trainedDays.size,
                  streak: currentStreak,
                  bestStreak: recordStreak,
                }}
                onSaveLocal={(profile) =>
                  setData((prev) => ({ ...prev, profile }))
                }
                onSaved={(message) => {
                  setToast(message);
                }}
                onRegistrationCompleted={() => notificationOnboarding.request()}
              >
                {game.state?.cosmetics && (
                  <button
                    type="button"
                    className="profile-shop-link"
                    onClick={() => navigate("shop", { section: "molduras" })}
                  >
                    <Palette size={22} aria-hidden="true" />
                    <span>
                      Personalizar perfil
                      <small>Molduras e banners</small>
                    </span>
                    <ArrowRight size={17} aria-hidden="true" />
                  </button>
                )}
                <AchievementsLink onOpen={() => navigate("achievements")} />
                <button
                  className="outline-button profile-share-button"
                  disabled={currentStreak < 1}
                  onClick={() => setModal("share")}
                >
                  <Share2 size={18} aria-hidden="true" /> Compartilhar ofensiva
                </button>
              </ProfilePanel>
            </section>
          )}
          {active === "shop" && (
            <section className="shop-page" aria-labelledby="page-title">
              <PageHeading title="Loja" icon={ShoppingBag} />
              {account.user ? (
                <EconomyPanel
                  key={resetKey}
                  economy={economy}
                  canProtect={canProtectToday}
                  onProtect={protectToday}
                >
                  <CosmeticShop
                    game={game}
                    balance={economy.state?.balance ?? 0}
                    onChanged={() => {}}
                  />
                </EconomyPanel>
              ) : (
                <div className="shop-guest">
                  <ProteinToken size={44} />
                  <p>Seus potes e kits ficam aqui</p>
                  <button
                    className="primary-button"
                    onClick={() => setModal("auth")}
                  >
                    Entrar na conta <ArrowRight size={18} />
                  </button>
                </div>
              )}
            </section>
          )}
          {active === "settings" && (
            <div className="settings-page" key={resetKey}>
              <PageHeading title="Configurações" icon={Settings} before={<button className="icon-button" aria-label="Voltar de configurações" onClick={() => goBack()}><ArrowLeft size={20} /></button>} />
              <AppearanceSettings />
              <InstallApp />
              {account.user && <>
                <section className="settings-section" aria-labelledby="taunt-settings-heading">
                  <h2 id="taunt-settings-heading"><MessageCircle size={20} aria-hidden="true" /> Provocações</h2>
                  <ArenaTauntPreferences key={account.user.id} userId={account.user.id} />
                </section>
              </>}
              <AboutApp />
            </div>
          )}
          {active === "social" && (
            <SocialPanel
              key={`${account.user?.id ?? "guest"}:${resetKey}`}
              account={account}
              social={social}
              onProfile={() =>
                account.user ? navigate("profile") : setModal("auth")
              }
              cosmetics={game.state?.cosmetics}
              initialTab={routeArenaTab ?? arenaTab}
              initialGroupId={arenaGroup}
              initialFriendId={arenaFriend}
              onGroupOpen={(group) => navigate("social", { tab: "groups", group })}
              onFriendOpen={(friend) => navigate("social", { tab: "friends", friend })}
              onDetailBack={() => goBack("social")}
              challengeInvites={
                challengeInvites?.userId === account.user?.id
                  ? challengeInvites?.count
                  : undefined
              }
              onChallenge={game.state?.features?.challenges ? setQuickChallengeFriend : undefined}
              onTabChange={(tab) => {
                setArenaTab(tab);
                navigate("social", { tab });
              }}
              challenges={
                account.user && game.state?.features?.challenges ? (
                  <ChallengesPanel
                    userId={account.user.id}
                    arenaVersion={social.state?.arenaVersion}
                    onInvitesChanged={updateChallengeInvites}
                    initialFriend={quickChallengeFriend}
                    onQuickHandled={() => setQuickChallengeFriend(undefined)}
                    friends={social.state?.friends ?? []}
                    currentProfile={profile}
                    currentFrame={frameId}
                    onChanged={() => {
                      invalidateSync(account.user?.id ?? null, [
                        "gamification",
                        "economy",
                      ]);
                    }}
                  />
                ) : undefined
              }
            />
          )}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          <span>{toast}</span>
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal === "password-recovery" ? "Criar nova senha" : modal === "missed-workout"
              ? missedTitle
              : modal === "automatic-kit"
                ? "Kit Médico usado automaticamente"
                : modal === "training-plan"
                  ? "Configurar plano de treino"
                  : modal === "plan-ready"
                    ? capiboraMessage("plan-ready").title
                    : modal === "workout-review"
                      ? "Como foi o treino?"
                      : modal === "missions"
                        ? "Missões da semana"
                        : modal === "protection"
                          ? "Sua ofensiva ainda precisa de cuidado"
                          : modal === "kit"
                            ? "Kit Médico"
                            : modal === "notification-opt-in"
                              ? "Quer receber notificações?"
                              : modal === "group-notify"
                                ? "Avisar o time?"
                                : modal === "auth"
                                  ? "Sua conta Capibora"
                                  : modal === "share"
                                    ? "Sua conquista em destaque"
                                    : modal === "workout"
                                      ? "Confirmar treino"
                                      : modal === "rest"
                                        ? "Descansar hoje?"
                                        : "Meu peso"
          }
          wide={modal === "share"}
          dismissible={
            modal !== "workout" &&
            modal !== "workout-review" &&
            modal !== "training-plan" &&
            modal !== "missed-workout"
          }
          closeDisabled={
            (modal === "password-recovery" && recoveryBusy) ||
            ((modal === "workout" || modal === "workout-review") &&
              workoutBusy) ||
            (modal === "training-plan" && (planBusy || training.busy)) ||
            (modal === "missed-workout" && missedBusy)
          }
          centered={
            modal === "workout" ||
            modal === "training-plan" ||
            modal === "plan-ready" ||
            modal === "missed-workout"
          }
          minimal={modal === "workout" || modal === "training-plan" || (modal === "missed-workout" && (missedTitle === "Não treinei hoje" || missedTitle === "Aceitar a derrota"))}
          compactHeader={
            modal === "notification-opt-in" ||
            modal === "missions" ||
            modal === "automatic-kit" ||
            modal === "plan-ready" ||
            modal === "missed-workout"
          }
          onClose={() => {
            if (modal === "password-recovery") account.dismissPasswordRecovery();
            if (modal === "missed-workout") setMissedDay(null);
            if (modal === "plan-ready") navigate("overview");
            if (modal === "automatic-kit") {
              dismissAutomaticKits();
              return;
            }
            if (modal === "group-notify") setNewWorkoutDay(null);
            if (modal === "protection") homeProtection.dismiss();
            if (modal === "notification-opt-in")
              notificationOnboarding.dismiss();
            if (modal === "workout-review") setReviewWorkout(null);
            setModal(null);
          }}
        >
          {modal === "password-recovery" ? (
            <PasswordRecovery onSave={account.updatePassword} onBusyChange={setRecoveryBusy}
              onSaved={() => { account.dismissPasswordRecovery(); setModal(null); setToast("Senha atualizada"); }} />
          ) : modal === "missed-workout" && missedDay ? (
            <MissedWorkout
              key={missedDay}
              day={missedDay}
              eligible={missedAvailable && today === missedDay}
              training={training}
              economy={economy}
              workouts={workouts}
              onRefresh={async () => {
                const results = await Promise.all([
                  training.refresh(),
                  economy.refresh(),
                  social.refresh(),
                  workoutSession.refresh(),
                ]);
                return results.every(Boolean);
              }}
              onUseKit={() =>
                missedAvailable && today === missedDay
                  ? economy.useKit(missedDay)
                  : Promise.resolve(false)
              }
              onBusyChange={setMissedBusy}
              onClose={() => setModal(null)}
              onShop={() => navigate("shop", { section: "kits" })}
              onTitleChange={setMissedTitle}
              onAcknowledge={() => setModal(null)}
            />
          ) : modal === "automatic-kit" ? (
            <AutomaticKitNotice notices={automaticKitNotices} onDone={dismissAutomaticKits} />
          ) : modal === "plan-ready" ? (
            <div className="first-plan-celebration">
              <CapiboraMessage
                message={capiboraMessage("plan-ready")}
                showTitle={false}
                variant="centered"
                size={148}
              />
              <button
                className="primary-button"
                onClick={() => {
                  setModal(null);
                  navigate("overview");
                }}
              >
                Continuar
              </button>
            </div>
          ) : modal === "training-plan" ? (
            <TrainingScheduleSettings
              initialSetup
              training={training}
              onBusyChange={setPlanBusy}
              onLogin={() => setModal("auth")}
              onSaved={(firstPlan) => setModal(firstPlan ? "plan-ready" : null)}
            />
          ) : modal === "workout-review" && reviewWorkout ? (
            <OptionalWorkoutReview
              closeOnly
              onBusyChange={setWorkoutBusy}
              userId={account.user?.id}
              workout={reviewWorkout}
              onDone={() => setModal(null)}
              onSaved={(w) => {
                setData((prev) => ({
                  ...prev,
                  workouts: prev.workouts.map((existing) =>
                    existing.id === w.id ? w : existing,
                  ),
                }));
                setModal(null);
              }}
            />
          ) : modal === "workout" ? (
            <WorkoutRegistration
              closeOnly
              onBusyChange={setWorkoutBusy}
              onCancel={() => setModal(null)}
              userId={account.user?.id}
              controller={workoutSession}
              today={today}
              draft={pendingWorkout}
              onStarted={() => {
                setModal(null);
                navigate("session");
              }}
              onResume={() => {
                setModal(null);
                navigate("session");
              }}
              onConfirmed={(w) => completeWorkout(w)}
              onQueued={(w) => {
                if (
                  !account.user ||
                  accountStorageGeneration(account.user.id) !==
                    storageGeneration
                )
                  return;
                setData((prev) =>
                  prev.workouts.some(
                    (entry) => entry.date === w.date && entry.confirmedAt,
                  )
                    ? prev
                    : {
                        ...prev,
                        workouts: [
                          ...prev.workouts.filter(
                            (entry) => entry.date !== w.date,
                          ),
                          w,
                        ],
                      },
                );
                setModal(null);
                setToast(
                  "Treino guardado neste aparelho. Conecte-se ainda hoje para confirmar",
                );
              }}
            />
          ) : modal === "missions" ? (
            <MissionPanel game={game} />
          ) : modal === "protection" ? (
            <div className="home-protection-prompt">
              <p>
                Seu treino ainda está pendente. O dia termina às{" "}
                <strong>00:00</strong>
              </p>
              <p className="field-hint">
                Uma proteção mantém a ofensiva, sem somar pontos
              </p>
              <div className="home-protection-options">
                {canProtectToday &&
                  economy.state &&
                  economy.state.kits > 0 &&
                  economy.state.kitEligibility?.allowed !== false &&
                  kitUsesAvailable !== 0 && (
                    <button
                      className="primary-button"
                      onClick={() => {
                        homeProtection.dismiss();
                        setModal("kit");
                      }}
                    >
                      <MedicalKitIcon /> Usar Kit Médico
                    </button>
                  )}
                {canProtectToday && extraAvailable > 0 && (
                  <button
                    className="outline-button"
                    onClick={() => {
                      homeProtection.dismiss();
                      setModal("rest");
                    }}
                  >
                    <Moon size={19} /> Descansar hoje
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() => {
                    homeProtection.dismiss();
                    setModal(null);
                  }}
                >
                  Agora não
                </button>
              </div>
            </div>
          ) : modal === "kit" ? (
            economy.state ? (
              <MedicalKitConfirmation
                state={economy.state}
                today={today}
                canProtect={canProtectToday}
                busy={economy.busy || training.busy}
                error={economy.error}
                onConfirm={protectToday}
                onCancel={() => setModal(null)}
              />
            ) : (
              <p role="status">Atualizando seus kits…</p>
            )
          ) : modal === "notification-opt-in" ? (
            <NotificationOptIn
              onEnable={async () => {
                await notificationOnboarding.enable();
                setToast("Notificações ativadas");
              }}
              onDecline={async () => {
                await notificationOnboarding.decline();
                setData((prev) => ({
                  ...prev,
                  reminders: prev.reminders.map((r) => ({
                    ...r,
                    enabled: false,
                  })),
                }));
              }}
              onDismiss={() => {
                notificationOnboarding.dismiss();
                setModal(null);
              }}
            />
          ) : modal === "group-notify" ? (
            <GroupWorkoutPrompt
              groups={notifyGroups}
              workoutId={notifyWorkout?.id}
              nickname={profile?.nickname ?? "Alguém do time"}
              onSync={async () => {
                await social.refresh();
              }}
              onSkip={() => {
                setNewWorkoutDay(null);
                setModal(null);
              }}
              onSent={(message) => {
                setNewWorkoutDay(null);
                setModal(null);
                setToast(message);
              }}
            />
          ) : modal === "auth" ? (
            <ProfilePanel
              initialTab="account"
              profile={profile}
              account={account}
              onSaveLocal={(profile) =>
                setData((prev) => ({ ...prev, profile }))
              }
              onSaved={(message) => {
                setModal(null);
                setToast(message);
              }}
              onRegistrationCompleted={() => notificationOnboarding.request()}
            />
          ) : modal === "share" ? (
            <SharePanel
              profile={profile}
              days={currentStreak}
              date={today}
              styleId={shareStyle}
              frameId={frameId}
            />
          ) : modal === "rest" ? (
            <div className="rest-confirmation">
              <Moon size={36} />
              <p>A chama fica protegida hoje, sem somar pontos</p>
              <p className="field-hint">
                {training.state
                  ? extraRestsRemaining(training.state, today)
                  : 0}{" "}
                descansos extras disponíveis nesta semana
              </p>
              {training.error && (
                <p className="form-error" role="alert">
                  {training.error}
                </p>
              )}
              <button
                className="primary-button"
                disabled={training.busy}
                onClick={async () => {
                  if (await training.rest()) {
                    setModal(null);
                    setToast(
                      "Descanso autorizado. Sua ofensiva está protegida",
                    );
                  }
                }}
              >
                {training.busy ? "Confirmando…" : "Autorizar descanso"}
              </button>
            </div>
          ) : (
            <EntryForm
              kind="weight"
              today={today}
              data={data}
              onSave={(_next, weight) => {
                // Recheck against the latest state, including fast repeated submissions.
                if (weight) {
                  if (
                    !account.user ||
                    accountStorageGeneration(account.user.id) !==
                      storageGeneration
                  ) {
                    setModal("auth");
                    return;
                  }
                  weightSync.save(weight.date, weight.kg);
                }
                setModal(null);
              }}
            />
          )}
        </Modal>
      )}
      {account.user && social.state?.tauntNotices && (
        <ArenaInbox
          key={account.user.id}
          userId={account.user.id}
          blocked={Boolean(modal)}
        />
      )}
    </div>
  );
}

function WeightChart({ weights }: { weights: Data["weights"] }) {
  if (!weights.length)
    return (
      <div className="chart-empty">
        <div className="chart-grid" />
        <span className="empty-chart-icon">
          <BodyScale size={23} />
        </span>
        <strong>Seu gráfico começa aqui</strong>
        <p>Registre seu primeiro peso.</p>
      </div>
    );
  const min = Math.min(...weights.map((w) => w.kg)) - 0.5;
  const max = Math.max(...weights.map((w) => w.kg)) + 0.5;
  const points = weights.map((w, i) => [
    weights.length === 1 ? 310 : 55 + (i / (weights.length - 1)) * 510,
    150 - ((w.kg - min) / (max - min)) * 125,
  ]);
  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <div className="weight-chart">
      <svg
        viewBox="0 0 600 200"
        role="img"
        aria-label={`Evolução de peso: ${weights.length} registros, de ${formatKg(weights[0].kg)} a ${formatKg(weights.at(-1)!.kg)} quilos. Valores detalhados em Ver registros de peso.`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f16b28" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f16b28" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="50"
              x2="575"
              y1={25 + i * 42}
              y2={25 + i * 42}
              stroke="var(--border)"
              strokeDasharray="3 4"
            />
            <text x="4" y={29 + i * 42} fill="var(--muted)" fontSize="11">
              {formatKg(max - ((max - min) / 3) * i)}
            </text>
          </g>
        ))}
        <polygon
          points={`${points[0][0]},160 ${line} ${points.at(-1)![0]},160`}
          fill="url(#chart-fill)"
        />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent-text)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {points.map(([x, y], i) => (
          <circle
            key={weights[i].id ?? weights[i].date}
            cx={x}
            cy={y}
            r="4"
            fill="var(--accent-text)"
            stroke="var(--surface)"
            strokeWidth="2"
          >
            <title>
              {formatDay(weights[i].date)}: {formatKg(weights[i].kg)} kg
            </title>
          </circle>
        ))}
        <text x="55" y="189" fill="var(--muted)" fontSize="11">
          {formatDay(weights[0].date)}
        </text>
        {weights.length > 1 && (
          <text
            x="565"
            y="189"
            textAnchor="end"
            fill="var(--muted)"
            fontSize="11"
          >
            {formatDay(weights.at(-1)!.date)}
          </text>
        )}
      </svg>
    </div>
  );
}

function EntryForm({
  today,
  data,
  onSave,
}: {
  kind: "weight";
  today: string;
  data: Data;
  onSave: (next: Data, weight?: Weight) => void;
}) {
  const [date, setDate] = useState(today),
    [value, setValue] = useState(""),
    [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!validDate(date) || date > today || date < "2000-01-01") {
      setError("Escolha uma data válida entre 01/01/2000 e hoje.");
      return;
    }
    const amount = Number(value.replace(",", "."));
    if (
      !value.trim() ||
      !Number.isFinite(amount) ||
      amount < 20 ||
      amount > 500 ||
      Math.abs(amount * 10 - Math.round(amount * 10)) > 0.00001
    ) {
      setError("Informe um peso entre 20 e 500 kg, com até uma casa decimal.");
      return;
    }
    try {
      onSave(
        { ...data, weights: [...data.weights, { date, kg: amount }] },
        { date, kg: amount },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form onSubmit={submit}>
      <p className="modal-description">
        O peso não poderá ser editado depois de salvar
      </p>
      <label className="form-label">
        Data
        <input
          type="date"
          min="2000-01-01"
          max={today}
          required
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label className="form-label">
        Peso (kg)
        <input
          type="text"
          inputMode="decimal"
          placeholder="Ex.: 72,5"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="primary-button form-submit" type="submit">
        <Check size={18} />
        Salvar peso
      </button>
    </form>
  );
}
