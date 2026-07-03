import React from "react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Top-level safety net. The game runs a large reducer every world tick; without a
// boundary a single unhandled throw white-screens the whole app with no recovery.
// Here we catch it, keep the last autosave untouched (a reload restores from it),
// and offer the player a clear way back instead of a blank page.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Surface the crash for local debugging / server log capture.
    console.error("Game crashed and was caught by the ErrorBoundary:", error, info.componentStack);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  // Only surface the raw stack on local dev hosts — never leak internals to a
  // deployed player. (Avoids depending on Vite's import.meta.env typings.)
  private isLocalDev(): boolean {
    return typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  }

  render(): React.ReactNode {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div role="alert" style={styles.overlay}>
        <div style={styles.card}>
          <div style={styles.badge}>Route interrupted</div>
          <h1 style={styles.title}>Something glitched in the empire.</h1>
          <p style={styles.body}>
            The game hit an unexpected error and paused to keep your progress safe. Your last
            autosave is untouched — reload to drop back into the route.
          </p>
          <div style={styles.actions}>
            <button type="button" onClick={this.handleReload} style={styles.button} autoFocus>
              Reload the game
            </button>
          </div>
          {this.isLocalDev() ? (
            <pre style={styles.detail}>{String(this.state.error?.stack ?? this.state.error)}</pre>
          ) : null}
        </div>
      </div>
    );
  }
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "radial-gradient(1000px 500px at 70% -10%, rgba(62,224,196,.10), transparent 60%), #0b0e12",
    color: "#d6dee7",
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    zIndex: 100000
  },
  card: {
    maxWidth: "440px",
    width: "100%",
    background: "linear-gradient(180deg,#141a21,#0e1218)",
    border: "1px solid #242e39",
    borderRadius: "16px",
    padding: "28px",
    boxShadow: "0 20px 60px -20px rgba(0,0,0,.7)"
  },
  badge: {
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: "11px",
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "#f7863a",
    marginBottom: "12px"
  },
  title: { fontSize: "22px", fontWeight: 800, margin: "0 0 10px", color: "#f2f6fa", letterSpacing: "-0.01em" },
  body: { fontSize: "14px", lineHeight: 1.55, margin: "0 0 20px", color: "#93a1af" },
  actions: { display: "flex", gap: "10px" },
  button: {
    appearance: "none",
    border: "1px solid #0f5f54",
    background: "#3ee0c4",
    color: "#08211d",
    fontWeight: 700,
    fontSize: "14px",
    padding: "11px 18px",
    borderRadius: "10px",
    cursor: "pointer"
  },
  detail: {
    marginTop: "18px",
    padding: "12px",
    background: "#0b0e12",
    border: "1px solid #1c242d",
    borderRadius: "8px",
    fontSize: "11px",
    color: "#6b7986",
    maxHeight: "180px",
    overflow: "auto",
    whiteSpace: "pre-wrap"
  }
};
