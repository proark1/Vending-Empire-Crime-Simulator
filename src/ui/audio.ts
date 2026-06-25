import type { GameEventTone } from "../game/core/types";
import type { SceneFeedbackKind } from "../render/three/SceneTargets";

let audioContext: AudioContext | null = null;
let unlocked = false;
let ambienceGain: GainNode | null = null;
let ambienceOscillators: OscillatorNode[] = [];

function getContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  const AudioCtor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) {
    return null;
  }

  audioContext ??= new AudioCtor();
  return audioContext;
}

export function unlockGameAudio(): void {
  const context = getContext();
  if (!context) {
    return;
  }

  unlocked = true;
  if (context.state === "suspended") {
    void context.resume();
  }
}

function stopAmbience(): void {
  for (const oscillator of ambienceOscillators) {
    try {
      oscillator.stop();
    } catch {
      // Oscillator may already be stopped after a browser audio reset.
    }
  }
  ambienceOscillators = [];
  ambienceGain?.disconnect();
  ambienceGain = null;
}

export function startGameAmbience(): void {
  const context = getContext();
  if (!context || !unlocked || ambienceGain) {
    return;
  }

  ambienceGain = context.createGain();
  ambienceGain.gain.setValueAtTime(0.018, context.currentTime);
  ambienceGain.connect(context.destination);

  const lowDrone = context.createOscillator();
  lowDrone.type = "sine";
  lowDrone.frequency.setValueAtTime(54, context.currentTime);
  lowDrone.connect(ambienceGain);
  lowDrone.start();

  const fluorescentBuzz = context.createOscillator();
  fluorescentBuzz.type = "triangle";
  fluorescentBuzz.frequency.setValueAtTime(118, context.currentTime);
  fluorescentBuzz.connect(ambienceGain);
  fluorescentBuzz.start();

  ambienceOscillators = [lowDrone, fluorescentBuzz];
}

export function updateGameAmbience(heat: number, conflictActive: boolean): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  startGameAmbience();
  if (!ambienceGain) {
    return;
  }

  const targetGain = Math.min(0.055, 0.016 + heat * 0.0018 + (conflictActive ? 0.018 : 0));
  ambienceGain.gain.setTargetAtTime(targetGain, context.currentTime, 0.45);
  const [lowDrone, buzz] = ambienceOscillators;
  lowDrone?.frequency.setTargetAtTime(54 + Math.min(20, heat * 0.8), context.currentTime, 0.7);
  buzz?.frequency.setTargetAtTime(conflictActive ? 152 : 118, context.currentTime, 0.5);
}

function tone(frequency: number, start: number, duration: number, gain: number, type: OscillatorType = "sine"): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  const oscillator = context.createOscillator();
  const volume = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  volume.gain.setValueAtTime(0.0001, start);
  volume.gain.exponentialRampToValueAtTime(gain, start + 0.015);
  volume.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(volume);
  volume.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}

export function playFeedbackCue(kind: SceneFeedbackKind): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  const now = context.currentTime;
  if (kind === "cash") {
    tone(880, now, 0.08, 0.035, "triangle");
    tone(1320, now + 0.07, 0.09, 0.026, "triangle");
    return;
  }

  if (kind === "pickup" || kind === "store" || kind === "stock" || kind === "vehicle") {
    tone(160, now, 0.06, 0.035, "square");
    tone(220, now + 0.06, 0.08, 0.025, "square");
    return;
  }

  if (kind === "repair" || kind === "upgrade" || kind === "lockdown") {
    tone(420, now, 0.05, 0.03, "sawtooth");
    tone(620, now + 0.05, 0.05, 0.026, "sawtooth");
    tone(920, now + 0.1, 0.07, 0.022, "triangle");
    return;
  }

  if (kind === "sabotage" || kind === "fight" || kind === "melee") {
    tone(92, now, 0.12, 0.04, "sawtooth");
    tone(58, now + 0.08, 0.1, 0.035, "square");
    return;
  }

  if (kind === "escape") {
    tone(220, now, 0.06, 0.032, "sawtooth");
    tone(330, now + 0.055, 0.08, 0.026, "sawtooth");
    tone(520, now + 0.12, 0.1, 0.02, "triangle");
    return;
  }

  tone(520, now, 0.06, 0.026, "triangle");
  tone(780, now + 0.055, 0.08, 0.022, "triangle");
}

export function playEventCue(toneName: GameEventTone): void {
  const context = getContext();
  if (!context || !unlocked) {
    return;
  }

  const now = context.currentTime;
  if (toneName === "danger") {
    tone(120, now, 0.11, 0.042, "sawtooth");
    tone(90, now + 0.13, 0.12, 0.036, "sawtooth");
    return;
  }

  if (toneName === "warning") {
    tone(260, now, 0.08, 0.03, "triangle");
    tone(220, now + 0.09, 0.08, 0.024, "triangle");
    return;
  }

  if (toneName === "good") {
    tone(640, now, 0.07, 0.026, "triangle");
    tone(960, now + 0.07, 0.08, 0.02, "triangle");
  }
}
