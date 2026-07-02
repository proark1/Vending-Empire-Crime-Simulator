import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { GameEventTone } from "../game/core/types";

export interface ToastMessage {
  id: string;
  message: string;
  tone: GameEventTone;
  title: string;
  leaving?: boolean;
}

function iconForTone(tone: GameEventTone) {
  if (tone === "good") {
    return <CheckCircle2 size={17} aria-hidden="true" />;
  }

  if (tone === "warning") {
    return <AlertTriangle size={17} aria-hidden="true" />;
  }

  if (tone === "danger") {
    return <XCircle size={17} aria-hidden="true" />;
  }

  return <Info size={17} aria-hidden="true" />;
}

interface ToastStackProps {
  docked?: boolean;
  messages: ToastMessage[];
}

export function ToastStack({ docked = false, messages }: ToastStackProps) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <section className={docked ? "toast-stack docked" : "toast-stack"} aria-label="Notifications" aria-live="polite" aria-atomic="false">
      {messages.map((message) => (
        <article
          className={`toast-message ${message.tone}${message.leaving ? " toast-leaving" : ""}`}
          key={message.id}
          role={message.tone === "danger" ? "alert" : "status"}
        >
          {iconForTone(message.tone)}
          <div>
            <strong>{message.title}</strong>
            <span>{message.message}</span>
          </div>
        </article>
      ))}
    </section>
  );
}
