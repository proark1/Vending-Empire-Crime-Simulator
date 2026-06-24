import type { GameCommand, GameEvent, GameState } from "./types";

export interface GameTransport {
  sendCommand(command: GameCommand): void;
  onEvent(handler: (event: GameEvent) => void): () => void;
  onSnapshot(handler: (snapshot: GameState) => void): () => void;
}

export class LocalTransport implements GameTransport {
  private eventHandlers = new Set<(event: GameEvent) => void>();
  private snapshotHandlers = new Set<(snapshot: GameState) => void>();
  private commandHandler: ((command: GameCommand) => void) | undefined;

  connect(commandHandler: (command: GameCommand) => void): void {
    this.commandHandler = commandHandler;
  }

  sendCommand(command: GameCommand): void {
    this.commandHandler?.(command);
  }

  emitEvents(events: GameEvent[]): void {
    for (const event of events) {
      for (const handler of this.eventHandlers) {
        handler(event);
      }
    }
  }

  emitSnapshot(snapshot: GameState): void {
    for (const handler of this.snapshotHandlers) {
      handler(snapshot);
    }
  }

  onEvent(handler: (event: GameEvent) => void): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onSnapshot(handler: (snapshot: GameState) => void): () => void {
    this.snapshotHandlers.add(handler);
    return () => this.snapshotHandlers.delete(handler);
  }
}
