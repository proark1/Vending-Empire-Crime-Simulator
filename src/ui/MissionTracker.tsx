import { CheckCircle2, ChevronDown, ChevronUp, Circle, ClipboardList } from "lucide-react";
import { memo, useState } from "react";
import type { GameState, Vec2 } from "../game/core/types";
import { getStarterMissionStep, getStarterTutorialSteps } from "../game/core/mission";
import { activeConflictEvents, activeMachineAlarms, playerHeatTier } from "../game/core/selectors";
import { buildCurrentJob } from "./currentJob";

const EXPAND_KEY = "vv:mission-expanded";

function loadExpanded(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(EXPAND_KEY) === "1";
  } catch {
    return false;
  }
}

interface MissionTrackerProps {
  compact?: boolean;
  state: GameState;
  playerPosition: Vec2;
}

export const MissionTracker = memo(MissionTrackerInner);

function MissionTrackerInner({ compact = false, state, playerPosition }: MissionTrackerProps) {
  const [expanded, setExpanded] = useState(loadExpanded);
  const step = getStarterMissionStep(state, playerPosition);
  const currentJob = buildCurrentJob(state, playerPosition);
  const tutorialSteps = getStarterTutorialSteps(state);
  const showTutorial = !state.mission.completed && tutorialSteps.some((tutorialStep) => !tutorialStep.completed);
  const alarm = activeMachineAlarms(state)[0];
  const conflict = activeConflictEvents(state)[0];
  const heatTier = playerHeatTier(state);
  const alarmLocationName = alarm ? state.locations[alarm.locationId]?.name ?? "route stop" : null;
  const conflictLocationName = conflict ? state.locations[conflict.locationId]?.name ?? "route stop" : null;
  const pressureLine = alarm
    ? `Alarm: ${state.machines[alarm.machineId]?.name ?? "machine"} at ${alarmLocationName}`
    : conflict
      ? `${conflict.kind.replace("_", " ")}: ${conflictLocationName}`
      : heatTier.tone !== "good"
        ? `${heatTier.label}: ${heatTier.action}`
        : null;
  const pressureTone = alarm || conflict ? "danger" : heatTier.tone;
  const activeTitle = alarm ? "Answer machine alarm" : conflict ? "Handle street trouble" : currentJob.title;
  const activeGuidance = alarm
    ? `Follow the arrow to ${alarmLocationName} and face the machine.`
    : conflict
      ? `Follow the arrow to ${conflictLocationName} and choose a response.`
      : currentJob.guidance;

  // Collapsed by default to the current step + progress; the dashboard forces it
  // collapsed. The chevron reveals the objective, guidance, and full checklist.
  const collapsed = compact || !expanded;
  const toggleExpanded = () => {
    setExpanded((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(EXPAND_KEY, next ? "1" : "0");
      } catch {
        // ignore unavailable storage
      }
      return next;
    });
  };

  return (
    <section className={collapsed ? "mission-tracker compact" : "mission-tracker"} aria-label="Current mission">
      <div className="mission-title-row">
        {state.mission.completed ? <CheckCircle2 size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}
        <span className="mission-eyebrow">{pressureLine ? "Priority" : "Current job"}</span>
        <strong className="mission-step-title">{activeTitle}</strong>
        {!compact && (
          <button
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse objective details" : "Expand objective details"}
            className="mission-expand"
            onClick={toggleExpanded}
            title={expanded ? "Collapse objective details" : "Expand objective details"}
            type="button"
          >
            {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        )}
      </div>
      <div className="mission-progress" aria-hidden="true">
        <span style={{ width: `${step.progressRatio * 100}%` }} />
      </div>
      <span className="mission-progress-label">{step.progressLabel}</span>
      {collapsed && <span className="mission-guidance-summary">{activeGuidance}</span>}
      {pressureLine && <span className={`mission-threat ${pressureTone}`}>{pressureLine}</span>}
      {!collapsed && (
        <>
          <p>{step.objective}</p>
          <span className="mission-guidance">{activeGuidance}</span>
          {!pressureLine && (
            <div className="mission-stakes" aria-label="Current job stakes">
              <span>{currentJob.payoff}</span>
              <span className={currentJob.tone}>{currentJob.risk}</span>
            </div>
          )}
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
        </>
      )}
    </section>
  );
}
