import { CheckCircle2, Circle, ClipboardList } from "lucide-react";
import type { GameState, Vec2 } from "../game/core/types";
import { getStarterMissionStep, getStarterTutorialSteps } from "../game/core/mission";

interface MissionTrackerProps {
  state: GameState;
  playerPosition: Vec2;
}

export function MissionTracker({ state, playerPosition }: MissionTrackerProps) {
  const step = getStarterMissionStep(state, playerPosition);
  const tutorialSteps = getStarterTutorialSteps(state);
  const showTutorial = !state.mission.completed && tutorialSteps.some((tutorialStep) => !tutorialStep.completed);

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
      {showTutorial && (
        <ol className="tutorial-steps" aria-label="Starter tutorial">
          {tutorialSteps.map((tutorialStep) => (
            <li className={tutorialStep.active ? "active" : ""} data-complete={tutorialStep.completed} key={tutorialStep.id}>
              {tutorialStep.completed ? <CheckCircle2 size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
              <span>{tutorialStep.label}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
