export type LoginNodeKind =
  | "person"
  | "card"
  | "cycle"
  | "document"
  | "notice";

export type LoginGraphNode = {
  id: string;
  kind: LoginNodeKind;
  x: number;
  y: number;
  /** Sparse = light + compact; quiet = dark desktop mid-ring; full = dark corners. */
  density: "sparse" | "quiet" | "full";
  /** Slightly clearer idle presence; keep to 1–2 nodes. */
  emphasis?: boolean;
};

/** Fixed DevPulse conversation graph (viewBox 0–100). Center kept empty. */
export const LOGIN_GRAPH_NODES: readonly LoginGraphNode[] = [
  { id: "p1", kind: "person", x: 8, y: 22, density: "sparse", emphasis: true },
  { id: "c1", kind: "card", x: 17.5, y: 38, density: "sparse" },
  { id: "y1", kind: "cycle", x: 9.5, y: 58, density: "sparse" },
  { id: "d1", kind: "document", x: 20, y: 78, density: "quiet" },
  { id: "n1", kind: "notice", x: 7, y: 90, density: "full" },
  { id: "c5", kind: "card", x: 29, y: 9, density: "full" },
  { id: "c3", kind: "card", x: 42, y: 6.5, density: "full" },
  { id: "n3", kind: "notice", x: 54, y: 6, density: "quiet" },
  { id: "p3", kind: "person", x: 68, y: 10, density: "sparse" },
  { id: "p2", kind: "person", x: 92, y: 20, density: "sparse", emphasis: true },
  { id: "c2", kind: "card", x: 82.5, y: 34, density: "sparse" },
  { id: "y2", kind: "cycle", x: 93, y: 52, density: "full" },
  { id: "d2", kind: "document", x: 81, y: 71, density: "sparse" },
  { id: "n2", kind: "notice", x: 93, y: 86, density: "full" },
  { id: "c4", kind: "card", x: 70, y: 91, density: "full" },
  { id: "d3", kind: "document", x: 55, y: 93.5, density: "quiet" },
  { id: "y3", kind: "cycle", x: 37, y: 92, density: "quiet" },
] as const;

export const LOGIN_GRAPH_EDGES: readonly (readonly [string, string])[] = [
  ["p1", "c1"],
  ["c1", "y1"],
  ["y1", "d1"],
  ["d1", "n1"],
  ["p1", "c5"],
  ["c5", "c3"],
  ["c3", "n3"],
  ["n3", "p3"],
  ["p3", "c2"],
  ["p2", "c2"],
  ["c2", "y2"],
  ["c2", "d2"],
  ["y2", "d2"],
  ["d2", "n2"],
  ["n2", "p2"],
  ["d2", "c4"],
  ["c4", "d3"],
  ["d3", "y3"],
  ["y3", "d1"],
] as const;

/** Short semantic talks. Consecutive ids must share an edge. */
export const LOGIN_GRAPH_TALKS: readonly (readonly string[])[] = [
  ["p1", "c1", "y1"],
  ["p2", "c2", "d2"],
  ["p3", "c2"],
  ["y3", "d3"],
  ["y1", "d1"],
  ["d2", "n2"],
] as const;

export const LOGIN_MOTION = {
  hopMs: 840,
  dwellMs: 280,
  haloMs: 480,
  ackMs: 860,
  silenceMs: 10000,
  listeningScale: 0,
} as const;

/** Perspective point cloud. Depth 0 = far/vanish, 1 = near/front. */
export const LOGIN_MESH = {
  vanishX: 0.5,
  vanishY: 0.4,
  cols: 38,
  rows: 24,
  lightCols: 36,
  lightRows: 22,
  compactCols: 18,
  compactRows: 12,
  cycleMs: 26000,
  listenScale: 0.06,
  waveAmp: 0.045,
} as const;

export type LoginMeshPoint = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  col: number;
  row: number;
};

export function loginMeshDimensions(
  theme: "light" | "dark",
  compact: boolean,
): { cols: number; rows: number } {
  if (compact) {
    return { cols: LOGIN_MESH.compactCols, rows: LOGIN_MESH.compactRows };
  }
  if (theme === "light") {
    return { cols: LOGIN_MESH.lightCols, rows: LOGIN_MESH.lightRows };
  }
  return { cols: LOGIN_MESH.cols, rows: LOGIN_MESH.rows };
}

function meshJitter(col: number, row: number): number {
  const n = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function loginMeshRow(
  row: number,
  rows: number,
  cols: number,
  timeMs: number,
): LoginMeshPoint[] {
  const scroll = (timeMs / LOGIN_MESH.cycleMs) % 1;
  const depth = (row / rows + scroll) % 1;
  const rise = depth ** 1.12;
  const fade =
    smoothstep(0.015, 0.09, depth) * smoothstep(1, 0.88, depth);
  const half = (cols - 1) / 2;
  const span = 0.18 + rise * 0.92;
  const travel = timeMs / 6400;
  const points: LoginMeshPoint[] = [];

  for (let col = 0; col < cols; col += 1) {
    const jitter = (meshJitter(col, row) - 0.5) * 0.016 * rise;
    const lane = half === 0 ? 0 : (col - half) / half;
    const ridge = lane * lane;
    const undulate =
      Math.sin(lane * 2.15 + depth * 3.4 + travel) *
      LOGIN_MESH.waveAmp *
      (0.35 + rise);
    const x = LOGIN_MESH.vanishX + lane * span + jitter;
    const y =
      LOGIN_MESH.vanishY +
      rise * 0.66 -
      ridge * (0.16 + rise * 0.28) +
      undulate;
    if (y < 0.3 || y > 1.06) {
      continue;
    }
    points.push({
      x,
      y,
      size: 0.22 + rise * 1.35,
      alpha: fade * (0.16 + rise * 0.7) * (0.72 + ridge * 0.28),
      col,
      row,
    });
  }

  return points;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function loginGraphVisible(
  density: LoginGraphNode["density"],
  theme: "light" | "dark",
  compact: boolean,
): boolean {
  if (theme === "light" || compact) {
    return density === "sparse";
  }
  return true;
}
