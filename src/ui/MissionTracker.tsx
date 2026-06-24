import { CheckCircle2, ClipboardList } from "lucide-react";
import type { GameState, Vec2 } from "../game/core/types";
import { getStarterMissionStep } from "../game/core/mission";

interface MissionTrackerProps {
  state: GameState;
  playerPosition: Vec2;
}

export function MissionTracker({ state, playerPosition }: MissionTrackerProps) {
  const step = getStarterMissionStep(state, playerPosition);

  return (
    <section className="mission-tracker" aria-label="Current mission">
      <div className="mission-title-row">
        {state.mission.completed ? <CheckCircle2 size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}
        <span>{step.title}</span>
      </div>
      <p>{step.objective}</p>
      <span className="mission-guidance">{step.guidance}</span>
      <div className="mission-progress" aria-hidden="true">
        <span style={{ width: `${step.progressRatio * 100}%` }} />
      </div>
      <span className="mission-progress-label">{step.progressLabel}</span>
    </section>
  );
}
