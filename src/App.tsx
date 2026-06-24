import { useCallback, useEffect, useState } from "react";
import { ThreeScene } from "./render/three/ThreeScene";
import type { SceneTarget } from "./render/three/SceneTargets";
import { Dashboard } from "./ui/Dashboard";
import { Hud } from "./ui/Hud";
import { InteractionPanel } from "./ui/InteractionPanel";
import { useGame } from "./hooks/useGame";

export function App() {
  const { state, sendCommand, advanceWorld, save, reload, restart } = useGame();
  const [target, setTarget] = useState<SceneTarget | null>(null);
  const [entered, setEntered] = useState(false);

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

  return (
    <main className="game-shell">
      <ThreeScene state={state} onTargetChange={setTarget} />
      <div className="world-vignette" aria-hidden="true" />
      <Hud state={state} />
      <div className="crosshair" aria-hidden="true" />
      {!entered && (
        <div className="entry-overlay">
          <button className="entry-button" onClick={handleEnterDistrict} type="button">
            Enter District
          </button>
        </div>
      )}
      <Dashboard state={state} />
      <InteractionPanel state={state} target={target} onCommand={sendCommand} onSave={save} onReload={reload} onRestart={handleRestart} />
    </main>
  );
}
