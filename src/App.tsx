import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ThreeScene } from "./render/three/ThreeScene";
import type { SceneFeedbackEvent, SceneTarget } from "./render/three/SceneTargets";
import { Dashboard } from "./ui/Dashboard";
import { Hud } from "./ui/Hud";
import { InteractionPanel } from "./ui/InteractionPanel";
import { Minimap } from "./ui/Minimap";
import { MissionTracker } from "./ui/MissionTracker";
import { GuidanceArrow } from "./ui/GuidanceArrow";
import { AdminMapEditor } from "./ui/AdminMapEditor";
import { getStarterMissionStep } from "./game/core/mission";
import { activeMachineAlarms, latestDayReport, selectedRouteTask } from "./game/core/selectors";
import { executePrimaryInteraction, getPrimaryInteraction } from "./ui/interactionActions";
import { useGame } from "./hooks/useGame";
import { ToastStack, type ToastMessage } from "./ui/ToastStack";
import type { DayReport, GameCommand, GameState, LocationId, Vec2 } from "./game/core/types";
import type { WorldMapLayout } from "./game/content/world";
import { clearWorldMapLayout, loadWorldMapLayout, saveWorldMapLayout } from "./game/world/mapLayoutStorage";
import { clearStoredGameSession, loadRemoteGame, loadRemoteMapLayout, loadStoredGameSession, loginGame, type GameSession } from "./game/save/api";
import { loadGame } from "./game/save/storage";

function targetLocationId(target: SceneTarget | null, state: GameState): LocationId | null {
  if (!target) {
    return null;
  }

  if (target.type === "machine") {
    return state.machines[target.id]?.locationId ?? null;
  }

  return target.id;
}

function createSceneFeedback(command: GameCommand, target: SceneTarget | null, state: GameState): Omit<SceneFeedbackEvent, "id"> | null {
  if (command.actorId !== state.playerFactionId) {
    return null;
  }

  switch (command.type) {
    case "buy_product":
      return { kind: "pickup", locationId: "supplier", productId: command.productId, amount: command.quantity, tone: "good" };
    case "deposit_crate":
      return {
        kind: "store",
        locationId: "garage",
        productId: state.player.carriedCrate?.productId,
        amount: state.player.carriedCrate?.quantity,
        tone: "good"
      };
    case "load_crate":
      return { kind: "pickup", locationId: "garage", productId: command.productId, amount: command.quantity, tone: "good" };
    case "load_vehicle":
      return { kind: "vehicle", locationId: "garage", productId: command.productId, amount: command.quantity, tone: "good" };
    case "unload_vehicle":
      return { kind: "store", locationId: "garage", productId: command.productId, amount: command.quantity, tone: "good" };
    case "take_vehicle_crate": {
      const vehicle = state.vehicles[command.vehicleId];
      return { kind: "pickup", locationId: vehicle?.locationId, productId: command.productId, amount: command.quantity, tone: "good" };
    }
    case "stock_machine":
      return { kind: "stock", machineId: command.machineId, productId: command.productId, amount: command.quantity, tone: "good" };
    case "collect_revenue":
      return { kind: "cash", machineId: command.machineId, amount: Math.round(state.machines[command.machineId]?.revenueStored ?? 0), tone: "good" };
    case "repair_machine":
      return { kind: "repair", machineId: command.machineId, tone: "good" };
    case "place_machine":
      return { kind: "install", locationId: command.locationId, tone: "good" };
    case "install_upgrade":
      return { kind: "upgrade", machineId: command.machineId, tone: "good" };
    case "sabotage_machine":
      return { kind: "sabotage", machineId: command.machineId, tone: "danger" };
    case "confront_alarm": {
      const alarm = state.machineAlarms[command.alarmId];
      return alarm ? { kind: "fight", machineId: alarm.machineId, tone: "good" } : null;
    }
    case "scout_district": {
      const locationId = targetLocationId(target, state) ?? Object.values(state.locations).find((location) => location.districtId === command.districtId)?.id ?? undefined;
      return { kind: "scout", locationId, tone: "neutral" };
    }
    case "unlock_district": {
      const locationId = targetLocationId(target, state) ?? Object.values(state.locations).find((location) => location.districtId === command.districtId)?.id ?? undefined;
      return { kind: "district", locationId, tone: "good" };
    }
    case "debug_set_district_access": {
      const locationId = Object.values(state.locations).find((location) => location.districtId === command.districtId)?.id;
      return { kind: command.access === "unlocked" ? "district" : "scout", locationId, tone: command.access === "unlocked" ? "good" : "neutral" };
    }
    case "debug_grant_cash":
      return { kind: "cash", locationId: state.player.currentLocationId ?? "garage", amount: command.amount, tone: "good" };
    case "debug_complete_requirements":
      return { kind: "upgrade", locationId: "garage", tone: "good" };
    case "debug_set_rival_pressure":
      return { kind: "sabotage", locationId: command.locationId, tone: command.amount >= 0.5 ? "warning" : "neutral" };
    case "debug_spawn_activity":
      return { kind: "scout", locationId: state.player.currentLocationId ?? "laundromat", tone: "neutral" };
    default:
      return null;
  }
}

function DayReportModal({ report, onClose }: { report: DayReport; onClose: () => void }) {
  return (
    <aside className="day-report-modal" aria-label={`Day ${report.day} report`}>
      <div>
        <span>Day {report.day} report</span>
        <button aria-label="Close day report" onClick={onClose} type="button">
          Close
        </button>
      </div>
      <h2>{report.summary}</h2>
      <dl>
        <div>
          <dt>Cash collected</dt>
          <dd>${Math.round(report.revenueCollected)}</dd>
        </div>
        <div>
          <dt>Stored revenue</dt>
          <dd>${Math.round(report.machineRevenueStored)}</dd>
        </div>
        <div>
          <dt>Contracts</dt>
          <dd>
            {report.contractsCompleted} done / {report.contractsFailed} missed
          </dd>
        </div>
        <div>
          <dt>Stock sold</dt>
          <dd>{report.stockSold}</dd>
        </div>
        <div>
          <dt>Rival moves</dt>
          <dd>{report.rivalActions}</dd>
        </div>
      </dl>
    </aside>
  );
}

interface GameAppProps {
  initialState: GameState;
  mapLayout: WorldMapLayout;
  session: GameSession;
}

function GameApp({ initialState, mapLayout, session }: GameAppProps) {
  const { state, sendCommand, advanceWorld, save, reload, restart } = useGame({ initialState, session });
  const [target, setTarget] = useState<SceneTarget | null>(null);
  const [entered, setEntered] = useState(false);
  const [playerPosition, setPlayerPosition] = useState<Vec2>({ x: -9, z: 5.9 });
  const [playerHeadingDegrees, setPlayerHeadingDegrees] = useState(-180);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [visibleReport, setVisibleReport] = useState<DayReport | null>(null);
  const [sceneFeedback, setSceneFeedback] = useState<SceneFeedbackEvent | null>(null);
  const lastEventIdRef = useRef(state.eventLog[0]?.id ?? null);
  const lastMissionStepIdRef = useRef<string | null>(null);
  const lastServiceLocationIdRef = useRef<LocationId | null>(state.player.currentLocationId);
  const lastReportIdRef = useRef<string | null>(null);
  const activeTarget = entered ? target : null;
  const primaryInteraction = useMemo(() => getPrimaryInteraction(state, activeTarget), [activeTarget, state]);
  const missionStep = useMemo(() => getStarterMissionStep(state, playerPosition), [playerPosition, state]);
  const routeTask = useMemo(() => selectedRouteTask(state), [state]);
  const activeAlarm = useMemo(() => activeMachineAlarms(state)[0], [state]);
  const guidanceLocationId = activeAlarm?.locationId ?? routeTask?.locationId ?? missionStep.targetLocationId;
  const guidanceLabel = activeAlarm ? "Machine alarm" : routeTask?.title;
  const report = latestDayReport(state);

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [{ ...toast, id }, ...current].slice(0, 4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((message) => message.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      advanceWorld(0.12);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [advanceWorld]);

  useEffect(() => {
    const newestEvent = state.eventLog[0];
    if (!newestEvent || newestEvent.id === lastEventIdRef.current) {
      return;
    }

    lastEventIdRef.current = newestEvent.id;
    addToast({
      title: newestEvent.message.startsWith("ALARM") ? "Machine alarm" : newestEvent.message.startsWith("Alarm missed") ? "Alarm missed" : "Street update",
      message: newestEvent.message,
      tone: newestEvent.tone
    });
  }, [addToast, state.eventLog]);

  useEffect(() => {
    if (!lastMissionStepIdRef.current) {
      lastMissionStepIdRef.current = missionStep.id;
      return;
    }

    if (missionStep.id === lastMissionStepIdRef.current) {
      return;
    }

    lastMissionStepIdRef.current = missionStep.id;
    addToast({
      title: "Objective updated",
      message: missionStep.objective,
      tone: missionStep.id === "completed" ? "good" : "neutral"
    });
  }, [addToast, missionStep.id, missionStep.objective]);

  useEffect(() => {
    const nextLocationId = entered ? targetLocationId(target, state) : null;
    if (nextLocationId === lastServiceLocationIdRef.current) {
      return;
    }

    lastServiceLocationIdRef.current = nextLocationId;
    sendCommand({ type: "set_player_location", actorId: state.playerFactionId, locationId: nextLocationId });
  }, [entered, sendCommand, state, target]);

  useEffect(() => {
    if (!report || report.id === lastReportIdRef.current) {
      return;
    }

    lastReportIdRef.current = report.id;
    setVisibleReport(report);
    addToast({
      title: `Day ${report.day} report`,
      message: report.summary,
      tone: report.contractsFailed > 0 ? "warning" : "good"
    });
  }, [addToast, report]);

  const handleRestart = useCallback(() => {
    if (window.confirm("Restart this local MVP save?")) {
      restart();
    }
  }, [restart]);

  const handleEnterDistrict = useCallback(() => {
    setEntered(true);
  }, []);

  const sendCommandAtActiveTarget = useCallback(
    (command: GameCommand) => {
      const nextLocationId = targetLocationId(activeTarget, state);
      if (nextLocationId !== lastServiceLocationIdRef.current) {
        lastServiceLocationIdRef.current = nextLocationId;
        sendCommand({ type: "set_player_location", actorId: state.playerFactionId, locationId: nextLocationId });
      }

      const feedback = createSceneFeedback(command, activeTarget, state);
      if (feedback) {
        setSceneFeedback({
          ...feedback,
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`
        });
      }
      sendCommand(command);
    },
    [activeTarget, sendCommand, state]
  );

  const handlePrimaryInteraction = useCallback(() => {
    executePrimaryInteraction(primaryInteraction, {
      onCommand: sendCommandAtActiveTarget,
      onSave: save
    });
  }, [primaryInteraction, save, sendCommandAtActiveTarget]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyE" || event.repeat || !entered) {
        return;
      }

      event.preventDefault();
      handlePrimaryInteraction();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entered, handlePrimaryInteraction]);

  return (
    <main className="game-shell">
      <ThreeScene
        guidanceLocationId={guidanceLocationId}
        mapLayout={mapLayout}
        state={state}
        feedbackEvent={sceneFeedback}
        onPlayerPositionChange={setPlayerPosition}
        onPlayerHeadingChange={setPlayerHeadingDegrees}
        onTargetChange={setTarget}
      />
      <div className="world-vignette" aria-hidden="true" />
      <Hud state={state} />
      <MissionTracker state={state} playerPosition={playerPosition} />
      <div className="crosshair" aria-hidden="true" />
      {entered && <GuidanceArrow label={guidanceLabel} state={state} targetLocationId={guidanceLocationId} playerHeadingDegrees={playerHeadingDegrees} playerPosition={playerPosition} />}
      {entered && activeTarget && primaryInteraction && (
        <div className={`target-prompt ${primaryInteraction.disabled ? "disabled" : ""}`}>
          <span className="target-name">{activeTarget.label}</span>
          <span className="target-action">
            <kbd>E</kbd>
            {primaryInteraction.label}
          </span>
        </div>
      )}
      {!entered && (
        <div className="entry-overlay">
          <button className="entry-button" onClick={handleEnterDistrict} type="button">
            Enter District
          </button>
        </div>
      )}
      <Dashboard state={state} onCommand={sendCommand} />
      <Minimap state={state} playerPosition={playerPosition} guidanceLocationId={guidanceLocationId} target={activeTarget} />
      <InteractionPanel state={state} target={activeTarget} onCommand={sendCommandAtActiveTarget} onSave={save} onReload={reload} onRestart={handleRestart} />
      {visibleReport && <DayReportModal report={visibleReport} onClose={() => setVisibleReport(null)} />}
      <ToastStack messages={toasts} />
    </main>
  );
}

function GameAccessGate({ mapLayout }: { mapLayout: WorldMapLayout }) {
  const [authState, setAuthState] = useState<
    | { status: "loading" }
    | { status: "login"; message?: string }
    | { initialState: GameState; session: GameSession; status: "ready" }
  >({ status: "loading" });
  const [credentials, setCredentials] = useState({ name: "", pin: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const session = loadStoredGameSession();
    if (!session) {
      setAuthState({ status: "login" });
      return;
    }

    let cancelled = false;
    loadRemoteGame(session)
      .then((remote) => {
        if (cancelled) {
          return;
        }

        setAuthState({
          status: "ready",
          session,
          initialState: remote.save?.state ?? loadGame()
        });
      })
      .catch(() => {
        clearStoredGameSession();
        if (!cancelled) {
          setAuthState({ status: "login", message: "Session expired. Enter your name and PIN." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      loginGame(credentials.name, credentials.pin)
        .then((response) => {
          setAuthState({
            status: "ready",
            session: { profile: response.profile, token: response.token },
            initialState: response.save?.state ?? loadGame()
          });
        })
        .catch((error) => {
          setAuthState({ status: "login", message: error instanceof Error ? error.message : "Sign in failed." });
        })
        .finally(() => setSubmitting(false));
    },
    [credentials.name, credentials.pin]
  );

  if (authState.status === "ready") {
    return <GameApp key={authState.session.profile.id} initialState={authState.initialState} mapLayout={mapLayout} session={authState.session} />;
  }

  return (
    <main className="access-shell">
      <form className="access-panel" onSubmit={handleLogin}>
        <div>
          <h1>Vendetta Vending</h1>
          <span>{authState.status === "loading" ? "Loading protected save" : "Protected game save"}</span>
        </div>
        <label>
          Player name
          <input
            autoComplete="username"
            disabled={authState.status === "loading" || submitting}
            maxLength={36}
            value={credentials.name}
            onChange={(event) => setCredentials((current) => ({ ...current, name: event.target.value }))}
          />
        </label>
        <label>
          PIN
          <input
            autoComplete="current-password"
            disabled={authState.status === "loading" || submitting}
            inputMode="numeric"
            maxLength={12}
            type="password"
            value={credentials.pin}
            onChange={(event) => setCredentials((current) => ({ ...current, pin: event.target.value }))}
          />
        </label>
        {authState.status === "login" && authState.message && <p>{authState.message}</p>}
        <button disabled={authState.status === "loading" || submitting} type="submit">
          {submitting ? "Opening..." : "Open save"}
        </button>
      </form>
    </main>
  );
}

export function App() {
  const [mapLayout, setMapLayout] = useState<WorldMapLayout>(() => loadWorldMapLayout());
  const isAdminRoute = window.location.pathname === "/admin";

  useEffect(() => {
    let cancelled = false;
    loadRemoteMapLayout()
      .then((remote) => {
        if (!cancelled && remote.layout) {
          saveWorldMapLayout(remote.layout);
          setMapLayout(remote.layout);
        }
      })
      .catch(() => {
        // Local authored layout remains available if the API is unreachable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveMapLayout = useCallback((layout: WorldMapLayout) => {
    saveWorldMapLayout(layout);
    setMapLayout(loadWorldMapLayout());
  }, []);

  const handleResetMapLayout = useCallback(() => {
    clearWorldMapLayout();
    setMapLayout(loadWorldMapLayout());
  }, []);

  if (isAdminRoute) {
    return <AdminMapEditor initialLayout={mapLayout} onSave={handleSaveMapLayout} onReset={handleResetMapLayout} />;
  }

  return <GameAccessGate mapLayout={mapLayout} />;
}
