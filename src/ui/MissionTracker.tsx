import { CheckCircle2, Circle, ClipboardList } from "lucide-react";
import type { GameState, Vec2 } from "../game/core/types";
import { getStarterMissionStep, getStarterTutorialSteps } from "../game/core/mission";
import { activeConflictEvents, activeMachineAlarms, playerHeatTier } from "../game/core/selectors";

interface MissionTrackerProps {
  compact?: boolean;
  state: GameState;
  playerPosition: Vec2;
}

export function MissionTracker({ compact = false, state, playerPosition }: MissionTrackerProps) {
  const step = getStarterMissionStep(state, playerPosition);
  const tutorialSteps = getStarterTutorialSteps(state);
  const showTutorial = !state.mission.completed && tutorialSteps.some((tutorialStep) => !tutorialStep.completed);
  const alarm = activeMachineAlarms(state)[0];
  const conflict = activeConflictEvents(state)[0];
  const heatTier = playerHeatTier(state);
  const pressureLine = alarm
    ? `Alarm: ${state.machines[alarm.machineId]?.name ?? "machine"} at ${state.locations[alarm.locationId]?.name ?? "route stop"}`
    : conflict
      ? `${conflict.kind.replace("_", " ")}: ${state.locations[conflict.locationId]?.name ?? "route stop"}`
      : heatTier.tone !== "good"
        ? `${heatTier.label}: ${heatTier.action}`
        : null;
  const pressureTone = alarm || conflict ? "danger" : heatTier.tone;

  return (
    <section className={compact ? "mission-tracker compact" : "mission-tracker"} aria-label="Current mission">
      <div className="mission-title-row">
        {state.mission.completed ? <CheckCircle2 size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}
        <span>{step.title}</span>
      </div>
      <p>{step.objective}</p>
      <span className="mission-guidance">{step.guidance}</span>
      {pressureLine && <span className={`mission-threat ${pressureTone}`}>{pressureLine}</span>}
      <div className="mission-progress" aria-hidden="true">
        <span style={{ width: `${step.progressRatio * 100}%` }} />
      </div>
      <span className="mission-progress-label">{step.progressLabel}</span>
      {showTutorial && !compact && (
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
