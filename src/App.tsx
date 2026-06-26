import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ThreeScene } from "./render/three/ThreeScene";
import { loadGraphicsQuality, saveGraphicsQuality, type GraphicsQuality } from "./render/three/graphicsQuality";
import type { SceneFeedbackEvent, SceneTarget } from "./render/three/SceneTargets";
import { Dashboard } from "./ui/Dashboard";
import { Hud } from "./ui/Hud";
import { InteractionPanel } from "./ui/InteractionPanel";
import { LandingCinematicScene } from "./ui/LandingCinematicScene";
import { Minimap } from "./ui/Minimap";
import { MissionTracker } from "./ui/MissionTracker";
import { GuidanceArrow } from "./ui/GuidanceArrow";
import { ClipboardList, Copy, DollarSign, Flame, LogOut, Map, Menu, Network, Package, Play, RotateCcw, Save, ShieldAlert, Sparkles, Truck, Users, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { AdminMapEditor } from "./ui/AdminMapEditor";
import { getStarterMissionStep } from "./game/core/mission";
import { activeConflictEvents, activeMachineAlarms, latestDayReport, selectedRouteTask } from "./game/core/selectors";
import { executePrimaryInteraction, getPrimaryInteraction } from "./ui/interactionActions";
import { useGame } from "./hooks/useGame";
import { ToastStack, type ToastMessage } from "./ui/ToastStack";
import type { GameCommand, GameState, LocationId, ProductId, Vec2 } from "./game/core/types";
import { createDefaultAudioConfig, normalizeAudioConfig, type AudioConfig } from "./game/content/audioConfig";
import { clearModelConfig, loadModelConfig, MODEL_CONFIG_KEY, MODEL_CONFIG_UPDATED_EVENT, saveModelConfig, type ModelConfig } from "./game/content/modelConfig";
import { worldBounds, type WorldMapLayout } from "./game/content/world";
import { endgamePaths, storyMissionArcs } from "./game/content/story";
import { products } from "./game/content/products";
import { clearWorldMapLayout, loadWorldMapLayout, saveWorldMapLayout } from "./game/world/mapLayoutStorage";
import { clearStoredGameSession, loadRemoteAudioConfig, loadRemoteGame, loadRemoteMapLayout, loadStoredGameSession, loginGame, registerGame, type GameSession } from "./game/save/api";
import { createInitialState } from "./game/content/initialState";
import { configureGameAudio, playEventCue, playFeedbackCue, startGameAmbience, unlockGameAudio, updateGameAmbience } from "./ui/audio";
import { MultiplayerClient } from "./game/network/multiplayerClient";
import type { MultiplayerStatus } from "./game/network/protocol";

function targetLocationId(target: SceneTarget | null, state: GameState): LocationId | null {
  if (!target) {
    return null;
  }

  if (target.type === "machine") {
    return state.machines[target.id]?.locationId ?? null;
  }

  return target.id;
}

function createSceneFeedback(command: GameCommand, target: SceneTarget | null, state: GameState): Omit<SceneFeedbackEvent, "id"> | null {
  if (command.actorId !== state.playerFactionId) {
    return null;
  }

  switch (command.type) {
    case "buy_product":
      return { kind: "pickup", locationId: "supplier", productId: command.productId, amount: command.quantity, tone: "good" };
    case "deposit_crate":
      return {
        kind: "store",
        locationId: "garage",
        productId: state.player.carriedCrate?.productId,
        amount: state.player.carriedCrate?.quantity,
        tone: "good"
      };
    case "load_crate":
      return { kind: "pickup", locationId: "garage", productId: command.productId, amount: command.quantity, tone: "good" };
    case "load_vehicle":
      return { kind: "vehicle", locationId: "garage", productId: command.productId, amount: command.quantity, tone: "good" };
    case "unload_vehicle":
      return { kind: "store", locationId: "garage", productId: command.productId, amount: command.quantity, tone: "good" };
    case "take_vehicle_crate": {
      const vehicle = state.vehicles[command.vehicleId];
      return { kind: "pickup", locationId: vehicle?.locationId, productId: command.productId, amount: command.quantity, tone: "good" };
    }
    case "stock_machine":
      return { kind: "stock", machineId: command.machineId, productId: command.productId, amount: command.quantity, tone: "good" };
    case "collect_revenue":
      return { kind: "cash", machineId: command.machineId, amount: Math.round(state.machines[command.machineId]?.revenueStored ?? 0), tone: "good" };
    case "repair_machine":
      return { kind: "repair", machineId: command.machineId, tone: "good" };
    case "place_machine":
      return { kind: "install", locationId: command.locationId, tone: "good" };
    case "install_upgrade":
      return { kind: "upgrade", machineId: command.machineId, tone: "good" };
    case "sabotage_machine":
      return { kind: "sabotage", machineId: command.machineId, tone: "danger" };
    case "confront_alarm": {
      const alarm = state.machineAlarms[command.alarmId];
      return alarm ? { kind: "fight", machineId: alarm.machineId, tone: "good" } : null;
    }
    case "resolve_conflict_event": {
      const conflict = state.conflict.activeEvents[command.eventId];
      if (!conflict) {
        return null;
      }

      return {
        kind: command.resolution === "drive_escape" ? "escape" : command.resolution === "remote_lockdown" ? "lockdown" : "melee",
        locationId: conflict.locationId,
        machineId: conflict.targetMachineId,
        tone: command.resolution === "melee" ? "danger" : "good"
      };
    }
    case "scout_district": {
      const locationId = targetLocationId(target, state) ?? Object.values(state.locations).find((location) => location.districtId === command.districtId)?.id ?? undefined;
      return { kind: "scout", locationId, tone: "neutral" };
    }
    case "unlock_district": {
      const locationId = targetLocationId(target, state) ?? Object.values(state.locations).find((location) => location.districtId === command.districtId)?.id ?? undefined;
      return { kind: "district", locationId, tone: "good" };
    }
    case "debug_set_district_access": {
      const locationId = Object.values(state.locations).find((location) => location.districtId === command.districtId)?.id;
      return { kind: command.access === "unlocked" ? "district" : "scout", locationId, tone: command.access === "unlocked" ? "good" : "neutral" };
    }
    case "debug_grant_cash":
      return { kind: "cash", locationId: state.player.currentLocationId ?? "garage", amount: command.amount, tone: "good" };
    case "debug_complete_requirements":
      return { kind: "upgrade", locationId: "garage", tone: "good" };
    case "debug_set_rival_pressure":
      return { kind: "sabotage", locationId: command.locationId, tone: command.amount >= 0.5 ? "warning" : "neutral" };
    case "debug_spawn_activity":
      return { kind: "scout", locationId: state.player.currentLocationId ?? "laundromat", tone: "neutral" };
    default:
      return null;
  }
}

interface GameAppProps {
  initialState: GameState;
  mapLayout: WorldMapLayout;
  modelConfig: ModelConfig;
  onLogout: () => void;
  session: GameSession;
}

interface LandingFeature {
  icon: LucideIcon;
  tag: string;
  title: string;
  text: string;
}

const landingFeatures: LandingFeature[] = [
  {
    icon: Truck,
    tag: "Route work",
    title: "Drive crates, dodge problems",
    text: "Buy stock from the backdoor supplier, load the van, and keep your route fed before the city learns your machines are unattended piggy banks."
  },
  {
    icon: Wrench,
    tag: "Cabinet drama",
    title: "Repair, upgrade, repeat",
    text: "Rusty Starter is not a machine. It is a cry for help with coin slots. Patch it up, bolt on locks, cameras, cashless terminals, and neon."
  },
  {
    icon: ShieldAlert,
    tag: "Street pressure",
    title: "Every soda has consequences",
    text: "Rivals tag machines, inspections stack heat, and grey goods make cash faster than your lawyer can say no comment."
  },
  {
    icon: DollarSign,
    tag: "Tiny empire",
    title: "Turn pocket change into turf",
    text: "Each machine is a store, a billboard, and a territorial insult with a snack tray. Expand district by district until the city blinks first."
  }
];

const landingProductIds: ProductId[] = ["energy", "luxury_snack", "mystery_capsules", "glitch_gum"];

const landingRivals = [
  {
    name: "Redline Snacks",
    title: "Street crew vending",
    text: "Undercuts prices, tags cabinets, and treats your route like a free public punching bag."
  },
  {
    name: "Glassline VendCo",
    title: "Corporate menace",
    text: "Buys contracts, smiles in meetings, and sends inspections with the energy of a printer jam."
  },
  {
    name: "Night Market Supply",
    title: "After-hours chaos",
    text: "Copies hot products, feeds grey demand, and makes neon districts profitable in the worst possible way."
  }
];

const landingLoopSteps = [
  {
    title: "Buy suspiciously cheap stock",
    text: "Start clean with soda and chips, then decide how spicy the product list should get when the night crowd starts asking questions."
  },
  {
    title: "Claim a corner",
    text: "Every placement is rent, risk, traffic, visibility, and a tiny public insult to the rival who thought that laundromat was theirs."
  },
  {
    title: "Run the route yourself",
    text: "Load crates, drive the van, restock cabinets, collect cash, and pretend the rattling sound is absolutely normal."
  },
  {
    title: "Answer alarms before things get expensive",
    text: "Sabotage, inspections, missed repairs, and rival stunts all turn passive income into active panic."
  },
  {
    title: "Choose your ending",
    text: "Go legit, become the snack syndicate, ally with a faction, cash out, or let the route collapse into a beautiful accounting disaster."
  }
];

const landingScreens = [
  {
    id: "street",
    title: "Street-view route runs",
    text: "Walk the block, spot machines, service locations, and sprint toward alarms with the confidence of someone carrying too many cans."
  },
  {
    id: "ops",
    title: "Operations chaos board",
    text: "Track stock, route tasks, cash, upgrades, rivals, contracts, crew, and which cabinet is currently being dramatic."
  },
  {
    id: "alarm",
    title: "Alarm night mode",
    text: "When Redline pokes a machine, the city stops being a spreadsheet and becomes a vending-flavored emergency."
  }
];

const landingFunNotes = [
  "Your first machine is called Rusty Starter because Legal Liability Box tested poorly.",
  "The van is not fast. It is emotionally committed.",
  "Grey-market gum: fictional, profitable, and definitely not helping your heat score.",
  "Corporate rivals weaponize paperwork. Street rivals weaponize crowbars. You weaponize snacks."
];

function LandingQuickFacts({ state }: { state?: GameState }) {
  const productCount = Object.keys(state?.products ?? products).length;
  const machineCount = state ? Object.values(state.machines).filter((machine) => machine.placementStatus === "installed").length : "Citywide";

  return (
    <div className="landing-fact-strip" aria-label="Game scale">
      <div>
        <strong>{storyMissionArcs.length}</strong>
        <span>story districts</span>
      </div>
      <div>
        <strong>{productCount}</strong>
        <span>stock items</span>
      </div>
      <div>
        <strong>{machineCount}</strong>
        <span>machine claims</span>
      </div>
      <div>
        <strong>{endgamePaths.length}</strong>
        <span>messy endings</span>
      </div>
    </div>
  );
}

function LandingFeatureGrid() {
  return (
    <div className="landing-feature-grid" aria-label="Game systems">
      {landingFeatures.map((feature) => {
        const FeatureIcon = feature.icon;
        return (
          <article className="landing-feature" key={feature.title}>
            <FeatureIcon size={20} aria-hidden="true" />
            <span>{feature.tag}</span>
            <h2>{feature.title}</h2>
            <p>{feature.text}</p>
          </article>
        );
      })}
    </div>
  );
}

function LandingGameLoop() {
  return (
    <section className="landing-loop" aria-label="Game loop">
      <div className="landing-section-title">
        <Zap size={16} aria-hidden="true" />
        <span>How a snack empire actually spirals</span>
      </div>
      <ol className="landing-loop-list">
        {landingLoopSteps.map((step, index) => (
          <li key={step.title}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LandingScreenshotGallery() {
  return (
    <section className="landing-screenshot-gallery" aria-label="Gameplay image gallery">
      <div className="landing-section-title">
        <Sparkles size={16} aria-hidden="true" />
        <span>Postcards from the route</span>
      </div>
      <div className="landing-shot-grid">
        {landingScreens.map((screen) => (
          <article className="landing-shot" key={screen.id}>
            <div className={`landing-shot-art ${screen.id}`} role="img" aria-label={`${screen.title} game scene`}>
              <span className="shot-road" />
              <span className="shot-machine" />
              <span className="shot-van" />
              <span className="shot-panel one" />
              <span className="shot-panel two" />
              <span className="shot-alert" />
            </div>
            <h2>{screen.title}</h2>
            <p>{screen.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LandingProductArt({ productId }: { productId: ProductId }) {
  return (
    <span className={`landing-product-art ${productId}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function LandingProductShelf({ state }: { state?: GameState }) {
  const sourceProducts = state?.products ?? products;

  return (
    <section className="landing-product-shelf" aria-label="Featured vending stock">
      <div className="landing-section-title">
        <Package size={16} aria-hidden="true" />
        <span>Stock the nonsense</span>
      </div>
      <div className="landing-product-grid">
        {landingProductIds.map((productId) => {
          const product = sourceProducts[productId];
          return (
            <article className={`landing-product ${product.legality > 0 ? "risky" : ""}`} key={product.id}>
              <LandingProductArt productId={product.id} />
              <div className="landing-product-copy">
                <strong>{product.name}</strong>
                <span>${product.basePrice} street price</span>
                <p>{product.description}</p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LandingCampaignBoard({ limit, state }: { limit?: number; state?: GameState }) {
  const arcs = typeof limit === "number" ? storyMissionArcs.slice(0, limit) : storyMissionArcs;

  return (
    <section className="landing-campaign-board" aria-label="Campaign districts">
      <div className="landing-section-title">
        <Map size={16} aria-hidden="true" />
        <span>Campaign route</span>
      </div>
      <div className="landing-campaign-grid">
        {arcs.map((arc, index) => (
          <article className="landing-campaign-card" key={arc.id}>
            <div className="landing-campaign-map" aria-hidden="true">
              <span className="campaign-road main" />
              <span className="campaign-road cross" />
              <span className="campaign-block a" />
              <span className="campaign-block b" />
              <span className="campaign-machine" />
            </div>
            <span>{state?.districts[arc.districtId]?.name ?? `District ${index + 1}`}</span>
            <h2>{arc.title}</h2>
            <ul>
              {arc.beats.slice(0, 3).map((beat) => (
                <li key={beat}>{beat}</li>
              ))}
            </ul>
            <p>{arc.reward}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LandingEndgamePaths() {
  return (
    <section className="landing-endgame-board" aria-label="Endgame paths">
      <div className="landing-section-title">
        <Flame size={16} aria-hidden="true" />
        <span>Ways the empire can go wrong</span>
      </div>
      <div className="landing-endgame-grid">
        {endgamePaths.map((path) => (
          <article className="landing-endgame" key={path.id}>
            <h2>{path.title}</h2>
            <strong>{path.condition}</strong>
            <p>{path.consequence}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function LandingFunBoard() {
  return (
    <section className="landing-fun-board" aria-label="Game flavor notes">
      <div className="landing-section-title">
        <ClipboardList size={16} aria-hidden="true" />
        <span>Totally official vending doctrine</span>
      </div>
      <div className="landing-fun-list">
        {landingFunNotes.map((note) => (
          <p key={note}>{note}</p>
        ))}
      </div>
    </section>
  );
}

function LandingRivalBoard() {
  return (
    <section className="landing-rival-board" aria-label="Rival vendors">
      <div className="landing-section-title">
        <Flame size={16} aria-hidden="true" />
        <span>People taking snacks too seriously</span>
      </div>
      <div className="landing-rival-list">
        {landingRivals.map((rival) => (
          <article className="landing-rival" key={rival.name}>
            <span>{rival.title}</span>
            <h2>{rival.name}</h2>
            <p>{rival.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function previewCoordinate(value: number, min: number, max: number): number {
  return ((value - min) / (max - min)) * 100;
}

function previewRect(rect: { depth: number; width: number; x: number; z: number }): { height: number; width: number; x: number; y: number } {
  const x = previewCoordinate(rect.x - rect.width / 2, worldBounds.minX, worldBounds.maxX);
  const y = previewCoordinate(rect.z - rect.depth / 2, worldBounds.minZ, worldBounds.maxZ);
  const width = (rect.width / (worldBounds.maxX - worldBounds.minX)) * 100;
  const height = (rect.depth / (worldBounds.maxZ - worldBounds.minZ)) * 100;

  return {
    x,
    y,
    width: Math.max(0.45, width),
    height: Math.max(0.45, height)
  };
}

function previewPoint(position: Vec2): { x: number; y: number } {
  return {
    x: previewCoordinate(position.x, worldBounds.minX, worldBounds.maxX),
    y: previewCoordinate(position.z, worldBounds.minZ, worldBounds.maxZ)
  };
}

function LandingWorldPreview({ mapLayout, state }: { mapLayout: WorldMapLayout; state?: GameState }) {
  const installedMachines = state ? Object.values(state.machines).filter((machine) => machine.placementStatus === "installed").slice(0, 9) : [];

  return (
    <div className="landing-world-preview" aria-label="In-game city asset preview">
      <svg viewBox="0 0 100 100" role="img" aria-label="Vendetta Vending city map">
        <rect className="landing-map-ground" x="1.5" y="1.5" width="97" height="97" rx="4" />
        {mapLayout.roads.slice(0, 24).map((road) => {
          const rect = previewRect(road);
          return <rect className="landing-map-road" key={road.id} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="0.7" />;
        })}
        {mapLayout.buildings.slice(0, 58).map((building, index) => {
          const rect = previewRect(building);
          return <rect className={`landing-map-building ${building.style}`} key={`${building.signText}_${index}`} x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="0.55" />;
        })}
        {installedMachines.map((machine) => {
          const location = state?.locations[machine.locationId];
          if (!location) {
            return null;
          }

          const point = previewPoint(location.position);
          const owner = machine.ownerFactionId === state.playerFactionId ? "player" : "rival";
          return <circle className={`landing-map-machine ${owner}`} key={machine.id} cx={point.x} cy={point.y} r="1.75" />;
        })}
      </svg>
    </div>
  );
}

function GameApp({ initialState, mapLayout, modelConfig, onLogout, session }: GameAppProps) {
  const multiplayerClient = useMemo(() => new MultiplayerClient(session.token), [session.token]);
  const [multiplayerStatus, setMultiplayerStatus] = useState<MultiplayerStatus>(() => multiplayerClient.getStatus());
  const { state, sendCommand, advanceWorld, save, reload, restart } = useGame({ initialState, multiplayerClient, multiplayerRole: multiplayerStatus.role, session });
  const [target, setTarget] = useState<SceneTarget | null>(null);
  const [entered, setEntered] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [playerPosition, setPlayerPosition] = useState<Vec2>({ x: -9, z: 5.9 });
  const [playerHeadingDegrees, setPlayerHeadingDegrees] = useState(-180);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [sceneFeedback, setSceneFeedback] = useState<SceneFeedbackEvent | null>(null);
  const [graphicsQuality, setGraphicsQualityState] = useState<GraphicsQuality>(() => loadGraphicsQuality());
  const gameMenuRef = useRef<HTMLDivElement | null>(null);
  const lastEventIdRef = useRef(state.eventLog[0]?.id ?? null);
  const lastMissionStepIdRef = useRef<string | null>(null);
  const lastServiceLocationIdRef = useRef<LocationId | null>(state.player.currentLocationId);
  const lastReportIdRef = useRef<string | null>(null);
  const activeTarget = entered ? target : null;
  const primaryInteraction = useMemo(() => getPrimaryInteraction(state, activeTarget), [activeTarget, state]);
  const missionStep = useMemo(() => getStarterMissionStep(state, playerPosition), [playerPosition, state]);
  const routeTask = useMemo(() => selectedRouteTask(state), [state]);
  const activeAlarm = useMemo(() => activeMachineAlarms(state)[0], [state]);
  const conflicts = useMemo(() => activeConflictEvents(state), [state]);
  const guidanceLocationId = activeAlarm?.locationId ?? routeTask?.locationId ?? missionStep.targetLocationId;
  const guidanceLabel = activeAlarm ? "Machine alarm" : routeTask?.title;
  const nextActionLabel = activeAlarm ? "Answer machine alarm" : routeTask?.title ?? missionStep.title;
  const report = latestDayReport(state);
  const playerFaction = state.factions[state.playerFactionId];
  const installedPlayerMachines = Object.values(state.machines).filter((machine) => machine.ownerFactionId === state.playerFactionId && machine.placementStatus === "installed").length;
  const rivalMachines = Object.values(state.machines).filter((machine) => machine.ownerFactionId !== state.playerFactionId && machine.placementStatus === "installed").length;
  const starterArc = storyMissionArcs[0];
  const showDebugTools = useMemo(() => new URLSearchParams(window.location.search).has("debug"), []);
  const multiplayerRoom = multiplayerStatus.room;
  const multiplayerStatusLabel = multiplayerRoom
    ? multiplayerStatus.role === "host"
      ? `Hosting ${multiplayerRoom.code}`
      : `Joined ${multiplayerRoom.code}`
    : multiplayerStatus.connection === "connecting"
      ? "Connecting"
      : multiplayerStatus.connection === "error"
        ? "Connection failed"
        : "Not in a room";

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [{ ...toast, id }, ...current].slice(0, 4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((message) => message.id !== id));
    }, 4200);
  }, []);

  const setGraphicsQuality = useCallback((quality: GraphicsQuality) => {
    saveGraphicsQuality(quality);
    setGraphicsQualityState(quality);
  }, []);

  useEffect(() => {
    const unsubscribe = multiplayerClient.onStatus(setMultiplayerStatus);
    return () => {
      unsubscribe();
      multiplayerClient.disconnect();
    };
  }, [multiplayerClient]);

  const handleCreateRoom = useCallback(() => {
    multiplayerClient.createRoom();
    addToast({
      title: "Multiplayer",
      message: "Creating a co-op room.",
      tone: "neutral"
    });
  }, [addToast, multiplayerClient]);

  const handleJoinRoom = useCallback(() => {
    const roomCode = roomCodeInput.trim().toUpperCase();
    if (!roomCode) {
      return;
    }

    multiplayerClient.joinRoom(roomCode);
    addToast({
      title: "Multiplayer",
      message: `Joining room ${roomCode}.`,
      tone: "neutral"
    });
  }, [addToast, multiplayerClient, roomCodeInput]);

  const handleLeaveRoom = useCallback(() => {
    multiplayerClient.leaveRoom();
    addToast({
      title: "Multiplayer",
      message: "Left co-op room.",
      tone: "neutral"
    });
  }, [addToast, multiplayerClient]);

  const handleCopyRoomCode = useCallback(() => {
    if (!multiplayerRoom) {
      return;
    }

    if (navigator.clipboard) {
      void navigator.clipboard.writeText(multiplayerRoom.code);
    }
    addToast({
      title: "Room code",
      message: `${multiplayerRoom.code} ready to share.`,
      tone: "good"
    });
  }, [addToast, multiplayerRoom]);

  useEffect(() => {
    if (!gameMenuOpen) {
      return;
    }

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (gameMenuRef.current && !gameMenuRef.current.contains(event.target as Node)) {
        setGameMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setGameMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [gameMenuOpen]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      advanceWorld(0.12);
    }, 1500);

    return () => window.clearInterval(timer);
  }, [advanceWorld]);

  useEffect(() => {
    const newestEvent = state.eventLog[0];
    if (!newestEvent || newestEvent.id === lastEventIdRef.current) {
      return;
    }

    lastEventIdRef.current = newestEvent.id;
    playEventCue(newestEvent.tone);
    if (newestEvent.tone === "danger" && activeAlarm) {
      playFeedbackCue("sabotage");
      setSceneFeedback({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        kind: "sabotage",
        machineId: activeAlarm.machineId,
        tone: "danger"
      });
    }
    addToast({
      title: newestEvent.message.startsWith("ALARM") ? "Machine alarm" : newestEvent.message.startsWith("Alarm missed") ? "Alarm missed" : "Street update",
      message: newestEvent.message,
      tone: newestEvent.tone
    });
  }, [activeAlarm, addToast, state.eventLog]);

  useEffect(() => {
    if (!lastMissionStepIdRef.current) {
      lastMissionStepIdRef.current = missionStep.id;
      return;
    }

    if (missionStep.id === lastMissionStepIdRef.current) {
      return;
    }

    lastMissionStepIdRef.current = missionStep.id;
    addToast({
      title: "Objective updated",
      message: missionStep.objective,
      tone: missionStep.id === "completed" ? "good" : "neutral"
    });
  }, [addToast, missionStep.id, missionStep.objective]);

  useEffect(() => {
    const nextLocationId = entered ? targetLocationId(target, state) : null;
    if (nextLocationId === lastServiceLocationIdRef.current) {
      return;
    }

    lastServiceLocationIdRef.current = nextLocationId;
    sendCommand({ type: "set_player_location", actorId: state.playerFactionId, locationId: nextLocationId });
  }, [entered, sendCommand, state, target]);

  useEffect(() => {
    if (!report || report.id === lastReportIdRef.current) {
      return;
    }

    lastReportIdRef.current = report.id;
    addToast({
      title: `Day ${report.day} report`,
      message: report.summary,
      tone: report.contractsFailed > 0 ? "warning" : "good"
    });
  }, [addToast, report]);

  const handleRestart = useCallback(() => {
    if (window.confirm("Restart this local MVP save?")) {
      restart();
    }
  }, [restart]);

  const handleManualSave = useCallback(() => {
    if (multiplayerStatus.role === "guest") {
      addToast({
        title: "Host controls save",
        message: "This co-op room is saved by the host.",
        tone: "warning"
      });
      setGameMenuOpen(false);
      return;
    }

    save();
    addToast({
      title: "Game saved",
      message: "Local save updated. Remote sync will run when the server is available.",
      tone: "good"
    });
    setGameMenuOpen(false);
  }, [addToast, multiplayerStatus.role, save]);

  const handleLogout = useCallback(() => {
    multiplayerClient.disconnect();
    save();
    setGameMenuOpen(false);
    onLogout();
  }, [multiplayerClient, onLogout, save]);

  const handleEnterDistrict = useCallback(() => {
    unlockGameAudio();
    startGameAmbience();
    setEntered(true);
  }, []);

  const sendCommandAtActiveTarget = useCallback(
    (command: GameCommand) => {
      unlockGameAudio();
      const nextLocationId = targetLocationId(activeTarget, state);
      if (nextLocationId !== lastServiceLocationIdRef.current) {
        lastServiceLocationIdRef.current = nextLocationId;
        sendCommand({ type: "set_player_location", actorId: state.playerFactionId, locationId: nextLocationId });
      }

      const feedback = createSceneFeedback(command, activeTarget, state);
      if (feedback) {
        playFeedbackCue(feedback.kind);
        setSceneFeedback({
          ...feedback,
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`
        });
      }
      sendCommand(command);
    },
    [activeTarget, sendCommand, state]
  );

  const sendCommandWithFeedback = useCallback(
    (command: GameCommand) => {
      unlockGameAudio();
      const feedback = createSceneFeedback(command, activeTarget, state);
      if (feedback) {
        playFeedbackCue(feedback.kind);
        setSceneFeedback({
          ...feedback,
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`
        });
      }
      sendCommand(command);
    },
    [activeTarget, sendCommand, state]
  );

  const handlePrimaryInteraction = useCallback(() => {
    executePrimaryInteraction(primaryInteraction, {
      onCommand: sendCommandAtActiveTarget,
      onSave: save
    });
  }, [primaryInteraction, save, sendCommandAtActiveTarget]);

  useEffect(() => {
    if (!entered) {
      return;
    }

    updateGameAmbience(state.factions[state.playerFactionId].heat, conflicts.length > 0);
  }, [conflicts.length, entered, state.factions, state.playerFactionId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!entered || event.repeat) {
        return;
      }

      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      const isUiControl = Boolean(eventTarget?.closest("input, textarea, select, button, [contenteditable='true']"));
      if (isUiControl) {
        return;
      }

      if (event.code === "KeyM") {
        event.preventDefault();
        setDashboardOpen((current) => !current);
        return;
      }

      if (event.code !== "KeyE") {
        return;
      }

      event.preventDefault();
      unlockGameAudio();
      handlePrimaryInteraction();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entered, handlePrimaryInteraction]);

  return (
    <main className="game-shell">
      <ThreeScene
        graphicsQuality={graphicsQuality}
        guidanceLocationId={guidanceLocationId}
        mapLayout={mapLayout}
        modelConfig={modelConfig}
        state={state}
        feedbackEvent={sceneFeedback}
        onPlayerPositionChange={setPlayerPosition}
        onPlayerHeadingChange={setPlayerHeadingDegrees}
        onTargetChange={setTarget}
      />
      <div className="world-vignette" aria-hidden="true" />
      {entered && <Hud feedbackEvent={sceneFeedback} nextActionLabel={nextActionLabel} state={state} />}
      {entered && <MissionTracker state={state} playerPosition={playerPosition} />}
      {entered && <div className="crosshair" aria-hidden="true" />}
      <div className="game-menu" ref={gameMenuRef}>
        <button
          aria-expanded={gameMenuOpen}
          aria-label={gameMenuOpen ? "Close game menu" : "Open game menu"}
          className={gameMenuOpen ? "game-menu-button active" : "game-menu-button"}
          onClick={() => setGameMenuOpen((current) => !current)}
          type="button"
        >
          {gameMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
        {gameMenuOpen && (
          <div className="game-menu-popover" role="menu">
            <div className="game-menu-profile">
              <span>Signed in</span>
              <strong>{session.profile.name}</strong>
            </div>
            <div className="multiplayer-menu-panel" role="group" aria-label="Multiplayer room">
              <div className="multiplayer-menu-heading">
                <Network size={16} aria-hidden="true" />
                <div>
                  <span>Co-op room</span>
                  <strong>{multiplayerStatusLabel}</strong>
                </div>
              </div>
              {multiplayerRoom ? (
                <>
                  <div className="multiplayer-room-code">
                    <span>{multiplayerRoom.code}</span>
                    <button aria-label="Copy room code" onClick={handleCopyRoomCode} type="button">
                      <Copy size={15} aria-hidden="true" />
                    </button>
                  </div>
                  <div className="multiplayer-peer-list" aria-label="Connected players">
                    {multiplayerRoom.peers.map((peer) => (
                      <span key={peer.id}>
                        <Users size={14} aria-hidden="true" />
                        {peer.profile.name}
                        {peer.id === multiplayerRoom.hostPeerId ? " host" : ""}
                      </span>
                    ))}
                  </div>
                  <span className="multiplayer-connection-note">
                    {multiplayerStatus.directConnections > 0 ? `${multiplayerStatus.directConnections} direct peer link${multiplayerStatus.directConnections === 1 ? "" : "s"}` : "Using server relay until peer link opens"}
                  </span>
                  <button onClick={handleLeaveRoom} type="button">
                    <LogOut size={16} aria-hidden="true" />
                    Leave room
                  </button>
                </>
              ) : (
                <>
                  <button disabled={multiplayerStatus.connection === "connecting"} onClick={handleCreateRoom} type="button">
                    <Network size={16} aria-hidden="true" />
                    Create room
                  </button>
                  <div className="multiplayer-join-row">
                    <input
                      aria-label="Room code"
                      maxLength={8}
                      placeholder="ROOM"
                      value={roomCodeInput}
                      onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                    />
                    <button disabled={!roomCodeInput.trim() || multiplayerStatus.connection === "connecting"} onClick={handleJoinRoom} type="button">
                      Join
                    </button>
                  </div>
                </>
              )}
              {multiplayerStatus.message && <p>{multiplayerStatus.message}</p>}
            </div>
            {entered && (
              <button
                onClick={() => {
                  setDashboardOpen((current) => !current);
                  setGameMenuOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                <ClipboardList size={16} aria-hidden="true" />
                {dashboardOpen ? "Close ops" : "Open ops"}
              </button>
            )}
            <button onClick={handleManualSave} role="menuitem" type="button">
              <Save size={16} aria-hidden="true" />
              Save game
            </button>
            <button
              disabled={multiplayerStatus.role === "guest"}
              onClick={() => {
                setGameMenuOpen(false);
                handleRestart();
              }}
              role="menuitem"
              type="button"
            >
              <RotateCcw size={16} aria-hidden="true" />
              Restart run
            </button>
            <button className="danger" onClick={handleLogout} role="menuitem" type="button">
              <LogOut size={16} aria-hidden="true" />
              Logout
            </button>
          </div>
        )}
      </div>
      {entered && <GuidanceArrow label={guidanceLabel} state={state} targetLocationId={guidanceLocationId} playerHeadingDegrees={playerHeadingDegrees} playerPosition={playerPosition} />}
      {entered && activeTarget && primaryInteraction && (
        <div className={`target-prompt ${primaryInteraction.disabled ? "disabled" : ""}`}>
          <span className="target-name">{activeTarget.label}</span>
          <span className="target-action">
            <kbd>E</kbd>
            {primaryInteraction.label}
          </span>
          {primaryInteraction.disabled && primaryInteraction.disabledReason && <span className="target-reason">{primaryInteraction.disabledReason}</span>}
        </div>
      )}
      {!entered && (
        <section className="entry-overlay landing-overlay" aria-label="Vendetta Vending landing page">
          <div className="landing-panel">
            <div className="landing-copy">
              <span className="landing-kicker">Cinderblock Row is open and suspiciously fizzy</span>
              <h1>Vendetta Vending</h1>
              <p>
                Build a snack empire so dramatic it probably needs a city council hearing. Fix busted machines, stock questionable beverages, bribe your way into premium corners, and defend every cabinet like it owes you rent.
              </p>
              <div className="landing-quip-row" aria-label="Game highlights">
                <span>
                  <Map size={15} aria-hidden="true" />
                  6 weird districts
                </span>
                <span>
                  <Zap size={15} aria-hidden="true" />
                  Legal-ish choices
                </span>
                <span>
                  <Sparkles size={15} aria-hidden="true" />
                  Maximum snack beef
                </span>
              </div>
              <button className="entry-button landing-primary" onClick={handleEnterDistrict} type="button">
                <Play size={18} aria-hidden="true" />
                Enter District
              </button>
              <LandingCinematicScene modelConfig={modelConfig} />
              <LandingQuickFacts state={state} />
              <LandingFeatureGrid />
              <LandingGameLoop />
              <LandingCampaignBoard limit={3} state={state} />
              <div className="landing-story-beats" aria-label="Opening story beats">
                {starterArc.beats.slice(0, 5).map((beat, index) => (
                  <div className="landing-beat" key={beat}>
                    <span>{index + 1}</span>
                    <strong>{beat}</strong>
                  </div>
                ))}
              </div>
            </div>
            <div className="landing-side">
              <LandingWorldPreview mapLayout={mapLayout} state={state} />
              <LandingScreenshotGallery />
              <div className="landing-intel-grid" aria-label="Current route status">
                <div>
                  <span>Bankroll</span>
                  <strong>${Math.round(playerFaction.money)}</strong>
                </div>
                <div>
                  <span>Your machines</span>
                  <strong>{installedPlayerMachines}</strong>
                </div>
                <div>
                  <span>Rival claims</span>
                  <strong>{rivalMachines}</strong>
                </div>
              </div>
              <LandingProductShelf state={state} />
              <LandingRivalBoard />
              <LandingEndgamePaths />
              <LandingFunBoard />
              <div className="landing-arc-list" aria-label="Story districts">
                {storyMissionArcs.slice(1, 4).map((arc) => (
                  <article className="landing-arc" key={arc.id}>
                    <span>{state.districts[arc.districtId]?.name ?? arc.title}</span>
                    <h2>{arc.title}</h2>
                    <p>{arc.reward}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
      {entered && (
        <button
          aria-label={dashboardOpen ? "Close operations dashboard" : "Open operations dashboard"}
          aria-pressed={dashboardOpen}
          className={dashboardOpen ? "dashboard-toggle active" : "dashboard-toggle"}
          onClick={() => setDashboardOpen((current) => !current)}
          type="button"
        >
          {dashboardOpen ? <X size={17} aria-hidden="true" /> : <ClipboardList size={17} aria-hidden="true" />}
          <span>{dashboardOpen ? "Close" : "Ops"}</span>
        </button>
      )}
      {dashboardOpen && (
        <Dashboard
          graphicsQuality={graphicsQuality}
          state={state}
          onCommand={sendCommandWithFeedback}
          onGraphicsQualityChange={setGraphicsQuality}
          showDebug={showDebugTools}
        />
      )}
      {entered && <Minimap state={state} playerPosition={playerPosition} guidanceLocationId={guidanceLocationId} target={activeTarget} />}
      {entered && <InteractionPanel state={state} target={activeTarget} onCommand={sendCommandAtActiveTarget} onSave={save} onReload={reload} onRestart={handleRestart} />}
      <ToastStack messages={toasts} />
    </main>
  );
}

function GameAccessGate({ mapLayout, modelConfig }: { mapLayout: WorldMapLayout; modelConfig: ModelConfig }) {
  const [accessMode, setAccessMode] = useState<"login" | "register">("login");
  const [authState, setAuthState] = useState<
    | { status: "loading" }
    | { status: "login"; message?: string }
    | { initialState: GameState; session: GameSession; status: "ready" }
  >({ status: "loading" });
  const [credentials, setCredentials] = useState({ name: "", pin: "" });
  const [submitting, setSubmitting] = useState(false);
  const actionLabel = accessMode === "register" ? "Register" : "Login";

  useEffect(() => {
    const session = loadStoredGameSession();
    if (!session) {
      setAuthState({ status: "login" });
      return;
    }

    let cancelled = false;
    loadRemoteGame(session)
      .then((remote) => {
        if (cancelled) {
          return;
        }

        setAuthState({
          status: "ready",
          session: { ...session, saveRevision: remote.save?.revision ?? null, saveUpdatedAt: remote.save?.updatedAt ?? null },
          initialState: remote.save?.state ?? createInitialState()
        });
      })
      .catch(() => {
        clearStoredGameSession();
        if (!cancelled) {
          setAuthState({ status: "login", message: "Session expired. Enter your name and PIN." });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogin = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAuthState({ status: "login" });
      setSubmitting(true);
      const submitMode = accessMode;
      const submitAuth = submitMode === "register" ? registerGame : loginGame;

      submitAuth(credentials.name, credentials.pin)
        .then((response) => {
          setAuthState({
            status: "ready",
            session: { profile: response.profile, saveRevision: response.save?.revision ?? null, saveUpdatedAt: response.save?.updatedAt ?? null, token: response.token },
            initialState: response.save?.state ?? createInitialState()
          });
        })
        .catch((error) => {
          setAuthState({ status: "login", message: error instanceof Error ? error.message : `${actionLabel} failed.` });
        })
        .finally(() => setSubmitting(false));
    },
    [accessMode, actionLabel, credentials.name, credentials.pin]
  );

  const switchAccessMode = useCallback((mode: "login" | "register") => {
    setAccessMode(mode);
    setAuthState((current) => (current.status === "login" ? { status: "login" } : current));
  }, []);

  const handleLogout = useCallback(() => {
    clearStoredGameSession();
    setAccessMode("login");
    setSubmitting(false);
    setCredentials({ name: "", pin: "" });
    setAuthState({ status: "login", message: "Logged out. Enter your name and PIN to continue." });
  }, []);

  if (authState.status === "ready") {
    return <GameApp key={authState.session.profile.id} initialState={authState.initialState} mapLayout={mapLayout} modelConfig={modelConfig} onLogout={handleLogout} session={authState.session} />;
  }

  return (
    <main className="access-shell">
      <section className="access-landing" aria-label="Vendetta Vending access">
        <div className="access-hero">
          <span className="landing-kicker">First-person vending crime sim</span>
          <h1>Vendetta Vending</h1>
          <p className="access-story">
            Hit the street with a clattering route van, a busted snack machine, and a terrible idea: turn pocket change into territory. Stock weird products, answer alarms, outrun rivals, and make every corner of the city smell like profit and bad decisions.
          </p>
          <div className="landing-quip-row" aria-label="Game highlights">
            <span>
              <Truck size={15} aria-hidden="true" />
              Drive the route
            </span>
            <span>
              <ShieldAlert size={15} aria-hidden="true" />
              Defend machines
            </span>
            <span>
              <Sparkles size={15} aria-hidden="true" />
              Sell suspicious gum
            </span>
          </div>
          <LandingCinematicScene modelConfig={modelConfig} />
          <LandingQuickFacts />
        </div>
        <form className="access-panel" onSubmit={handleLogin}>
          <div>
            <h2>Game Profile</h2>
            <span>{authState.status === "loading" ? "Loading protected save" : accessMode === "register" ? "Create game profile" : "Load game profile"}</span>
          </div>
          <div className="access-mode-tabs" aria-label="Game access mode">
            <button
              aria-pressed={accessMode === "login"}
              disabled={authState.status === "loading" || submitting}
              onClick={() => switchAccessMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              aria-pressed={accessMode === "register"}
              disabled={authState.status === "loading" || submitting}
              onClick={() => switchAccessMode("register")}
              type="button"
            >
              Register
            </button>
          </div>
          <label>
            Player name
            <input
              autoComplete="username"
              disabled={authState.status === "loading" || submitting}
              maxLength={36}
              value={credentials.name}
              onChange={(event) => setCredentials((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label>
            PIN
            <input
              autoComplete={accessMode === "register" ? "new-password" : "current-password"}
              disabled={authState.status === "loading" || submitting}
              inputMode="numeric"
              maxLength={12}
              type="password"
              value={credentials.pin}
              onChange={(event) => setCredentials((current) => ({ ...current, pin: event.target.value }))}
            />
          </label>
          {authState.status === "login" && authState.message && <p>{authState.message}</p>}
          <button disabled={authState.status === "loading" || submitting} type="submit">
            {submitting ? `${actionLabel}...` : actionLabel}
          </button>
        </form>
        <div className="access-longform">
          <LandingFeatureGrid />
          <LandingGameLoop />
          <LandingWorldPreview mapLayout={mapLayout} />
          <LandingScreenshotGallery />
          <LandingProductShelf />
          <LandingCampaignBoard />
          <LandingEndgamePaths />
          <LandingRivalBoard />
          <LandingFunBoard />
        </div>
      </section>
    </main>
  );
}

export function App() {
  const [mapLayout, setMapLayout] = useState<WorldMapLayout>(() => loadWorldMapLayout());
  const [audioConfig, setAudioConfig] = useState<AudioConfig>(() => createDefaultAudioConfig());
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => loadModelConfig());
  const isAdminRoute = window.location.pathname === "/admin";

  useEffect(() => {
    let cancelled = false;
    loadRemoteMapLayout()
      .then((remote) => {
        if (!cancelled && remote.layout) {
          saveWorldMapLayout(remote.layout);
          setMapLayout(remote.layout);
        }
      })
      .catch(() => {
        // Local authored layout remains available if the API is unreachable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadRemoteAudioConfig()
      .then((remote) => {
        if (!cancelled) {
          setAudioConfig(normalizeAudioConfig(remote.config));
        }
      })
      .catch(() => {
        // Authored fallback audio remains available if the API is unreachable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    configureGameAudio(audioConfig);
  }, [audioConfig]);

  useEffect(() => {
    const refreshModelConfig = () => setModelConfig(loadModelConfig());
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODEL_CONFIG_KEY) {
        refreshModelConfig();
      }
    };

    window.addEventListener(MODEL_CONFIG_UPDATED_EVENT, refreshModelConfig);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MODEL_CONFIG_UPDATED_EVENT, refreshModelConfig);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const handleSaveMapLayout = useCallback((layout: WorldMapLayout) => {
    saveWorldMapLayout(layout);
    setMapLayout(loadWorldMapLayout());
  }, []);

  const handleResetMapLayout = useCallback(() => {
    clearWorldMapLayout();
    setMapLayout(loadWorldMapLayout());
  }, []);

  const handleSaveModelConfig = useCallback((config: ModelConfig) => {
    saveModelConfig(config);
    setModelConfig(loadModelConfig());
  }, []);

  const handleResetModelConfig = useCallback(() => {
    clearModelConfig();
    setModelConfig(loadModelConfig());
  }, []);

  if (isAdminRoute) {
    return (
      <AdminMapEditor
        initialAudioConfig={audioConfig}
        initialLayout={mapLayout}
        modelConfig={modelConfig}
        onAudioSave={setAudioConfig}
        onAudioReset={setAudioConfig}
        onModelReset={handleResetModelConfig}
        onModelSave={handleSaveModelConfig}
        onSave={handleSaveMapLayout}
        onReset={handleResetMapLayout}
      />
    );
  }

  return <GameAccessGate mapLayout={mapLayout} modelConfig={modelConfig} />;
}
