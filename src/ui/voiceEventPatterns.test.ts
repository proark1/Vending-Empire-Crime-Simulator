import { describe, expect, it } from "vitest";
import { VOICE_EVENT_PATTERNS, voiceTriggerForMessage } from "./voiceEventPatterns";
import { audioTriggerOptions } from "../game/content/audioConfig";

describe("voice event patterns", () => {
  const voiceTriggers = new Set(
    audioTriggerOptions.filter((option) => option.category === "voice").map((option) => option.trigger)
  );

  it("only maps to real, defined voice triggers", () => {
    for (const { trigger } of VOICE_EVENT_PATTERNS) {
      expect(voiceTriggers.has(trigger)).toBe(true);
    }
  });

  // Representative event-log messages mirroring the reducer's log() strings. If a
  // reducer wording change or a pattern edit breaks a bark, this fails — the whole
  // point of the guard (audio-2), since the coupling is text-based.
  const samples: Array<{ message: string; trigger: string }> = [
    { message: "Compliance inspection notice filed for your machine.", trigger: "voice.inspector_notice" },
    { message: "The permit lapsed into a challenge.", trigger: "voice.lawyer_notice" },
    { message: "You bought time with local paperwork.", trigger: "voice.fixer_tip" },
    { message: "The supplier market shifted overnight.", trigger: "voice.supplier_offer" },
    { message: "Storage rent was short by $8.", trigger: "voice.landlord_pressure" },
    { message: "Redline planted an expansion cell nearby.", trigger: "voice.rival_boss_threat" },
    { message: "A route ambush missed your van.", trigger: "voice.driver_warning" },
    { message: "A scout tipped off the inspectors.", trigger: "voice.informant_tip" },
    { message: "A guard joined the route crew.", trigger: "voice.guard_contact" },
    { message: "New hardware delivered to the garage.", trigger: "voice.mechanic_unlock" }
  ];

  it("resolves representative messages to their voice trigger", () => {
    for (const { message, trigger } of samples) {
      expect(voiceTriggerForMessage(message)).toBe(trigger);
    }
  });

  it("returns null for unrelated messages", () => {
    expect(voiceTriggerForMessage("You collected $40 from Rusty Starter.")).toBeNull();
  });
});
