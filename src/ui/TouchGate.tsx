import React, { useState } from "react";

// The game is keyboard + mouse only (movement via WASD, look via pointer lock).
// On a touch-only device it renders a world the player physically cannot control,
// which reads as broken rather than desktop-only. Detect a coarse-only pointer and
// show a dismissible gate so the first impression is honest.
export function TouchGate(): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(false);
  const [isTouchOnly] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return false;
    }
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    return coarse && !fine;
  });

  if (!isTouchOnly || dismissed) {
    return null;
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Desktop recommended" style={styles.overlay}>
      <div style={styles.card}>
        <div style={styles.badge}>Best on desktop</div>
        <h1 style={styles.title}>This build needs a keyboard &amp; mouse.</h1>
        <p style={styles.body}>
          Vendetta Vending is a first-person sim — you drive and walk with WASD and look with the
          mouse. Touch controls aren&apos;t in yet, so a phone or tablet can&apos;t steer the route.
          Jump on a laptop or desktop for the full experience.
        </p>
        <button type="button" onClick={() => setDismissed(true)} style={styles.button} autoFocus>
          Continue anyway
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "radial-gradient(1000px 500px at 30% -10%, rgba(244,183,62,.10), transparent 60%), rgba(11,14,18,.94)",
    color: "#d6dee7",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    zIndex: 99999
  },
  card: {
    maxWidth: "420px",
    width: "100%",
    background: "linear-gradient(180deg,#141a21,#0e1218)",
    border: "1px solid #242e39",
    borderRadius: "16px",
    padding: "26px",
    boxShadow: "0 20px 60px -20px rgba(0,0,0,.7)"
  },
  badge: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#f4b73e",
    marginBottom: "12px"
  },
  title: { fontSize: "21px", fontWeight: 800, margin: "0 0 10px", color: "#f2f6fa", letterSpacing: "-0.01em" },
  body: { fontSize: "14px", lineHeight: 1.55, margin: "0 0 20px", color: "#93a1af" },
  button: {
    appearance: "none",
    border: "1px solid #3a444f",
    background: "#1c242d",
    color: "#e7edf3",
    fontWeight: 700,
    fontSize: "14px",
    padding: "11px 18px",
    borderRadius: "10px",
    cursor: "pointer"
  }
};
