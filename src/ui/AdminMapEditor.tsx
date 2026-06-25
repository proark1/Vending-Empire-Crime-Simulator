import { AlertTriangle, Building2, CircleDot, Eye, Map, RotateCcw, Route, Save, Square, Trees, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent, ReactNode } from "react";
import { worldBounds, type BuildingVisualStyle, type WorldDecorationKind, type WorldMapLayout } from "../game/content/world";
import { createDefaultWorldMapLayout, validateWorldMapLayout } from "../game/world/mapLayoutStorage";

type EditableLayer = "roads" | "buildings" | "backdropBuildings" | "decorations" | "patrolZones";

interface AdminMapEditorProps {
  initialLayout: WorldMapLayout;
  onReset: () => void;
  onSave: (layout: WorldMapLayout) => void;
}

interface Selection {
  index: number;
  layer: EditableLayer;
}

interface DragState extends Selection {
  offsetX: number;
  offsetZ: number;
}

const editableLayers: Array<{ icon: ReactNode; id: EditableLayer; label: string }> = [
  { id: "roads", label: "Roads", icon: <Route size={16} aria-hidden="true" /> },
  { id: "buildings", label: "Buildings", icon: <Building2 size={16} aria-hidden="true" /> },
  { id: "decorations", label: "Props", icon: <Trees size={16} aria-hidden="true" /> },
  { id: "patrolZones", label: "Patrols", icon: <CircleDot size={16} aria-hidden="true" /> },
  { id: "backdropBuildings", label: "Backdrops", icon: <Square size={16} aria-hidden="true" /> }
];

const buildingStyles: BuildingVisualStyle[] = ["garage", "supplier", "laundromat", "gym", "arcade", "transit", "rival"];
const decorationKinds: WorldDecorationKind[] = ["billboard", "bollard", "dumpster", "planter", "streetlight", "utility_box"];

const mapWidth = worldBounds.maxX - worldBounds.minX;
const mapDepth = worldBounds.maxZ - worldBounds.minZ;

function cloneLayout(layout: WorldMapLayout): WorldMapLayout {
  return JSON.parse(JSON.stringify(layout)) as WorldMapLayout;
}

function mapX(x: number): number {
  return x - worldBounds.minX;
}

function mapY(z: number): number {
  return worldBounds.maxZ - z;
}

function rectY(z: number, depth: number): number {
  return worldBounds.maxZ - z - depth / 2;
}

function layerItems(layout: WorldMapLayout, layer: EditableLayer): Array<Record<string, unknown>> {
  return layout[layer] as unknown as Array<Record<string, unknown>>;
}

function itemName(layer: EditableLayer, item: Record<string, unknown>, index: number): string {
  if (layer === "roads") {
    return String(item.id ?? `Road ${index + 1}`);
  }

  if (layer === "buildings") {
    return String(item.signText ?? `Building ${index + 1}`);
  }

  if (layer === "decorations") {
    return String(item.id ?? `Prop ${index + 1}`);
  }

  if (layer === "patrolZones") {
    return String(item.label ?? item.id ?? `Patrol ${index + 1}`);
  }

  return `${String(item.districtId ?? "Backdrop")} ${index + 1}`;
}

function itemPosition(item: Record<string, unknown>): { x: number; z: number } {
  return {
    x: typeof item.x === "number" ? item.x : 0,
    z: typeof item.z === "number" ? item.z : 0
  };
}

function numericValue(item: Record<string, unknown>, key: string, fallback = 0): number {
  return typeof item[key] === "number" ? item[key] as number : fallback;
}

function layerClass(layer: EditableLayer): string {
  return `admin-map-object ${layer}`;
}

export function AdminMapEditor({ initialLayout, onReset, onSave }: AdminMapEditorProps) {
  const [authenticated, setAuthenticated] = useState(() => window.sessionStorage.getItem("vendetta.admin") === "true");
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [layout, setLayout] = useState<WorldMapLayout>(() => cloneLayout(initialLayout));
  const [activeLayer, setActiveLayer] = useState<EditableLayer>("buildings");
  const [selection, setSelection] = useState<Selection>({ layer: "buildings", index: 0 });
  const [status, setStatus] = useState("");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const issues = useMemo(() => validateWorldMapLayout(layout), [layout]);
  const blockingIssues = issues.filter((issue) => issue.severity === "error");
  const selectedItem = layerItems(layout, selection.layer)[selection.index];
  const activeItems = layerItems(layout, activeLayer);

  const pointFromPointer = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, z: 0 };
    }

    const bounds = svg.getBoundingClientRect();
    const svgX = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * mapWidth;
    const svgY = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * mapDepth;
    return {
      x: worldBounds.minX + svgX,
      z: worldBounds.maxZ - svgY
    };
  };

  const updateItem = (target: Selection, patch: Record<string, unknown>) => {
    setLayout((current) => {
      const items = layerItems(current, target.layer);
      return {
        ...current,
        [target.layer]: items.map((item, index) => (index === target.index ? { ...item, ...patch } : item))
      } as WorldMapLayout;
    });
    setStatus("");
  };

  const updateSelected = (patch: Record<string, unknown>) => {
    updateItem(selection, patch);
  };

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (credentials.username === "admin" && credentials.password === "admin") {
      window.sessionStorage.setItem("vendetta.admin", "true");
      setAuthenticated(true);
      setLoginError("");
      return;
    }

    setLoginError("Invalid credentials.");
  };

  const startDrag = (event: PointerEvent<SVGElement>, target: Selection, currentX: number, currentZ: number) => {
    const point = pointFromPointer(event);
    dragRef.current = {
      ...target,
      offsetX: point.x - currentX,
      offsetZ: point.z - currentZ
    };
    setSelection(target);
    setActiveLayer(target.layer);
    svgRef.current?.setPointerCapture(event.pointerId);
    event.stopPropagation();
  };

  const moveDrag = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }

    const point = pointFromPointer(event);
    updateItem(drag, {
      x: Number((point.x - drag.offsetX).toFixed(2)),
      z: Number((point.z - drag.offsetZ).toFixed(2))
    });
  };

  const stopDrag = (event: PointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const handleSave = () => {
    if (blockingIssues.length > 0) {
      setStatus("Fix validation errors before saving.");
      return;
    }

    onSave(layout);
    setStatus("Map layout saved.");
  };

  const handleReset = () => {
    if (!window.confirm("Reset the editable map layout to the default authored city?")) {
      return;
    }

    const nextLayout = createDefaultWorldMapLayout();
    setLayout(nextLayout);
    setSelection({ layer: "buildings", index: 0 });
    setActiveLayer("buildings");
    onReset();
    setStatus("Default map restored.");
  };

  if (!authenticated) {
    return (
      <main className="admin-shell">
        <form className="admin-login" onSubmit={handleLogin}>
          <div>
            <Map size={22} aria-hidden="true" />
            <h1>Map Editor</h1>
          </div>
          <label>
            Username
            <input autoComplete="username" value={credentials.username} onChange={(event) => setCredentials((current) => ({ ...current, username: event.target.value }))} />
          </label>
          <label>
            Password
            <input autoComplete="current-password" type="password" value={credentials.password} onChange={(event) => setCredentials((current) => ({ ...current, password: event.target.value }))} />
          </label>
          {loginError && <p className="admin-login-error">{loginError}</p>}
          <button type="submit">
            <Eye size={16} aria-hidden="true" />
            Sign in
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <Map size={20} aria-hidden="true" />
          <div>
            <h1>Map Editor</h1>
            <span>{blockingIssues.length === 0 ? "Layout valid" : `${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? "" : "s"}`}</span>
          </div>
        </div>
        <div className="admin-actions">
          <button onClick={() => window.location.assign("/")} type="button">
            <Undo2 size={16} aria-hidden="true" />
            Game
          </button>
          <button onClick={handleReset} type="button">
            <RotateCcw size={16} aria-hidden="true" />
            Reset
          </button>
          <button className="primary" disabled={blockingIssues.length > 0} onClick={handleSave} type="button">
            <Save size={16} aria-hidden="true" />
            Save
          </button>
        </div>
      </header>

      <section className="admin-editor">
        <aside className="admin-sidebar">
          <div className="admin-layer-tabs">
            {editableLayers.map((layer) => (
              <button className={activeLayer === layer.id ? "active" : ""} key={layer.id} onClick={() => setActiveLayer(layer.id)} type="button">
                {layer.icon}
                {layer.label}
              </button>
            ))}
          </div>

          <div className="admin-object-list">
            {activeItems.map((item, index) => (
              <button
                className={selection.layer === activeLayer && selection.index === index ? "active" : ""}
                key={`${activeLayer}-${index}`}
                onClick={() => setSelection({ layer: activeLayer, index })}
                type="button"
              >
                <span>{itemName(activeLayer, item, index)}</span>
                <small>
                  {numericValue(item, "x").toFixed(1)}, {numericValue(item, "z").toFixed(1)}
                </small>
              </button>
            ))}
          </div>
        </aside>

        <div className="admin-map-panel">
          <svg
            className="admin-map"
            ref={svgRef}
            viewBox={`0 0 ${mapWidth} ${mapDepth}`}
            onPointerMove={moveDrag}
            onPointerUp={stopDrag}
            onPointerLeave={stopDrag}
            role="img"
            aria-label="Editable city map"
          >
            <rect className="admin-map-ground" width={mapWidth} height={mapDepth} x={0} y={0} />
            {layout.roads.map((road, index) => (
              <rect
                className={layerClass("roads")}
                data-selected={selection.layer === "roads" && selection.index === index}
                height={road.depth}
                key={road.id}
                width={road.width}
                x={mapX(road.x - road.width / 2)}
                y={rectY(road.z, road.depth)}
                onPointerDown={(event) => startDrag(event, { layer: "roads", index }, road.x, road.z)}
              />
            ))}
            {layout.backdropBuildings.map((building, index) => (
              <rect
                className={layerClass("backdropBuildings")}
                data-selected={selection.layer === "backdropBuildings" && selection.index === index}
                height={building.depth}
                key={`backdrop-${index}`}
                width={building.width}
                x={mapX(building.x - building.width / 2)}
                y={rectY(building.z, building.depth)}
                onPointerDown={(event) => startDrag(event, { layer: "backdropBuildings", index }, building.x, building.z)}
              />
            ))}
            {layout.patrolZones.map((zone, index) => (
              <circle
                className={layerClass("patrolZones")}
                cx={mapX(zone.x)}
                cy={mapY(zone.z)}
                data-selected={selection.layer === "patrolZones" && selection.index === index}
                key={zone.id}
                r={zone.radius}
                onPointerDown={(event) => startDrag(event, { layer: "patrolZones", index }, zone.x, zone.z)}
              />
            ))}
            {layout.buildings.map((building, index) => (
              <rect
                className={layerClass("buildings")}
                data-selected={selection.layer === "buildings" && selection.index === index}
                height={building.depth}
                key={`${building.signText}-${index}`}
                width={building.width}
                x={mapX(building.x - building.width / 2)}
                y={rectY(building.z, building.depth)}
                onPointerDown={(event) => startDrag(event, { layer: "buildings", index }, building.x, building.z)}
              />
            ))}
            {layout.decorations.map((decoration, index) => (
              <circle
                className={layerClass("decorations")}
                cx={mapX(decoration.x)}
                cy={mapY(decoration.z)}
                data-selected={selection.layer === "decorations" && selection.index === index}
                key={decoration.id}
                r={Math.max(0.45, decoration.scale * 0.58)}
                onPointerDown={(event) => startDrag(event, { layer: "decorations", index }, decoration.x, decoration.z)}
              />
            ))}
          </svg>
        </div>

        <aside className="admin-inspector">
          <h2>{selectedItem ? itemName(selection.layer, selectedItem, selection.index) : "No selection"}</h2>
          {selectedItem && (
            <div className="admin-field-grid">
              <label>
                X
                <input type="number" step="0.1" value={numericValue(selectedItem, "x")} onChange={(event) => updateSelected({ x: Number(event.target.value) })} />
              </label>
              <label>
                Z
                <input type="number" step="0.1" value={numericValue(selectedItem, "z")} onChange={(event) => updateSelected({ z: Number(event.target.value) })} />
              </label>

              {(selection.layer === "roads" || selection.layer === "buildings" || selection.layer === "backdropBuildings") && (
                <>
                  <label>
                    Width
                    <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "width", 1)} onChange={(event) => updateSelected({ width: Number(event.target.value) })} />
                  </label>
                  <label>
                    Depth
                    <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "depth", 1)} onChange={(event) => updateSelected({ depth: Number(event.target.value) })} />
                  </label>
                </>
              )}

              {(selection.layer === "buildings" || selection.layer === "backdropBuildings") && (
                <label>
                  Height
                  <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "height", 1)} onChange={(event) => updateSelected({ height: Number(event.target.value) })} />
                </label>
              )}

              {selection.layer === "patrolZones" && (
                <label>
                  Radius
                  <input type="number" min="0.2" step="0.1" value={numericValue(selectedItem, "radius", 1)} onChange={(event) => updateSelected({ radius: Number(event.target.value) })} />
                </label>
              )}

              {selection.layer === "decorations" && (
                <>
                  <label>
                    Scale
                    <input type="number" min="0.2" step="0.05" value={numericValue(selectedItem, "scale", 1)} onChange={(event) => updateSelected({ scale: Number(event.target.value) })} />
                  </label>
                  <label>
                    Rotation
                    <input type="number" step="0.05" value={numericValue(selectedItem, "rotationY", 0)} onChange={(event) => updateSelected({ rotationY: Number(event.target.value) })} />
                  </label>
                </>
              )}

              {selection.layer === "buildings" && (
                <label className="wide">
                  Style
                  <select value={String(selectedItem.style ?? "garage")} onChange={(event) => updateSelected({ style: event.target.value as BuildingVisualStyle })}>
                    {buildingStyles.map((style) => (
                      <option key={style} value={style}>
                        {style.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {selection.layer === "decorations" && (
                <label className="wide">
                  Kind
                  <select value={String(selectedItem.kind ?? "streetlight")} onChange={(event) => updateSelected({ kind: event.target.value as WorldDecorationKind })}>
                    {decorationKinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {kind.replace("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}

          <div className="admin-validation">
            <h3>
              <AlertTriangle size={16} aria-hidden="true" />
              Validation
            </h3>
            {issues.length === 0 ? (
              <p>No road/building conflicts.</p>
            ) : (
              issues.slice(0, 7).map((issue, index) => (
                <p className={issue.severity} key={`${issue.message}-${index}`}>
                  {issue.message}
                </p>
              ))
            )}
          </div>
          {status && <p className="admin-status">{status}</p>}
        </aside>
      </section>
    </main>
  );
}
