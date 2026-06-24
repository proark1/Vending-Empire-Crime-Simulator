import { useCallback, useEffect, useMemo, useState } from "react";
import { ThreeScene } from "./render/three/ThreeScene";
import type { SceneTarget } from "./render/three/SceneTargets";
import { Dashboard } from "./ui/Dashboard";
import { Hud } from "./ui/Hud";
import { InteractionPanel } from "./ui/InteractionPanel";
import { Minimap } from "./ui/Minimap";
import { MissionTracker } from "./ui/MissionTracker";
import { executePrimaryInteraction, getPrimaryInteraction } from "./ui/interactionActions";
import { useGame } from "./hooks/useGame";
import type { Vec2 } from "./game/core/types";

export function App() {
  const { state, sendCommand, advanceWorld, save, reload, restart } = useGame();
  const [target, setTarget] = useState<SceneTarget | null>(null);
  const [entered, setEntered] = useState(false);
  const [playerPosition, setPlayerPosition] = useState<Vec2>({ x: -8, z: 1.4 });
  const primaryInteraction = useMemo(() => getPrimaryInteraction(state, target), [state, target]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      advanceWorld(0.12);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [advanceWorld]);

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
      <ThreeScene state={state} onPlayerPositionChange={setPlayerPosition} onTargetChange={setTarget} />
      <div className="world-vignette" aria-hidden="true" />
      <Hud state={state} />
      <MissionTracker state={state} />
      <div className="crosshair" aria-hidden="true" />
      {entered && target && primaryInteraction && (
        <div className={`target-prompt ${primaryInteraction.disabled ? "disabled" : ""}`}>
          <span className="target-name">{target.label}</span>
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
      <Dashboard state={state} />
      <Minimap state={state} playerPosition={playerPosition} target={target} />
      <InteractionPanel state={state} target={target} onCommand={sendCommand} onSave={save} onReload={reload} onRestart={handleRestart} />
    </main>
  );
}
