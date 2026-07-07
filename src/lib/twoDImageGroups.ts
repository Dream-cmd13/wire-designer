/**
 * Groups TwoDImages by design-element connectivity and sorts them
 * left-to-right based on canvas x-positions.
 */
import type {
  CanvasModel,
  CanvasWireMaterial,
  ConnectorInstance,
  ProtectiveSleeve,
  TwoDImage,
} from '@/types/harness';

// ── Union-Find ──────────────────────────────────────────────────────────────

function makeUF(ids: string[]) {
  const parent: Record<string, string> = {};
  for (const id of ids) parent[id] = id;

  function find(x: string): string {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  return { find, union };
}

// ── x-position lookup ───────────────────────────────────────────────────────

function getElementX(
  kind: TwoDImage['elementKind'],
  id: string | undefined,
  connectors: ConnectorInstance[],
  materials: CanvasWireMaterial[],
  sleeves: ProtectiveSleeve[],
  models: CanvasModel[],
): number {
  if (!kind || !id) return Infinity;
  if (kind === 'connector') return connectors.find((c) => c.id === id)?.position.x ?? Infinity;
  if (kind === 'material') return materials.find((m) => m.id === id)?.position.x ?? Infinity;
  if (kind === 'sleeve') return sleeves.find((s) => s.id === id)?.position.x ?? Infinity;
  if (kind === 'model') return models.find((mo) => mo.id === id)?.position.x ?? Infinity;
  return Infinity;
}

// ── public API ───────────────────────────────────────────────────────────────

export interface TwoDImageGroup {
  /** Images sorted by x-position of their associated element */
  images: TwoDImage[];
  /** True when 2+ images belong to connected elements */
  stitched: boolean;
  /** x-position of the leftmost element in this group (for inter-group sort) */
  minX: number;
}

export function buildTwoDImageGroups(
  twoDImages: TwoDImage[],
  connectors: ConnectorInstance[],
  materials: CanvasWireMaterial[],
  sleeves: ProtectiveSleeve[],
  models: CanvasModel[],
): TwoDImageGroup[] {
  // Only process images that are associated with an element
  const associated = twoDImages.filter((img) => img.elementKind && img.elementId);
  const unassociated = twoDImages.filter((img) => !img.elementKind || !img.elementId);

  if (associated.length === 0) {
    return unassociated.map((img) => ({ images: [img], stitched: false, minX: Infinity }));
  }

  // Collect all element IDs that appear in associated images
  const elementIds = associated.map((img) => `${img.elementKind}:${img.elementId}`);
  const uf = makeUF(elementIds);

  // Helper: key for an element
  const key = (kind: string, id: string) => `${kind}:${id}`;

  // Union materials with the connectors they touch
  for (const mat of materials) {
    const matKey = key('material', mat.id);
    if (!elementIds.includes(matKey)) continue;
    for (const circuit of mat.circuits) {
      if (circuit.start?.connectorId) {
        const ck = key('connector', circuit.start.connectorId);
        if (elementIds.includes(ck)) uf.union(matKey, ck);
      }
      if (circuit.end?.connectorId) {
        const ck = key('connector', circuit.end.connectorId);
        if (elementIds.includes(ck)) uf.union(matKey, ck);
      }
    }
  }

  // Union sleeves with materials they cover
  for (const sleeve of sleeves) {
    const sk = key('sleeve', sleeve.id);
    if (!elementIds.includes(sk)) continue;
    for (const matId of sleeve.attachedMaterialIds) {
      const mk = key('material', matId);
      if (elementIds.includes(mk)) uf.union(sk, mk);
    }
  }

  // Group images by root
  const groups = new Map<string, TwoDImage[]>();
  for (const img of associated) {
    const k = key(img.elementKind!, img.elementId!);
    const root = uf.find(k);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(img);
  }

  // Sort each group by x-position, then sort groups by their leftmost x
  const result: TwoDImageGroup[] = [...groups.values()].map((imgs) => {
    const sorted = [...imgs].sort(
      (a, b) =>
        getElementX(a.elementKind, a.elementId, connectors, materials, sleeves, models) -
        getElementX(b.elementKind, b.elementId, connectors, materials, sleeves, models),
    );
    const minX = getElementX(
      sorted[0].elementKind,
      sorted[0].elementId,
      connectors,
      materials,
      sleeves,
      models,
    );
    return { images: sorted, stitched: sorted.length > 1, minX };
  });

  // Append unassociated images as singletons at the end
  for (const img of unassociated) {
    result.push({ images: [img], stitched: false, minX: Infinity });
  }

  return result.sort((a, b) => a.minX - b.minX);
}
