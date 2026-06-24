import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThreeScene } from "./render/three/ThreeScene";
import type { SceneTarget } from "./render/three/SceneTargets";
import { Dashboard } from "./ui/Dashboard";
import { Hud } from "./ui/Hud";
import { InteractionPanel } from "./ui/InteractionPanel";
import { Minimap } from "./ui/Minimap";
import { MissionTracker } from "./ui/MissionTracker";
import { GuidanceArrow } from "./ui/GuidanceArrow";
import { getStarterMissionStep } from "./game/core/mission";
import { selectedRouteTask } from "./game/core/selectors";
import { executePrimaryInteraction, getPrimaryInteraction } from "./ui/interactionActions";
import { useGame } from "./hooks/useGame";
import { ToastStack, type ToastMessage } from "./ui/ToastStack";
import type { Vec2 } from "./game/core/types";

export function App() {
  const { state, sendCommand, advanceWorld, save, reload, restart } = useGame();
  const [target, setTarget] = useState<SceneTarget | null>(null);
  const [entered, setEntered] = useState(false);
  const [playerPosition, setPlayerPosition] = useState<Vec2>({ x: -8, z: 1.4 });
  const [playerHeadingDegrees, setPlayerHeadingDegrees] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const lastEventIdRef = useRef(state.eventLog[0]?.id ?? null);
  const lastMissionStepIdRef = useRef<string | null>(null);
  const activeTarget = entered ? target : null;
  const primaryInteraction = useMemo(() => getPrimaryInteraction(state, activeTarget), [activeTarget, state]);
  const missionStep = useMemo(() => getStarterMissionStep(state, playerPosition), [playerPosition, state]);
  const routeTask = useMemo(() => selectedRouteTask(state), [state]);
  const guidanceLocationId = routeTask?.locationId ?? missionStep.targetLocationId;

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
      title: "Street update",
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

  const handleRestart = useCallback(() => {
    if (window.confirm("Restart this local MVP save?")) {
      restart();
    }
  }, [restart]);

  const handleEnterDistrict = useCallback(() => {
    setEntered(true);
  }, []);

  const handlePrimaryInteraction = useCallback(() => {
    executePrimaryInteraction(primaryInteraction, {
      onCommand: sendCommand,
      onSave: save
    });
  }, [primaryInteraction, save, sendCommand]);

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
        state={state}
        onPlayerPositionChange={setPlayerPosition}
        onPlayerHeadingChange={setPlayerHeadingDegrees}
        onTargetChange={setTarget}
      />
      <div className="world-vignette" aria-hidden="true" />
      <Hud state={state} />
      <MissionTracker state={state} playerPosition={playerPosition} />
      <div className="crosshair" aria-hidden="true" />
      {entered && <GuidanceArrow label={routeTask?.title} state={state} targetLocationId={guidanceLocationId} playerHeadingDegrees={playerHeadingDegrees} playerPosition={playerPosition} />}
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
      <InteractionPanel state={state} target={activeTarget} onCommand={sendCommand} onSave={save} onReload={reload} onRestart={handleRestart} />
      <ToastStack messages={toasts} />
    </main>
  );
}
