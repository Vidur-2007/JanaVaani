// Spec C §11 S1/S2: Disaster Surge Mode and the root-cause graph, derived only from data the API already returns
// (alerts, incidents, the alert's member grievances). Nothing is invented: the "suspected root cause" is a
// rule-based suggestion and is always labelled as such in the UI.
import type { Alert, Grievance, Status } from '@contracts/types';

const OPEN: Status[] = ['registered', 'needs_review', 'assigned', 'in_progress', 'reopened'];
const DONE: Status[] = ['resolved_pending_verification', 'closed'];

/** A surge is a critical spike alert, or a spike with many members (≥ 10). Most severe and largest first. */
export function surgeAlerts(alerts: Alert[] | undefined): Alert[] {
  return (alerts ?? [])
    .filter((a) => a.kind === 'spike' && (a.severity === 'critical' || a.grievance_ids.length >= 10))
    .sort(
      (a, b) =>
        Number(b.severity === 'critical') - Number(a.severity === 'critical') ||
        b.grievance_ids.length - a.grievance_ids.length,
    );
}

export interface SurgeCounts {
  total: number;
  open: number;
  critical: number;
  unassigned: number;
  resolved: number;
}

export function surgeCounts(list: Grievance[]): SurgeCounts {
  return {
    total: list.length,
    open: list.filter((g) => OPEN.includes(g.status)).length,
    critical: list.filter((g) => g.priority === 'critical' && !DONE.includes(g.status)).length,
    unassigned: list.filter((g) => !g.assigned_officer && OPEN.includes(g.status)).length,
    resolved: list.filter((g) => DONE.includes(g.status)).length,
  };
}

export interface BoardColumn {
  key: string;
  officer?: Grievance['assigned_officer'];
  items: Grievance[];
}

/** Team assignment board: one column per assigned officer (most loaded first), unassigned last. */
export function assignmentBoard(list: Grievance[]): BoardColumn[] {
  const by = new Map<string, BoardColumn>();
  for (const g of list) {
    const key = g.assigned_officer?.id ?? '__unassigned';
    if (!by.has(key)) by.set(key, { key, officer: g.assigned_officer, items: [] });
    by.get(key)!.items.push(g);
  }
  return [...by.values()].sort((a, b) =>
    a.key === '__unassigned' ? 1 : b.key === '__unassigned' ? -1 : b.items.length - a.items.length,
  );
}

export type CauseBasis = 'shared_asset' | 'sub_department' | 'category';

export interface SuspectedCause {
  basis: CauseBasis;
  /** Asset id, or sub-department key, or department id. */
  key: string;
  /** Where (ward name) the members cluster, when one ward dominates. */
  ward?: string;
  /** How many members share the cause, and the share (0–1). */
  support: number;
  share: number;
}

const top = <T>(xs: T[]): [T, number] | null => {
  const m = new Map<T, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  let best: [T, number] | null = null;
  for (const e of m) if (!best || e[1] > best[1]) best = e;
  return best;
};

/**
 * Rule-based suggestion, strongest first: a physical asset named by ≥ 2 members (QR reports), else the dominant
 * sub-department, else the department. Never presented as a finding — the UI says "suggested by rules".
 */
export function suspectCause(list: Grievance[]): SuspectedCause | null {
  if (!list.length) return null;
  const ward = top(list.map((g) => g.location.ward_name).filter(Boolean) as string[]);
  const wardName = ward && ward[1] / list.length >= 0.5 ? ward[0] : undefined;
  const asset = top(list.map((g) => g.asset_id).filter(Boolean) as string[]);
  if (asset && asset[1] >= 2)
    return {
      basis: 'shared_asset',
      key: asset[0],
      ward: wardName,
      support: asset[1],
      share: asset[1] / list.length,
    };
  const sub = top(list.map((g) => g.routing?.sub_department).filter(Boolean) as string[]);
  if (sub && sub[1] / list.length >= 0.4)
    return {
      basis: 'sub_department',
      key: sub[0],
      ward: wardName,
      support: sub[1],
      share: sub[1] / list.length,
    };
  const cat = top(list.map((g) => g.category));
  return cat
    ? { basis: 'category', key: cat[0], ward: wardName, support: cat[1], share: cat[1] / list.length }
    : null;
}

export interface GraphNode {
  id: string;
  kind: 'cause' | 'incident' | 'complaint';
  x: number;
  y: number;
  grievance?: Grievance;
  count?: number;
}
export interface GraphEdge {
  from: string;
  to: string;
}

/**
 * Deterministic radial layout (no physics, so it is stable across live refetches):
 * cause at the centre, incidents on the inner ring, complaints on the outer ring next to their incident.
 * Complaints with no incident hang straight off the cause. At most `max` complaints are drawn.
 */
export function rootCauseLayout(
  list: Grievance[],
  size = 520,
  max = 48,
): { nodes: GraphNode[]; edges: GraphEdge[]; hidden: number } {
  const c = size / 2;
  const shown = list.slice(0, max);
  const groups = new Map<string, Grievance[]>();
  for (const g of shown) {
    const k = g.incident_id ?? '__none';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(g);
  }
  const nodes: GraphNode[] = [{ id: 'cause', kind: 'cause', x: c, y: c }];
  const edges: GraphEdge[] = [];
  const keys = [...groups.keys()].sort((a, b) =>
    a === '__none' ? 1 : b === '__none' ? -1 : groups.get(b)!.length - groups.get(a)!.length,
  );
  const rInner = size * 0.2;
  const rOuter = size * 0.42;
  let slot = 0;
  const totalSlots = shown.length || 1;
  keys.forEach((k, gi) => {
    const members = groups.get(k)!;
    const start = (slot / totalSlots) * Math.PI * 2 - Math.PI / 2;
    const span = (members.length / totalSlots) * Math.PI * 2;
    const mid = start + span / 2;
    let parent = 'cause';
    if (k !== '__none') {
      parent = `inc-${k}`;
      nodes.push({
        id: parent,
        kind: 'incident',
        x: c + rInner * Math.cos(mid),
        y: c + rInner * Math.sin(mid),
        count: members.length,
      });
      edges.push({ from: 'cause', to: parent });
    }
    members.forEach((g, i) => {
      const a = start + span * ((i + 0.5) / members.length);
      // Alternate two radii so dense groups don't overlap.
      const r = rOuter - (i % 2) * size * 0.06 - (gi % 2) * size * 0.02;
      nodes.push({
        id: g.id,
        kind: 'complaint',
        x: c + r * Math.cos(a),
        y: c + r * Math.sin(a),
        grievance: g,
      });
      edges.push({ from: parent, to: g.id });
    });
    slot += members.length;
  });
  return { nodes, edges, hidden: Math.max(0, list.length - shown.length) };
}
