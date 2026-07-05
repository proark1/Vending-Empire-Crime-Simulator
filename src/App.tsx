import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { graphicsQualityLabels, graphicsQualityModes, loadGraphicsQuality, saveGraphicsQuality, type GraphicsQuality } from "./render/three/graphicsQuality";
import type { SceneFeedbackEvent, SceneTarget } from "./render/three/SceneTargets";
import { Hud } from "./ui/Hud";
import { InteractionPanel } from "./ui/InteractionPanel";
import { Minimap } from "./ui/Minimap";
import { MissionTracker } from "./ui/MissionTracker";
import { GuidanceArrow } from "./ui/GuidanceArrow";
import { ClipboardList, Copy, DollarSign, Flame, LogOut, Map, Menu, Network, Package, Pause, Play, RotateCcw, Save, ShieldAlert, SlidersHorizontal, Sparkles, Truck, Users, Volume2, VolumeX, Wrench, X, Zap, type LucideIcon } from "lucide-react";
import { getStarterMissionStep, type MissionStep } from "./game/core/mission";
import { activeConflictEvents, activeMachineAlarms, heatTierFor, latestDayReport, selectedRouteTask, type RouteTask } from "./game/core/selectors";
import { executePrimaryInteraction, getPrimaryInteraction, type PrimaryInteraction, type PrimaryInteractionTone } from "./ui/interactionActions";
import { useGame } from "./hooks/useGame";
import { ToastStack, type ToastMessage } from "./ui/ToastStack";
import type { GameCommand, GameState, LocationId, ProductId, Vec2, VehicleId } from "./game/core/types";
import { createDefaultAudioConfig, normalizeAudioConfig, type AudioConfig } from "./game/content/audioConfig";
import { clearModelConfig, loadModelConfig, MODEL_CONFIG_KEY, MODEL_CONFIG_UPDATED_EVENT, saveModelConfig, type ModelConfig } from "./game/content/modelConfig";
import { crimeContacts, districts, worldBounds, type WorldMapLayout } from "./game/content/world";
import { endgamePaths, storyMissionArcs } from "./game/content/story";
import { products } from "./game/content/products";
import { clearWorldMapLayout, loadWorldMapLayout, normalizeLayout, saveWorldMapLayout } from "./game/world/mapLayoutStorage";
import { guidanceServicePoint } from "./game/world/locationGeometry";
import { clearStoredGameSession, fetchLeaderboard, loadRemoteAudioConfig, loadRemoteGame, loadRemoteMapLayout, loadStoredGameSession, loginGame, registerGame, type GameSession, type LeaderboardEntry } from "./game/save/api";
import { loadGame } from "./game/save/storage";
import { createInitialState } from "./game/content/initialState";
import { activeRunModifier, chooseRunModifier } from "./game/content/replayability";
import { configureGameAudio, playEventCue, playFeedbackCue, playTaggedCue, playVoiceCue, startGameAmbience, unlockGameAudio, updateGameAmbience } from "./ui/audio";
import { VOICE_EVENT_PATTERNS } from "./ui/voiceEventPatterns";
import { MultiplayerClient } from "./game/network/multiplayerClient";
import type { MultiplayerStatus } from "./game/network/protocol";
import { getPerfSnapshot } from "./game/core/performance";

const AdminMapEditor = lazy(() => import("./ui/AdminMapEditor").then((module) => ({ default: module.AdminMapEditor })));
const Dashboard = lazy(() => import("./ui/Dashboard").then((module) => ({ default: module.Dashboard })));
const LandingCinematicScene = lazy(() => import("./ui/LandingCinematicScene").then((module) => ({ default: module.LandingCinematicScene })));
const ThreeScene = lazy(() => import("./render/three/ThreeScene").then((module) => ({ default: module.ThreeScene })));

function targetLocationId(target: SceneTarget | null, state: GameState): LocationId | null {
  if (!target) {
    return null;
  }

  if (target.type === "machine") {
    return state.machines[target.id]?.locationId ?? null;
  }

  if (target.type === "base" || target.type === "supplier" || target.type === "placement") {
    return target.id;
  }

  if (target.type === "rival_operation") {
    for (const organization of Object.values(state.rivalOrganizations ?? {})) {
      const operation = organization.operations.find((candidate) => candidate.id === target.id && !candidate.resolvedHour);
      if (operation) {
        return operation.locationId;
      }
    }
  }

  return null;
}

function distance2d(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function targetForGuidedLocation(
  state: GameState,
  locationId: LocationId,
  routeTask: RouteTask | undefined,
  missionStep: MissionStep
): SceneTarget | null {
  const location = state.locations[locationId];
  if (!location) {
    return null;
  }

  if (location.kind === "garage") {
    return { type: "base", id: "garage", label: location.name };
  }

  if (location.kind === "supplier") {
    return { type: "supplier", id: "supplier", label: location.name };
  }

  if (routeTask?.machineId && state.machines[routeTask.machineId]) {
    const machine = state.machines[routeTask.machineId];
    return { type: "machine", id: machine.id, label: machine.name };
  }

  const installedMachine = Object.values(state.machines).find(
    (machine) => machine.locationId === locationId && (machine.placementStatus ?? "installed") === "installed"
  );
  if (installedMachine && missionStep.id !== "install_laundromat" && missionStep.id !== "install_second" && missionStep.id !== "install_third" && missionStep.id !== "install_industrial") {
    return { type: "machine", id: installedMachine.id, label: installedMachine.name };
  }

  return { type: "placement", id: location.id, label: location.name };
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
    case "player_conflict_action": {
      const conflict = state.conflict.activeEvents[command.eventId];
      if (!conflict) {
        return null;
      }

      return {
        kind: command.action === "push_escape" ? "escape" : "melee",
        locationId: conflict.locationId,
        machineId: conflict.targetMachineId,
        tone: command.action === "dodge" ? "neutral" : command.action === "tool" ? "good" : "danger"
      };
    }
    case "work_crime_contact": {
      const contact = crimeContacts.find((candidate) => candidate.id === command.contactId);
      const locationId = contact ? Object.values(state.locations).find((location) => location.districtId === contact.districtId)?.id : undefined;
      return {
        kind: command.action === "source_contraband" ? "pickup" : command.action === "arrange_bribe" ? "lockdown" : "scout",
        locationId,
        productId: contact?.productId,
        tone: command.action === "source_contraband" ? "danger" : "good"
      };
    }
    case "pressure_rival_operation": {
      const operation = Object.values(state.rivalOrganizations ?? {})
        .flatMap((organization) => organization.operations)
        .find((candidate) => candidate.id === command.operationId);
      return operation
        ? {
            kind: command.approach === "disrupt" ? "sabotage" : command.approach === "negotiate" ? "district" : "scout",
            locationId: operation.locationId,
            tone: command.approach === "disrupt" ? "danger" : "good"
          }
        : null;
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
    case "dispatch_vehicle":
      return { kind: "vehicle", locationId: command.locationId, tone: "good" };
    case "drive_vehicle":
      return { kind: "vehicle", locationId: state.vehicles[command.vehicleId]?.locationId, tone: "neutral" };
    case "select_route_task": {
      const task = selectedRouteTask({ ...state, routePlan: { ...state.routePlan, selectedTaskId: command.taskId } });
      return { kind: "scout", locationId: task?.locationId ?? state.player.currentLocationId ?? "garage", tone: "neutral" };
    }
    case "service_vehicle":
      return { kind: "repair", locationId: state.vehicles[command.vehicleId]?.locationId ?? "garage", tone: "good" };
    case "install_vehicle_upgrade":
      return { kind: "upgrade", locationId: state.vehicles[command.vehicleId]?.locationId ?? "garage", tone: "good" };
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

function primaryInteractionSignature(interaction: PrimaryInteraction | null): string {
  if (!interaction) {
    return "none";
  }

  if (interaction.kind === "save") {
    return `save:${interaction.label}:${interaction.disabled ? "disabled" : "ready"}`;
  }

  return `command:${interaction.label}:${interaction.disabled ? "disabled" : "ready"}:${JSON.stringify(interaction.command)}`;
}

function serviceHoldStage(hold: ServiceHoldState): string {
  const progress = hold.progress;
  const verb = hold.verb.toLowerCase();
  const stages = verb.includes("stock")
    ? ["Lift crate", "Open cabinet", "Slot products", "Check rows"]
    : verb.includes("repair")
      ? ["Open panel", "Trace fault", "Swap parts", "Test machine"]
      : verb.includes("load") || verb.includes("unload") || verb.includes("storing") || verb.includes("buying")
        ? ["Grab box", "Check count", "Shift weight", "Secure load"]
        : verb.includes("fight") || verb.includes("jamming")
          ? ["Close distance", "Commit move", "Hold ground", "Break contact"]
          : verb.includes("scout") || verb.includes("evidence")
            ? ["Watch corner", "Check signs", "Mark route", "Log intel"]
            : ["Start work", "Keep pressure", "Finish task", "Confirm"];
  return stages[Math.min(stages.length - 1, Math.floor(progress * stages.length))];
}

function serviceHoldCueLabels(verb: string): string[] {
  const lowered = verb.toLowerCase();
  if (lowered.includes("repair")) {
    return ["panel", "parts", "test"];
  }

  if (lowered.includes("load") || lowered.includes("unload") || lowered.includes("stock") || lowered.includes("storing") || lowered.includes("buying")) {
    return ["grab", "shift", "secure"];
  }

  if (lowered.includes("fight") || lowered.includes("jamming")) {
    return ["ready", "move", "break"];
  }

  if (lowered.includes("scout") || lowered.includes("evidence")) {
    return ["watch", "mark", "log"];
  }

  return ["start", "work", "done"];
}

interface GameAppProps {
  initialState: GameState;
  mapLayout: WorldMapLayout;
  modelConfig: ModelConfig;
  onLogout: () => void;
  session: GameSession;
  startEntered?: boolean;
}

interface ServiceHoldState {
  durationMs: number;
  label: string;
  progress: number;
  startedAt: number;
  tone: PrimaryInteractionTone;
  verb: string;
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
    tag: "Route chaos",
    title: "Drive the dumbest heist van",
    text: "Load crates, bounce over curbs, and restock cabinets before the route turns into a livestream of your worst business choices."
  },
  {
    icon: Wrench,
    tag: "Machine beef",
    title: "Fix one cabinet, anger a city",
    text: "Rusty Starter is less a vending machine and more a public cry for snacks. Bolt on locks, cameras, neon, and questionable confidence."
  },
  {
    icon: ShieldAlert,
    tag: "Petty danger",
    title: "Every soda has consequences",
    text: "Rivals tag machines, inspectors develop opinions, and grey-market gum prints cash with the emotional stability of a comment section."
  },
  {
    icon: DollarSign,
    tag: "Snack empire",
    title: "Turn quarters into turf",
    text: "Each cabinet is a store, a billboard, and a tiny act of disrespect. Claim blocks until the whole city knows your terrible logo."
  }
];

const landingProductIds: ProductId[] = ["energy", "luxury_snack", "mystery_capsules", "glitch_gum"];

const landingRivals = [
  {
    name: "Redline Snacks",
    title: "Street crew with coupons",
    text: "Undercuts prices, tags cabinets, and treats your entire route like a public group chat."
  },
  {
    name: "Glassline VendCo",
    title: "Corporate snack villains",
    text: "Buys contracts, smiles too much, and sends inspections with the energy of a printer jam in a suit."
  },
  {
    name: "Night Market Supply",
    title: "After-hours nonsense",
    text: "Copies hot products, feeds weird demand, and makes neon districts profitable in the least normal way possible."
  }
];

const landingLoopSteps = [
  {
    title: "Buy suspiciously cheap stock",
    text: "Start with soda and chips, then watch the night crowd ask for products with names that sound like legal problems."
  },
  {
    title: "Claim a corner like it owes you money",
    text: "Every placement has rent, traffic, risk, and the loud spiritual energy of stealing a rival's favorite parking spot."
  },
  {
    title: "Run the route yourself",
    text: "Load crates, drive the van, restock cabinets, collect cash, and pretend the rattling sound means brand personality."
  },
  {
    title: "Answer alarms before the cabinet trends",
    text: "Sabotage, inspections, missed repairs, and rival stunts turn passive income into a tiny urban disaster with receipts."
  },
  {
    title: "Choose your extremely normal ending",
    text: "Go legit, become the snack syndicate, ally with a faction, cash out, or let the route collapse into beautiful accounting confetti."
  }
];

const landingScreens = [
  {
    id: "street",
    title: "Street-view snack crimes",
    text: "Walk the block, spot machines, service locations, and sprint toward alarms with the confidence of someone carrying too many cans."
  },
  {
    id: "ops",
    title: "Operations board of bad ideas",
    text: "Track stock, route tasks, cash, upgrades, rivals, contracts, crew, and which cabinet is currently acting famous."
  },
  {
    id: "alarm",
    title: "Alarm night meltdown",
    text: "When Redline pokes a machine, the city stops being a spreadsheet and becomes vending-flavored breaking news."
  }
];

const landingFunNotes = [
  "Your first machine is called Rusty Starter because Legal Liability Box tested poorly.",
  "The van is not fast. It is emotionally committed to arriving eventually.",
  "Grey-market gum: fictional, profitable, and absolutely not beating the allegations.",
  "Corporate rivals weaponize paperwork. Street rivals weaponize bad vibes. You weaponize snacks."
];

function LandingQuickFacts({ state }: { state?: GameState }) {
  const productCount = Object.keys(state?.products ?? products).length;
  const districtCount = Object.keys(state?.districts ?? districts).length;
  const machineCount = state ? Object.values(state.machines).filter((machine) => machine.placementStatus === "installed").length : "Citywide";

  return (
    <div className="landing-fact-strip" aria-label="Game scale">
      <div>
        <strong>{districtCount}</strong>
        <span>petty districts</span>
      </div>
      <div>
        <strong>{productCount}</strong>
        <span>stock oddities</span>
      </div>
      <div>
        <strong>{machineCount}</strong>
        <span>cabinet claims</span>
      </div>
      <div>
        <strong>{endgamePaths.length}</strong>
        <span>bad endings</span>
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
        <span>Five steps to snack internet fame</span>
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
        <span>Receipts from a bad idea</span>
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
        <span>Stock the unhinged menu</span>
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
        <span>Corner-to-corner chaos</span>
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
        <span>Bad ideas with save files</span>
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
        <span>Tiny print from the snack lawyer</span>
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
        <span>People taking snacks too personally</span>
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

const PLAYER_SPAWN: Vec2 = { x: -9, z: 5.9 };

// Maps distinctive event-log phrases to voiced lines. First match wins; the voice
// cue's own cooldown throttles repeats. Phrases are specific enough not to misfire.
const WORLD_TICK_HOURS = 0.04;
const WORLD_TICK_MS = 1500;

function GameApp({ initialState, mapLayout, modelConfig, onLogout, session, startEntered = false }: GameAppProps) {
  const multiplayerClient = useMemo(() => new MultiplayerClient(session.token), [session.token]);
  const [multiplayerStatus, setMultiplayerStatus] = useState<MultiplayerStatus>(() => multiplayerClient.getStatus());
  const { state, sendCommand, advanceWorld, save, reload, restart, saveStatus } = useGame({ initialState, multiplayerClient, multiplayerRole: multiplayerStatus.role, session });
  const [target, setTarget] = useState<SceneTarget | null>(null);
  const [entered, setEntered] = useState(() => startEntered);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [gameMenuOpen, setGameMenuOpen] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [empireNameDraft, setEmpireNameDraft] = useState("");
  const [seedDraft, setSeedDraft] = useState("");
  const [captionsEnabled, setCaptionsEnabled] = useState(() => {
    try {
      return window.localStorage.getItem("vendetta.captions") !== "off";
    } catch {
      return true;
    }
  });
  const [playerPosition, setPlayerPosition] = useState<Vec2>(() => ({ ...PLAYER_SPAWN }));
  const [playerHeadingDegrees, setPlayerHeadingDegrees] = useState(-180);
  const [showControls, setShowControls] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [voiceLine, setVoiceLine] = useState<{ speaker: string; subtitle: string } | null>(null);
  const [dismissedEndingPathId, setDismissedEndingPathId] = useState<string | null>(null);
  const heatVoiceTierRef = useRef(0);
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hasLockedOnce, setHasLockedOnce] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [sceneFeedback, setSceneFeedback] = useState<SceneFeedbackEvent | null>(null);
  const [serviceHold, setServiceHold] = useState<ServiceHoldState | null>(null);
  const [graphicsQuality, setGraphicsQualityState] = useState<GraphicsQuality>(() => loadGraphicsQuality());
  const [manualPaused, setManualPaused] = useState(false);
  const [playerHealth, setPlayerHealth] = useState<{ hp: number; dead: boolean }>({ hp: 100, dead: false });
  const [lookSettings, setLookSettings] = useState<LookSettings>(() => loadLookSettings());
  const gameMenuRef = useRef<HTMLDivElement | null>(null);
  const dailyBonusCheckedRef = useRef(false);
  const lastEventIdRef = useRef(state.eventLog[0]?.id ?? null);
  const lastMissionStepIdRef = useRef<string | null>(null);
  const lastServiceLocationIdRef = useRef<LocationId | null>(state.player.currentLocationId);
  const lastReportIdRef = useRef<string | null>(null);
  const serviceHoldTimeoutRef = useRef<number | null>(null);
  const serviceHoldIntervalRef = useRef<number | null>(null);
  const serviceHoldInteractionRef = useRef<PrimaryInteraction | null>(null);
  const missionStep = useMemo(() => getStarterMissionStep(state, playerPosition), [playerPosition, state]);
  const routeTask = useMemo(() => selectedRouteTask(state), [state]);
  const activeAlarm = useMemo(() => activeMachineAlarms(state)[0], [state]);
  const conflicts = useMemo(() => activeConflictEvents(state), [state]);
  const guidanceLocationId = activeAlarm?.locationId ?? routeTask?.locationId ?? missionStep.targetLocationId;
  const guidanceTargetPosition = useMemo(() => {
    const machineId = activeAlarm?.machineId ?? routeTask?.machineId;
    const machine = machineId ? state.machines[machineId] : undefined;
    const serviceLocation = machine ? state.locations[machine.locationId] : undefined;
    const placementLocation = guidanceLocationId ? state.locations[guidanceLocationId] : undefined;
    return guidanceServicePoint(mapLayout, serviceLocation, placementLocation);
  }, [activeAlarm?.machineId, guidanceLocationId, mapLayout, routeTask?.machineId, state]);
  const rawTarget = entered ? target : null;
  const guidedFallbackTarget = useMemo(() => {
    if (!entered || rawTarget || !guidanceLocationId) {
      return null;
    }

    const location = state.locations[guidanceLocationId];
    if (!location) {
      return null;
    }

    const targetPosition = guidanceTargetPosition ?? location.position;
    if (distance2d(playerPosition, targetPosition) > 8.5) {
      return null;
    }

    return targetForGuidedLocation(state, guidanceLocationId, routeTask, missionStep);
  }, [entered, guidanceLocationId, guidanceTargetPosition, missionStep, playerPosition, rawTarget, routeTask, state]);
  const activeTarget = rawTarget ?? guidedFallbackTarget;
  const activeTargetLocationId = useMemo(() => targetLocationId(activeTarget, state), [activeTarget, state]);
  const primaryInteraction = useMemo(() => getPrimaryInteraction(state, activeTarget), [activeTarget, state]);
  const primaryInteractionKey = useMemo(() => primaryInteractionSignature(primaryInteraction), [primaryInteraction]);
  const guidanceArrivedOverride = Boolean(guidanceLocationId && activeTargetLocationId === guidanceLocationId);
  const guidanceLabel = activeAlarm ? "Machine alarm" : routeTask?.title;
  const report = latestDayReport(state);
  const playerFaction = state.factions[state.playerFactionId];
  const installedPlayerMachines = Object.values(state.machines).filter((machine) => machine.ownerFactionId === state.playerFactionId && machine.placementStatus === "installed").length;
  const rivalMachines = Object.values(state.machines).filter((machine) => machine.ownerFactionId !== state.playerFactionId && machine.placementStatus === "installed").length;
  const starterArc = storyMissionArcs[0];
  const executedEnding = useMemo(
    () => Object.values(state.empire.endingExecutions).find((ending) => ending.status === "executed"),
    [state.empire.endingExecutions]
  );
  const executedEndingPath = useMemo(
    () => endgamePaths.find((path) => path.id === executedEnding?.pathId),
    [executedEnding?.pathId]
  );
  const runModifier = useMemo(() => activeRunModifier(state), [state]);
  const nextRunSeed = useMemo(() => Math.round(state.worldTimeHours * 1000) + (executedEnding?.pathId?.length ?? 0), [executedEnding?.pathId, state.worldTimeHours]);
  const nextRunModifierPreview = useMemo(() => chooseRunModifier(nextRunSeed), [nextRunSeed]);
  const runTraitCount = useMemo(() => Object.values(state.replay?.machineTraits ?? {}).reduce((sum, traits) => sum + traits.length, 0), [state.replay?.machineTraits]);
  const loudestRival = useMemo(() => {
    return Object.values(state.replay?.rivalMemory ?? {})
      .map((memory) => ({
        memory,
        total: memory.undercut + memory.sabotage + memory.expansion + memory.negotiation + memory.exposure + memory.disruption + memory.alarmConfronted
      }))
      .sort((a, b) => b.total - a.total)[0];
  }, [state.replay?.rivalMemory]);
  const strategyUnlocks = state.replay?.strategyUnlocks ?? [];
  const showDebugTools = useMemo(() => new URLSearchParams(window.location.search).has("debug"), []);
  const showPerfOverlay = useMemo(() => showDebugTools || new URLSearchParams(window.location.search).has("perf"), [showDebugTools]);
  const isLocalSession = session.local === true;
  const worldClockPaused = !entered || dashboardOpen || gameMenuOpen || showControls;
  // Guests never own the clock, so a guest hitting Pause must not freeze the shared
  // world; for them manualPaused only frees the cursor, it doesn't stop the sim.
  const worldPaused = worldClockPaused || (manualPaused && multiplayerStatus.role !== "guest");
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
  const showEndingOverlay = Boolean(entered && executedEnding && executedEndingPath && dismissedEndingPathId !== executedEnding.pathId);

  const addToast = useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setToasts((current) => [{ ...toast, id }, ...current].slice(0, 3));
    // Two-phase removal: flag as leaving (plays the exit animation), then drop it.
    window.setTimeout(() => {
      setToasts((current) => current.map((message) => (message.id === id ? { ...message, leaving: true } : message)));
      window.setTimeout(() => {
        setToasts((current) => current.filter((message) => message.id !== id));
      }, 240);
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

    // Share a full join link, not a bare code: an invited friend clicks it and
    // lands with the room pre-filled (see the ?room= effect below) instead of
    // having to find the game, find the join field, and type the code.
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(multiplayerRoom.code)}`;
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(shareUrl);
    }
    addToast({
      title: "Invite link copied",
      message: "Send it to a friend — one tap drops them into your room.",
      tone: "good"
    });
  }, [addToast, multiplayerRoom]);

  // Co-op invite links carry ?room=CODE. On load, pre-fill the join field from
  // it and strip the param so a refresh doesn't re-trigger, so an invited player
  // is one click from joining.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const invited = params.get("room");
      if (!invited) {
        return;
      }
      const normalized = invited.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      if (normalized) {
        setRoomCodeInput(normalized);
        addToast({ title: "Co-op invite", message: `Room ${normalized} is ready — join when your route loads.`, tone: "neutral" });
      }
      params.delete("room");
      const query = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
    } catch {
      // Non-fatal — the invite pre-fill is a convenience only.
    }
  }, [addToast]);

  // Keep the empire-name editor in sync with the authoritative state (e.g. after
  // a load or a remote rename), without clobbering what the player is typing.
  useEffect(() => {
    if (!gameMenuOpen) {
      setEmpireNameDraft(state.player.empireName ?? "");
    }
  }, [gameMenuOpen, state.player.empireName]);

  const handleRenameEmpire = useCallback(() => {
    const trimmed = empireNameDraft.replace(/\s+/g, " ").trim().slice(0, 28);
    if (!trimmed || trimmed === state.player.empireName) {
      return;
    }
    sendCommand({ type: "set_empire_name", actorId: state.playerFactionId, name: trimmed });
    addToast({ title: "Empire renamed", message: `You're running "${trimmed}" now.`, tone: "good" });
  }, [empireNameDraft, sendCommand, state.playerFactionId, state.player.empireName, addToast]);

  // growth-5: fetch the public weekly leaderboard (ranked by cash, shown by
  // player-chosen empire name). Lazy-loaded when the panel is opened.
  const handleLoadLeaderboard = useCallback(() => {
    setLeaderboardLoading(true);
    void fetchLeaderboard()
      .then((entries) => setLeaderboard(entries))
      .catch(() => setLeaderboard([]))
      .finally(() => setLeaderboardLoading(false));
  }, []);

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
    if (worldPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      advanceWorld(WORLD_TICK_HOURS);
    }, WORLD_TICK_MS);

    return () => window.clearInterval(timer);
  }, [advanceWorld, worldPaused]);

  useEffect(() => {
    saveLookSettings(lookSettings);
  }, [lookSettings]);

  const handlePlayerHealthChange = useCallback((hp: number, dead: boolean) => {
    setPlayerHealth((current) => (current.hp === hp && current.dead === dead ? current : { hp, dead }));
  }, []);

  // growth-4: daily comeback bonus + streak. On the first entry of a real-world
  // day, grant a streak-scaled cash bonus so a lapsed player has a reason to come
  // back tomorrow. Keyed off localStorage per profile; guests skip it (the host
  // claims the shared empire's bonus). The reducer clamps and owns the payout.
  useEffect(() => {
    if (!entered || dailyBonusCheckedRef.current || multiplayerStatus.role === "guest") {
      return;
    }
    dailyBonusCheckedRef.current = true;
    try {
      const key = `vendetta.daily.${session.profile.id}`;
      const todayIndex = Math.floor(Date.now() / 86_400_000);
      const raw = window.localStorage.getItem(key);
      const stored = raw ? (JSON.parse(raw) as { lastDayIndex?: number; streak?: number }) : null;
      if (stored && stored.lastDayIndex === todayIndex) {
        return; // already claimed today
      }
      const streak = stored && stored.lastDayIndex === todayIndex - 1 ? (stored.streak ?? 0) + 1 : 1;
      window.localStorage.setItem(key, JSON.stringify({ lastDayIndex: todayIndex, streak }));
      sendCommand({ type: "claim_daily_bonus", actorId: state.playerFactionId, streak });
      addToast({ title: `Day ${streak} streak`, message: "Comeback bonus dropped into your float — welcome back.", tone: "good" });
    } catch {
      // localStorage unavailable — skip the daily bonus silently.
    }
  }, [entered, multiplayerStatus.role, session.profile.id, sendCommand, state.playerFactionId, addToast]);

  useEffect(() => {
    const newestEvent = state.eventLog[0];
    if (!newestEvent || newestEvent.id === lastEventIdRef.current) {
      return;
    }

    lastEventIdRef.current = newestEvent.id;
    if (newestEvent.audioCue) {
      playTaggedCue(newestEvent.audioCue);
    } else {
      playEventCue(newestEvent.tone);
    }
    const voiceMatch = VOICE_EVENT_PATTERNS.find((entry) => entry.test.test(newestEvent.message));
    if (voiceMatch) {
      playVoiceCue(voiceMatch.trigger);
    }
    if (newestEvent.tone === "danger" && activeAlarm) {
      playFeedbackCue("sabotage");
      playVoiceCue("voice.rival_attack");
      setSceneFeedback({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        kind: "sabotage",
        machineId: activeAlarm.machineId,
        tone: "danger"
      });
    }
    // The day-report effect already toasts this; don't double up with a "Street update" echo.
    if (!/^Day \d+ report filed/.test(newestEvent.message)) {
      addToast({
        title: newestEvent.message.startsWith("ALARM") ? "Machine alarm" : newestEvent.message.startsWith("Alarm missed") ? "Alarm missed" : "Street update",
        message: newestEvent.message,
        tone: newestEvent.tone
      });
    }
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
    if (missionStep.id === "completed") {
      playVoiceCue("voice.mission_complete");
    }
    addToast({
      title: "Objective updated",
      message: missionStep.objective,
      tone: missionStep.id === "completed" ? "good" : "neutral"
    });
  }, [addToast, missionStep.id, missionStep.objective]);

  useEffect(() => {
    const nextLocationId = entered ? activeTargetLocationId : null;
    if (nextLocationId === lastServiceLocationIdRef.current) {
      return;
    }

    lastServiceLocationIdRef.current = nextLocationId;
    sendCommand({ type: "set_player_location", actorId: state.playerFactionId, locationId: nextLocationId });
  }, [activeTargetLocationId, entered, sendCommand, state]);

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

  useEffect(() => {
    setDismissedEndingPathId((current) => (current && current === executedEnding?.pathId ? current : null));
  }, [executedEnding?.pathId]);

  const handleRestart = useCallback((seed?: number) => {
    // Guard the seed: menu/panel callers pass a click event here, which must not
    // become the run seed. Only a real number (the ending preview) is honored.
    const runSeed = typeof seed === "number" && Number.isFinite(seed) ? seed : undefined;
    if (window.confirm("Restart this local MVP save?")) {
      restart(runSeed);
    }
  }, [restart]);

  // growth-2: the run seed fully determines a run, so it doubles as a shareable
  // "beat my city" challenge. Let players copy the current seed and start a run
  // from a pasted one.
  const handleCopySeed = useCallback(() => {
    const seed = state.replay?.runSeed;
    if (seed == null) {
      return;
    }
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav?.clipboard) {
      void nav.clipboard.writeText(String(seed));
    }
    addToast({ title: "Seed copied", message: `Seed ${seed} copied — share it as a challenge.`, tone: "good" });
  }, [state.replay?.runSeed, addToast]);

  const handlePlaySeed = useCallback(() => {
    const parsed = Number.parseInt(seedDraft.trim(), 10);
    if (!Number.isFinite(parsed)) {
      addToast({ title: "Seed", message: "Enter a numeric seed to play it.", tone: "neutral" });
      return;
    }
    if (window.confirm(`Start a fresh run from seed ${parsed}? This restarts the current save.`)) {
      restart(parsed);
    }
  }, [seedDraft, restart, addToast]);

  // growth-8: capture the first-person scene as a branded, shareable PNG. Reads
  // the WebGL canvas directly when the active graphics profile keeps it readable
  // and stamps the empire identity so a shared shot is unmistakably the player's.
  const handleScreenshot = useCallback(() => {
    const canvas =
      document.querySelector<HTMLCanvasElement>(".scene-mount canvas") ??
      document.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas || canvas.width === 0 || canvas.height === 0) {
      addToast({ title: "Photo", message: "Couldn't capture the view — try again once the scene is loaded.", tone: "neutral" });
      return;
    }
    try {
      const shot = document.createElement("canvas");
      shot.width = canvas.width;
      shot.height = canvas.height;
      const ctx = shot.getContext("2d");
      if (!ctx) {
        throw new Error("no 2d context");
      }
      ctx.drawImage(canvas, 0, 0);
      const empire = state.player?.empireName?.trim() || "Vendetta Vending";
      const label = `${empire} · Vendetta Vending`;
      const pad = Math.round(shot.width * 0.018);
      const fontSize = Math.max(14, Math.round(shot.width * 0.022));
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "alphabetic";
      const metrics = ctx.measureText(label);
      ctx.fillStyle = "rgba(6, 10, 14, 0.55)";
      ctx.fillRect(pad - 6, shot.height - pad - fontSize - 8, metrics.width + 16, fontSize + 14);
      ctx.fillStyle = "#3ee0c4";
      ctx.fillText(label, pad + 2, shot.height - pad - 2);
      const link = document.createElement("a");
      link.href = shot.toDataURL("image/png");
      link.download = `vendetta-${Date.now()}.png`;
      link.click();
      addToast({ title: "Photo saved", message: "Screenshot downloaded — show off your empire.", tone: "good" });
    } catch {
      addToast({ title: "Photo", message: "Couldn't capture the view on this device.", tone: "neutral" });
    }
  }, [addToast, state.player?.empireName]);

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
    window.setTimeout(() => playVoiceCue("voice.district_entry"), 900);
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

  const clearServiceHoldTimers = useCallback(() => {
    if (serviceHoldTimeoutRef.current !== null) {
      window.clearTimeout(serviceHoldTimeoutRef.current);
      serviceHoldTimeoutRef.current = null;
    }

    if (serviceHoldIntervalRef.current !== null) {
      window.clearInterval(serviceHoldIntervalRef.current);
      serviceHoldIntervalRef.current = null;
    }
  }, []);

  const cancelServiceHold = useCallback(() => {
    clearServiceHoldTimers();
    serviceHoldInteractionRef.current = null;
    setServiceHold(null);
  }, [clearServiceHoldTimers]);

  const completeServiceHold = useCallback(() => {
    const interaction = serviceHoldInteractionRef.current;
    clearServiceHoldTimers();
    serviceHoldInteractionRef.current = null;
    setServiceHold(null);

    if (!interaction) {
      return;
    }

    const executed = executePrimaryInteraction(interaction, {
      onCommand: sendCommandAtActiveTarget,
      onSave: save
    });
    if (executed && interaction.payoff) {
      addToast({
        title: interaction.label,
        message: interaction.risk ? `${interaction.payoff} Risk: ${interaction.risk}` : interaction.payoff,
        tone: interaction.tone ?? "good"
      });
    }
  }, [addToast, clearServiceHoldTimers, save, sendCommandAtActiveTarget]);

  const startServiceHold = useCallback(
    (interaction: PrimaryInteraction) => {
      const durationMs = Math.max(250, interaction.durationMs ?? 0);
      if (durationMs <= 250 || interaction.disabled) {
        const executed = executePrimaryInteraction(interaction, {
          onCommand: sendCommandAtActiveTarget,
          onSave: save
        });
        if (executed && interaction.payoff) {
          addToast({
            title: interaction.label,
            message: interaction.risk ? `${interaction.payoff} Risk: ${interaction.risk}` : interaction.payoff,
            tone: interaction.tone ?? "good"
          });
        }
        return;
      }

      unlockGameAudio();
      clearServiceHoldTimers();
      serviceHoldInteractionRef.current = interaction;
      const startedAt = performance.now();
      const nextHold: ServiceHoldState = {
        durationMs,
        label: interaction.label,
        progress: 0,
        startedAt,
        tone: interaction.tone ?? "neutral",
        verb: interaction.holdVerb ?? interaction.label
      };
      setServiceHold(nextHold);

      serviceHoldIntervalRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        setServiceHold((current) => (current ? { ...current, progress } : current));
      }, 45);

      serviceHoldTimeoutRef.current = window.setTimeout(() => {
        completeServiceHold();
      }, durationMs);
    },
    [addToast, clearServiceHoldTimers, completeServiceHold, save, sendCommandAtActiveTarget]
  );

  const handleVehicleDrive = useCallback(
    (vehicleId: VehicleId, position: Vec2, heading: number, distance: number) => {
      sendCommand({
        type: "drive_vehicle",
        actorId: state.playerFactionId,
        vehicleId,
        position,
        heading,
        distance
      });
    },
    [sendCommand, state.playerFactionId]
  );

  const handlePrimaryInteraction = useCallback(() => {
    if (primaryInteraction?.disabled) {
      return;
    }

    if (primaryInteraction?.durationMs && primaryInteraction.durationMs > 0) {
      startServiceHold(primaryInteraction);
      return;
    }

    const executed = executePrimaryInteraction(primaryInteraction, {
      onCommand: sendCommandAtActiveTarget,
      onSave: save
    });
    if (executed && primaryInteraction?.payoff) {
      addToast({
        title: primaryInteraction.label,
        message: primaryInteraction.risk ? `${primaryInteraction.payoff} Risk: ${primaryInteraction.risk}` : primaryInteraction.payoff,
        tone: primaryInteraction.tone ?? "good"
      });
    }
  }, [addToast, primaryInteraction, save, sendCommandAtActiveTarget, startServiceHold]);

  useEffect(() => {
    if (!entered) {
      return;
    }

    updateGameAmbience(state.factions[state.playerFactionId].heat, conflicts.length > 0);
  }, [conflicts.length, entered, state.factions, state.playerFactionId]);

  // Voiced heat warning when the player escalates into a higher, concerning heat
  // tier (Watched and above), aligned to the game's own heat tiers.
  useEffect(() => {
    if (!entered) {
      return;
    }
    const heat = state.factions[state.playerFactionId]?.heat ?? 0;
    const ranks = ["quiet", "noticed", "watched", "hot", "raid_weather"] as const;
    const rank = ranks.indexOf(heatTierFor(heat).id);
    const watchedRank = ranks.indexOf("watched");
    if (rank > heatVoiceTierRef.current && rank >= watchedRank) {
      playVoiceCue("voice.heat_warning");
    }
    heatVoiceTierRef.current = rank;
  }, [entered, state.factions, state.playerFactionId]);

  // Track pointer-lock so we can reassure the player after a reflex Escape press
  // (which exits look mode and otherwise reads as "the game froze").
  useEffect(() => {
    const onChange = () => {
      const locked = Boolean(document.pointerLockElement);
      setPointerLocked(locked);
      if (locked) {
        setHasLockedOnce(true);
      }
    };
    document.addEventListener("pointerlockchange", onChange);
    return () => document.removeEventListener("pointerlockchange", onChange);
  }, []);

  // Surface voiced lines as a lower-third subtitle (works even when muted).
  useEffect(() => {
    let clearTimer = 0;
    const onVoiceCue = (event: Event) => {
      const detail = (event as CustomEvent<{ speaker: string; subtitle: string; durationMs: number }>).detail;
      if (!detail) {
        return;
      }
      setVoiceLine({ speaker: detail.speaker, subtitle: detail.subtitle });
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => setVoiceLine(null), detail.durationMs);
    };
    window.addEventListener("vv:voice-cue", onVoiceCue);
    return () => {
      window.removeEventListener("vv:voice-cue", onVoiceCue);
      window.clearTimeout(clearTimer);
    };
  }, []);

  useEffect(() => () => clearServiceHoldTimers(), [clearServiceHoldTimers]);

  useEffect(() => {
    cancelServiceHold();
  }, [cancelServiceHold, entered, primaryInteractionKey]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!entered) {
        return;
      }

      const eventTarget = event.target instanceof HTMLElement ? event.target : null;
      const isUiControl = Boolean(eventTarget?.closest("input, textarea, select, button, [contenteditable='true']"));
      if (isUiControl) {
        return;
      }

      if (event.code === "KeyM" && !event.repeat) {
        event.preventDefault();
        setDashboardOpen((current) => !current);
        return;
      }

      if (event.code === "KeyP" && !event.repeat) {
        event.preventDefault();
        setManualPaused((current) => {
          const next = !current;
          if (next && document.pointerLockElement) {
            document.exitPointerLock();
          }
          return next;
        });
        return;
      }

      if (event.code !== "KeyE") {
        return;
      }

      if (event.repeat) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      unlockGameAudio();
      handlePrimaryInteraction();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [entered, handlePrimaryInteraction]);

  // Click-to-interact (ux-2): while the pointer is locked (i.e. aiming), a
  // left-click mirrors the E key, so players who instinctively click the thing
  // they're aiming at get the same result. Only bound while locked, so the click
  // that acquires pointer lock doesn't also fire an interaction.
  useEffect(() => {
    if (!entered || !pointerLocked) {
      return;
    }
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      unlockGameAudio();
      handlePrimaryInteraction();
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [entered, pointerLocked, handlePrimaryInteraction]);

  // First-run controls legend: auto-show once after entering the district, then
  // remember it so returning players aren't nagged (still recallable via the ? button).
  useEffect(() => {
    if (!entered) {
      return;
    }
    let alreadySeen = false;
    try {
      alreadySeen = window.localStorage.getItem("vv:seen-controls") === "1";
    } catch {
      alreadySeen = false;
    }
    if (alreadySeen) {
      return;
    }
    setShowControls(true);
    try {
      window.localStorage.setItem("vv:seen-controls", "1");
    } catch {
      // ignore storage failures (private mode etc.)
    }
    const timer = window.setTimeout(() => setShowControls(false), 30000);
    return () => window.clearTimeout(timer);
  }, [entered]);

  // Learn-to-move beat: clears the movement coach once the player actually walks
  // a short distance from the fixed spawn point.
  useEffect(() => {
    if (hasMoved) {
      return;
    }
    const dx = playerPosition.x - PLAYER_SPAWN.x;
    const dz = playerPosition.z - PLAYER_SPAWN.z;
    if (dx * dx + dz * dz > 2.25) {
      setHasMoved(true);
    }
  }, [hasMoved, playerPosition]);

  const gameShellClassName = `${serviceHold ? "game-shell servicing" : "game-shell"}${entered ? "" : " landing-active"}`;

  return (
    <main className={gameShellClassName}>
      {entered ? (
        <Suspense fallback={<div className="scene-loading" role="status">Loading city...</div>}>
          <ThreeScene
            graphicsQuality={graphicsQuality}
            guidanceLocationId={guidanceLocationId}
            mapLayout={mapLayout}
            modelConfig={modelConfig}
            state={state}
            paused={worldPaused}
            lookSensitivity={lookSettings.sensitivity}
            invertLookY={lookSettings.invertY}
            feedbackEvent={sceneFeedback}
            onVehicleDrive={handleVehicleDrive}
            onPlayerPositionChange={setPlayerPosition}
            onPlayerHeadingChange={setPlayerHeadingDegrees}
            onPlayerHealthChange={handlePlayerHealthChange}
            onTargetChange={setTarget}
          />
        </Suspense>
      ) : (
        <div className="scene-loading scene-loading-idle" aria-hidden="true" />
      )}
      <div className="world-vignette" aria-hidden="true" />
      {entered && <Hud feedbackEvent={sceneFeedback} state={state} health={playerHealth} />}
      {entered && <MissionTracker compact={dashboardOpen} state={state} playerPosition={playerPosition} />}
      {entered && (
        <div
          className={`crosshair${primaryInteraction && !primaryInteraction.disabled ? " crosshair-active" : activeTarget ? " crosshair-disabled" : ""}`}
          aria-hidden="true"
        />
      )}
      {entered && hasLockedOnce && !pointerLocked && !dashboardOpen && !gameMenuOpen && !serviceHold && (
        <div className="pointer-lock-hint" aria-hidden="true">Click to look around</div>
      )}
      {entered && manualPaused && (
        <div className="pause-overlay" role="dialog" aria-label="Paused" aria-modal="true">
          <div className="pause-overlay-card">
            <h2>Paused</h2>
            <p>Press <kbd>P</kbd> to resume{multiplayerStatus.role === "guest" ? "" : " — the world is frozen"}.</p>
            <button onClick={() => setManualPaused(false)} type="button">Resume</button>
          </div>
        </div>
      )}
      {entered && saveStatus !== "idle" && (
        <div className={`save-indicator save-${saveStatus}`} role="status" aria-live="polite">
          {saveStatus === "saving"
            ? "Saving…"
            : saveStatus === "saved"
              ? "Saved"
              : saveStatus === "conflict"
                ? "Syncing latest save…"
                : saveStatus === "error"
                  ? "Save failed · device storage is full"
                  : "Offline · saved on this device"}
        </div>
      )}
      {entered && voiceLine && captionsEnabled && (
        <div className="voice-subtitle" aria-live="polite">
          {voiceLine.speaker && <span className="voice-subtitle-speaker">{voiceLine.speaker}</span>}
          <span className="voice-subtitle-line">{voiceLine.subtitle}</span>
        </div>
      )}
      {entered && !hasMoved && !showControls && (
        <div className="move-coach" aria-live="polite">
          Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to move · <kbd>Mouse</kbd> to look · <kbd>Click</kbd> to lock the cursor
        </div>
      )}
      {entered && showControls && (
        <div className="controls-legend" role="dialog" aria-label="Controls">
          <header>
            <span>Controls</span>
            <button
              aria-label="Close controls"
              className="controls-legend-close"
              onClick={() => setShowControls(false)}
              type="button"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </header>
          <ul>
            <li><span className="controls-legend-keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span>Move</span></li>
            <li><span className="controls-legend-keys"><kbd>Mouse</kbd></span><span>Look around</span></li>
            <li><span className="controls-legend-keys"><kbd>←</kbd><kbd>→</kbd></span><span>Turn camera (no mouse)</span></li>
            <li><span className="controls-legend-keys"><kbd>Click</kbd></span><span>Lock cursor · <kbd>Esc</kbd> frees it</span></li>
            <li><span className="controls-legend-keys"><kbd>Shift</kbd></span><span>Sprint</span></li>
            <li><span className="controls-legend-keys"><kbd>Space</kbd></span><span>Jump · Brake while driving</span></li>
            <li><span className="controls-legend-keys"><kbd>E</kbd></span><span>Interact</span></li>
            <li><span className="controls-legend-keys"><kbd>F</kbd></span><span>Drive / exit vehicle</span></li>
            <li><span className="controls-legend-keys"><kbd>V</kbd></span><span>First / third person</span></li>
            <li><span className="controls-legend-keys"><kbd>M</kbd></span><span>Dashboard &amp; map</span></li>
            <li><span className="controls-legend-keys"><kbd>P</kbd></span><span>Pause</span></li>
          </ul>
        </div>
      )}
      {showEndingOverlay && executedEnding && executedEndingPath && (
        <section className="ending-overlay" role="dialog" aria-modal="true" aria-label={`${executedEndingPath.title} ending`}>
          <div className="ending-panel">
            <span className="landing-kicker">Ending executed</span>
            <h2>{executedEndingPath.title}</h2>
            <p>{executedEnding.summary ?? executedEndingPath.consequence}</p>
            <div className="ending-stat-grid" aria-label="Run summary">
              <div>
                <span>Cash</span>
                <strong>${Math.round(playerFaction.money)}</strong>
              </div>
              <div>
                <span>Heat</span>
                <strong>{Math.round(playerFaction.heat)}</strong>
              </div>
              <div>
                <span>Your machines</span>
                <strong>{installedPlayerMachines}</strong>
              </div>
              <div>
                <span>Day</span>
                <strong>{Math.max(1, Math.floor(state.worldTimeHours / 24) + 1)}</strong>
              </div>
              <div>
                <span>Run</span>
                <strong>{runModifier.name}</strong>
              </div>
              <div>
                <span>Traits</span>
                <strong>{runTraitCount}</strong>
              </div>
              <div>
                <span>Rivalry</span>
                <strong>{loudestRival ? state.factions[loudestRival.memory.factionId]?.name ?? loudestRival.memory.factionId : "Quiet"}</strong>
              </div>
              <div>
                <span>Unlocks</span>
                <strong>{strategyUnlocks.length}</strong>
              </div>
            </div>
            <div className="ending-replay-card">
              <span>Next run preview</span>
              <strong>{nextRunModifierPreview.name}</strong>
              <p>{nextRunModifierPreview.description}</p>
              {strategyUnlocks.length > 0 && <p>Recent unlocks: {strategyUnlocks.slice(-3).join(" / ")}</p>}
              {strategyUnlocks.length > 0 && (
                <p className="ending-ng-plus">New Game+: {strategyUnlocks.length} perk{strategyUnlocks.length === 1 ? "" : "s"} carry over (+${Math.min(150, strategyUnlocks.length * 25)} starting cash).</p>
              )}
            </div>
            <div className="ending-seed-row" role="group" aria-label="Run seed">
              <span>Seed <strong>{state.replay?.runSeed ?? "—"}</strong></span>
              <button type="button" onClick={handleCopySeed}>Copy</button>
              <input
                aria-label="Play a seed"
                inputMode="numeric"
                placeholder="Play a seed…"
                value={seedDraft}
                onChange={(event) => setSeedDraft(event.target.value.replace(/[^0-9-]/g, ""))}
              />
              <button type="button" disabled={!seedDraft.trim()} onClick={handlePlaySeed}>Play</button>
            </div>
            <div className="ending-actions">
              <button
                className="ending-share"
                onClick={() => {
                  const day = Math.max(1, Math.floor(state.worldTimeHours / 24) + 1);
                  const rivalName = loudestRival
                    ? state.factions[loudestRival.memory.factionId]?.name ?? loudestRival.memory.factionId
                    : "nobody worth naming";
                  const empire = state.player?.empireName?.trim();
                  const who = empire ? `${empire}` : "My terrible logo";
                  const seed = state.replay?.runSeed;
                  const caption =
                    `Vendetta Vending — ${executedEndingPath.title}\n` +
                    `Day ${day}: $${Math.round(playerFaction.money).toLocaleString()}, ${installedPlayerMachines} machines, heat ${Math.round(playerFaction.heat)}. ` +
                    `My loudest rival was ${rivalName}. ${who} owns the block.\n` +
                    `${seed != null ? `Beat my city — seed ${seed}. ` : ""}${window.location.origin}`;
                  const nav = typeof navigator !== "undefined" ? navigator : null;
                  if (nav?.share) {
                    void nav.share({ title: "Vendetta Vending", text: caption }).catch(() => {});
                  } else if (nav?.clipboard) {
                    void nav.clipboard.writeText(caption);
                    addToast({ title: "Run card copied", message: "Your empire brag is on the clipboard — go post it.", tone: "good" });
                  } else {
                    addToast({ title: "Run card", message: caption, tone: "neutral" });
                  }
                }}
                type="button"
              >
                Share empire card
              </button>
              <button onClick={() => setDismissedEndingPathId(executedEnding.pathId)} type="button">
                Keep running route
              </button>
              <button className="danger" onClick={() => handleRestart(nextRunSeed)} type="button">
                Restart run
              </button>
            </div>
          </div>
        </section>
      )}
      {entered && (
        <button
          aria-label={showControls ? "Hide controls" : "Show controls"}
          aria-pressed={showControls}
          className="controls-help-toggle"
          onClick={() => setShowControls((current) => !current)}
          type="button"
        >
          ?
        </button>
      )}
      {entered && (
        <button
          aria-label="Save a screenshot"
          className="screenshot-toggle"
          onClick={handleScreenshot}
          type="button"
        >
          📷
        </button>
      )}
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
              <span>{isLocalSession ? "Local save" : "Signed in"}</span>
              <strong>{session.profile.name}</strong>
            </div>
            <div className="game-menu-empire" role="group" aria-label="Empire identity">
              <label htmlFor="empire-name-input">Empire name</label>
              <div className="game-menu-empire-row">
                <input
                  id="empire-name-input"
                  aria-label="Empire name"
                  maxLength={28}
                  placeholder="Name your empire"
                  value={empireNameDraft}
                  onChange={(event) => setEmpireNameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRenameEmpire();
                    }
                  }}
                />
                <button
                  disabled={!empireNameDraft.trim() || empireNameDraft.replace(/\s+/g, " ").trim() === (state.player.empireName ?? "")}
                  onClick={handleRenameEmpire}
                  type="button"
                >
                  Save
                </button>
              </div>
            </div>
            <button
              aria-pressed={captionsEnabled}
              role="menuitem"
              type="button"
              onClick={() => {
                setCaptionsEnabled((current) => {
                  const next = !current;
                  try {
                    window.localStorage.setItem("vendetta.captions", next ? "on" : "off");
                  } catch {
                    // ignore persistence failure — the toggle still works this session
                  }
                  return next;
                });
              }}
            >
              Captions: {captionsEnabled ? "On" : "Off"}
            </button>
            <div className="game-menu-leaderboard" role="group" aria-label="Leaderboard">
              <div className="game-menu-leaderboard-head">
                <span>Top empires · this week</span>
                <button type="button" onClick={handleLoadLeaderboard} disabled={leaderboardLoading}>
                  {leaderboardLoading ? "Loading…" : leaderboard ? "Refresh" : "Load"}
                </button>
              </div>
              {leaderboard && leaderboard.length > 0 && (
                <ol className="game-menu-leaderboard-list">
                  {leaderboard.map((entry) => (
                    <li key={`${entry.rank}-${entry.empireName}`}>
                      <span className="lb-rank">{entry.rank}</span>
                      <span className="lb-name">{entry.empireName}</span>
                      <span className="lb-cash">${entry.cash.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
              {leaderboard && leaderboard.length === 0 && (
                <p className="game-menu-leaderboard-empty">No ranked empires yet — name your empire and bank some cash to appear.</p>
              )}
            </div>
            {!isLocalSession && <div className="multiplayer-menu-panel" role="group" aria-label="Multiplayer room">
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
            </div>}
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
            <div className="graphics-quality-control" aria-label="Graphics quality">
              <span>
                <SlidersHorizontal size={16} aria-hidden="true" />
                Graphics
              </span>
              <div className="graphics-quality-options" role="group" aria-label="Graphics quality">
                {graphicsQualityModes.map((quality) => (
                  <button
                    aria-pressed={graphicsQuality === quality}
                    className={graphicsQuality === quality ? "quality-button active" : "quality-button"}
                    key={quality}
                    onClick={() => setGraphicsQuality(quality)}
                    type="button"
                  >
                    {graphicsQualityLabels[quality]}
                  </button>
                ))}
              </div>
            </div>
            <div className="look-settings-control" aria-label="Look controls">
              <label className="look-settings-row">
                <span>Look sensitivity</span>
                <input
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={lookSettings.sensitivity}
                  aria-label="Look sensitivity"
                  onChange={(event) => setLookSettings((current) => ({ ...current, sensitivity: Number(event.target.value) }))}
                />
                <strong>{lookSettings.sensitivity.toFixed(2)}×</strong>
              </label>
              <button
                aria-pressed={lookSettings.invertY}
                className={lookSettings.invertY ? "look-toggle active" : "look-toggle"}
                onClick={() => setLookSettings((current) => ({ ...current, invertY: !current.invertY }))}
                type="button"
              >
                Invert vertical look {lookSettings.invertY ? "· On" : "· Off"}
              </button>
              <span className="look-settings-hint">Arrow keys turn the camera for mouse-free play.</span>
            </div>
            {entered && (
              <button
                onClick={() => {
                  setManualPaused((current) => !current);
                  setGameMenuOpen(false);
                }}
                role="menuitem"
                type="button"
              >
                {manualPaused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
                {manualPaused ? "Resume" : "Pause"}
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
      {entered && (
        <GuidanceArrow
          arrivedOverride={guidanceArrivedOverride}
          label={guidanceLabel}
          state={state}
          targetLocationId={guidanceLocationId}
          targetPosition={guidanceTargetPosition}
          playerHeadingDegrees={playerHeadingDegrees}
          playerPosition={playerPosition}
        />
      )}
      {entered && activeTarget && primaryInteraction && (
        <div className={`target-prompt ${primaryInteraction.disabled ? "disabled" : ""} ${serviceHold ? "working" : ""} ${activeTarget === guidedFallbackTarget ? "guided" : ""}`}>
          <span className="target-name">{activeTarget.label}</span>
          <span className="target-action">
            <kbd>E</kbd>
            {primaryInteraction.label}
          </span>
          {(primaryInteraction.payoff || primaryInteraction.risk) && (
            <span className="target-stakes">
              {primaryInteraction.payoff && <em className="good">{primaryInteraction.payoff}</em>}
              {primaryInteraction.risk && <em className={primaryInteraction.tone === "danger" ? "danger" : "warning"}>{primaryInteraction.risk}</em>}
            </span>
          )}
          {serviceHold && (
            <span className={`target-work-meter ${serviceHold.tone}`} aria-label={`${serviceHold.verb} ${Math.round(serviceHold.progress * 100)}%`}>
              <span>
                {serviceHold.verb}
                <strong>{Math.round(serviceHold.progress * 100)}%</strong>
              </span>
              <em>{serviceHoldStage(serviceHold)}</em>
              <i aria-hidden="true">
                <b style={{ width: `${serviceHold.progress * 100}%` }} />
              </i>
              <span className="target-work-cues" aria-hidden="true">
                {serviceHoldCueLabels(serviceHold.verb).map((label, index, labels) => (
                  <span className={serviceHold.progress >= index / labels.length ? "active" : ""} key={label}>
                    {label}
                  </span>
                ))}
              </span>
            </span>
          )}
          {primaryInteraction.disabled && primaryInteraction.disabledReason && <span className="target-reason">{primaryInteraction.disabledReason}</span>}
        </div>
      )}
      {!entered && (
        <section className="entry-overlay landing-overlay" aria-label="Vendetta Vending landing page">
          <div className="landing-panel">
            <section className="landing-hero-stage" aria-label="Vendetta Vending cinematic introduction">
              <Suspense fallback={<div className="landing-cinematic-placeholder" aria-hidden="true" />}>
                <LandingCinematicScene modelConfig={modelConfig} />
              </Suspense>
              <div className="landing-copy landing-hero-content">
                <span className="landing-kicker">Vending crime, but make it snack beef</span>
                <h1>Vendetta Vending</h1>
                <p>
                  Build the least reasonable snack empire in town. Fix busted machines, sell products with suspicious names, dodge rival nonsense, and defend every cabinet like it just posted about you.
                </p>
                <div className="landing-quip-row" aria-label="Game highlights">
                  <span>
                    <Map size={15} aria-hidden="true" />
                    6 petty districts
                  </span>
                  <span>
                    <Zap size={15} aria-hidden="true" />
                    Legal-ish choices
                  </span>
                  <span>
                    <Sparkles size={15} aria-hidden="true" />
                    Cabinet beef simulator
                  </span>
                </div>
                <div className="landing-viral-strip" aria-label="Landing page hooks">
                  <span>one busted machine</span>
                  <span>zero chill</span>
                  <span>infinite sidewalk drama</span>
                </div>
                <button className="entry-button landing-primary" onClick={handleEnterDistrict} type="button">
                  <Play size={18} aria-hidden="true" />
                  Start Snack Beef
                </button>
                <LandingQuickFacts state={state} />
              </div>
            </section>
            <div className="landing-lower-grid">
              <div className="landing-main-column">
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
        <Suspense fallback={<aside className="dashboard dashboard-loading" role="status">Loading ops...</aside>}>
          <Dashboard
            state={state}
            onCommand={sendCommandWithFeedback}
            showDebug={showDebugTools}
          />
        </Suspense>
      )}
      {entered && <Minimap state={state} mapLayout={mapLayout} playerPosition={playerPosition} playerHeadingDegrees={playerHeadingDegrees} guidanceLocationId={guidanceLocationId} target={activeTarget} />}
      {entered && <InteractionPanel state={state} target={activeTarget} onCommand={sendCommandAtActiveTarget} onSave={save} onReload={reload} onRestart={handleRestart} />}
      {entered && <DesktopFirstNotice />}
      <ToastStack docked={dashboardOpen} messages={toasts} />
      <PerformanceOverlay enabled={showPerfOverlay} />
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
  const actionLabel = accessMode === "register" ? "Create profile" : "Load profile";
  const busy = authState.status === "loading" || submitting;

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
          initialState: remote.save?.state ?? createInitialState(Date.now())
        });
      })
      .catch(() => {
        clearStoredGameSession();
        if (!cancelled) {
          setAuthState({ status: "login", message: "Remote session unavailable. Log in again or use Quick Start for local play." });
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
            initialState: response.save?.state ?? createInitialState(Date.now())
          });
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : `${actionLabel} failed.`;
          setAuthState({
            status: "login",
            message: message.includes("DATABASE_URL")
              ? "Remote database is not configured. Use Quick Start for local play, or set DATABASE_URL before logging in."
              : message
          });
        })
        .finally(() => setSubmitting(false));
    },
    [accessMode, actionLabel, credentials.name, credentials.pin]
  );

  const handleQuickStart = useCallback(() => {
    clearStoredGameSession();
    unlockGameAudio();
    startGameAmbience();
    setSubmitting(false);
    setAuthState({
      status: "ready",
      session: {
        local: true,
        profile: {
          id: "local-demo",
          name: "Local Route"
        },
        saveRevision: null,
        saveUpdatedAt: null,
        token: "local-demo"
      },
      initialState: loadGame()
    });
  }, []);

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
    return <GameApp key={authState.session.profile.id} initialState={authState.initialState} mapLayout={mapLayout} modelConfig={modelConfig} onLogout={handleLogout} session={authState.session} startEntered={authState.session.local === true} />;
  }

  return (
    <main className="access-shell">
      <section className="access-landing" aria-label="Vendetta Vending access">
        <section className="access-cinematic-stage landing-hero-stage" aria-label="Vendetta Vending cinematic access">
          <LandingCinematicScene modelConfig={modelConfig} />
          <div className="access-hero landing-copy landing-hero-content">
            <span className="landing-kicker">First-person vending crime comedy</span>
            <h1>Vendetta Vending</h1>
            <p className="access-story">
              Start with a clattering route van, one busted snack machine, and a business plan that should not have survived breakfast. Stock weird products, answer alarms, outplay rivals, and make every corner smell like profit and bad decisions.
            </p>
            <div className="landing-quip-row" aria-label="Game highlights">
              <span>
                <Truck size={15} aria-hidden="true" />
                Drive the chaos van
              </span>
              <span>
                <ShieldAlert size={15} aria-hidden="true" />
                Defend petty cabinets
              </span>
              <span>
                <Sparkles size={15} aria-hidden="true" />
                Sell suspicious gum
              </span>
            </div>
            <div className="landing-viral-strip" aria-label="Landing page hooks">
              <span>one busted machine</span>
              <span>zero chill</span>
              <span>infinite sidewalk drama</span>
            </div>
            <LandingQuickFacts />
          </div>
          <form className="access-panel" onSubmit={handleLogin}>
            <div>
              <h2>Start a Route</h2>
              <span>{authState.status === "loading" ? "Loading protected save" : accessMode === "register" ? "Create game profile" : "Load game profile"}</span>
            </div>
            <div className="access-mode-tabs" aria-label="Game access mode">
              <button
                aria-pressed={accessMode === "login"}
                disabled={busy}
                onClick={() => switchAccessMode("login")}
                type="button"
              >
                Return
              </button>
              <button
                aria-pressed={accessMode === "register"}
                disabled={busy}
                onClick={() => switchAccessMode("register")}
                type="button"
              >
                New profile
              </button>
            </div>
            <label>
              Player name
              <input
                autoComplete="username"
                disabled={busy}
                maxLength={36}
                value={credentials.name}
                onChange={(event) => setCredentials((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <label>
              PIN
              <input
                autoComplete={accessMode === "register" ? "new-password" : "current-password"}
                disabled={busy}
                inputMode="numeric"
                maxLength={12}
                type="password"
                value={credentials.pin}
                onChange={(event) => setCredentials((current) => ({ ...current, pin: event.target.value }))}
              />
            </label>
            {authState.status === "login" && authState.message && <p>{authState.message}</p>}
            <button disabled={busy} type="submit">
              {submitting ? `${actionLabel}...` : actionLabel}
            </button>
            <button className="access-demo-button" disabled={busy} onClick={handleQuickStart} type="button">
              Quick Start: Cause Problems
            </button>
            <span className="access-demo-note">Instant local save. No database required.</span>
            <span className="access-privacy-note">
              A named profile syncs your empire to the server so you can resume anywhere. That save
              (profile name + progress) is stored on the backend and visible to the game operator.
              Prefer Quick Start for a fully local, on-device save.
            </span>
          </form>
        </section>
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

interface PlayerAudioPrefs {
  muted: boolean;
  volume: number;
}

interface LookSettings {
  sensitivity: number;
  invertY: boolean;
}

const LOOK_PREFS_KEY = "vv:look-prefs";

function loadLookSettings(): LookSettings {
  try {
    const raw = window.localStorage.getItem(LOOK_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LookSettings>;
      return {
        sensitivity: typeof parsed.sensitivity === "number" ? Math.max(0.25, Math.min(3, parsed.sensitivity)) : 1,
        invertY: Boolean(parsed.invertY)
      };
    }
  } catch {
    // ignore unreadable/private-mode storage
  }
  return { sensitivity: 1, invertY: false };
}

function saveLookSettings(settings: LookSettings): void {
  try {
    window.localStorage.setItem(LOOK_PREFS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage failures (private mode etc.)
  }
}

const AUDIO_PREFS_KEY = "vv:audio-prefs";

function loadAudioPrefs(): PlayerAudioPrefs {
  try {
    const raw = window.localStorage.getItem(AUDIO_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerAudioPrefs>;
      return {
        muted: Boolean(parsed.muted),
        volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(1, parsed.volume)) : 1
      };
    }
  } catch {
    // ignore unreadable/private-mode storage
  }
  return { muted: false, volume: 1 };
}

function AudioControl({
  muted,
  volume,
  onToggleMute,
  onVolumeChange
}: {
  muted: boolean;
  volume: number;
  onToggleMute: () => void;
  onVolumeChange: (volume: number) => void;
}) {
  return (
    <div className="audio-control">
      <button
        aria-label={muted ? "Unmute audio" : "Mute audio"}
        aria-pressed={muted}
        className={muted ? "audio-control-button muted" : "audio-control-button"}
        onClick={onToggleMute}
        type="button"
      >
        {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
      </button>
      <input
        aria-label="Master volume"
        className="audio-control-slider"
        max={1}
        min={0}
        onChange={(event) => onVolumeChange(Number(event.target.value))}
        step={0.05}
        type="range"
        value={muted ? 0 : volume}
      />
    </div>
  );
}

function PerformanceOverlay({ enabled }: { enabled: boolean }) {
  const [snapshot, setSnapshot] = useState(() => getPerfSnapshot());

  useEffect(() => {
    if (!enabled) {
      return;
    }

    setSnapshot(getPerfSnapshot());
    const timer = window.setInterval(() => setSnapshot(getPerfSnapshot()), 800);
    return () => window.clearInterval(timer);
  }, [enabled]);

  if (!enabled) {
    return null;
  }

  const metrics = Object.entries(snapshot)
    .sort(([, first], [, second]) => second.last - first.last)
    .slice(0, 12);

  return (
    <aside className="perf-overlay" aria-label="Performance metrics">
      <strong>Perf</strong>
      {metrics.length === 0 ? (
        <span className="perf-empty">waiting</span>
      ) : (
        metrics.map(([name, metric]) => {
          const average = metric.count > 0 ? metric.total / metric.count : 0;
          return (
            <span className="perf-row" key={name}>
              <em>{name}</em>
              <b>{metric.last.toFixed(metric.last >= 10 ? 0 : 2)}</b>
              <i>{average.toFixed(average >= 10 ? 0 : 2)} avg</i>
            </span>
          );
        })
      )}
    </aside>
  );
}

function DesktopFirstNotice() {
  return (
    <aside className="desktop-first-notice" aria-label="Desktop play notice">
      <strong>Desktop route mode</strong>
      <span>Use a keyboard and mouse window for driving, aiming, and service timing.</span>
    </aside>
  );
}

export function App() {
  const [mapLayout, setMapLayout] = useState<WorldMapLayout>(() => loadWorldMapLayout());
  const [audioConfig, setAudioConfig] = useState<AudioConfig>(() => createDefaultAudioConfig());
  const [audioPrefs, setAudioPrefs] = useState<PlayerAudioPrefs>(() => loadAudioPrefs());
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => loadModelConfig());
  const isAdminRoute = window.location.pathname === "/admin";

  useEffect(() => {
    let cancelled = false;
    loadRemoteMapLayout()
      .then((remote) => {
        if (!cancelled && remote.layout) {
          // Merge the DB layout over the current code defaults so newly-authored
          // content (parks, buildings filling empty blocks) survives a stale save.
          const merged = normalizeLayout(remote.layout);
          saveWorldMapLayout(merged);
          setMapLayout(merged);
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
    // Player master settings overlay the admin-authored mixer rather than replacing it.
    const masterVolume = Math.max(0, Math.min(1, audioConfig.mixer.masterVolume * audioPrefs.volume));
    configureGameAudio({
      ...audioConfig,
      mixer: {
        ...audioConfig.mixer,
        muted: audioConfig.mixer.muted || audioPrefs.muted,
        masterVolume
      }
    });
  }, [audioConfig, audioPrefs]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(audioPrefs));
    } catch {
      // ignore unwritable/private-mode storage
    }
  }, [audioPrefs]);

  const handleToggleMute = useCallback(() => {
    setAudioPrefs((prefs) => {
      const muted = !prefs.muted;
      return { muted, volume: !muted && prefs.volume <= 0 ? 0.8 : prefs.volume };
    });
  }, []);

  const handleVolumeChange = useCallback((volume: number) => {
    setAudioPrefs(() => ({ muted: volume <= 0, volume }));
  }, []);

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
      <Suspense fallback={<main className="admin-loading" role="status">Loading admin tools...</main>}>
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
      </Suspense>
    );
  }

  return (
    <>
      <GameAccessGate mapLayout={mapLayout} modelConfig={modelConfig} />
      <AudioControl muted={audioPrefs.muted} onToggleMute={handleToggleMute} onVolumeChange={handleVolumeChange} volume={audioPrefs.volume} />
    </>
  );
}
