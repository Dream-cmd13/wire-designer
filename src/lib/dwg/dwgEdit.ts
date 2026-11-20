import type { DwgDrawing, DwgEditKind, DwgEditSource, DwgPoint, DwgRenderEntity } from '@/lib/dwg/dwgTypes';
import type { DwgView } from '@/lib/dwg/dwgView';
import { flattenBulges, sampleArcRange } from '@/lib/dwg/bulge';

export interface DwgEditOperation {
  handle: string;
  kind: DwgEditKind;
  expectedText: string;
  newText: string;
}

export function normalizeDwgEditText(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

export function readEditableDwgText(raw: string | undefined, multiline: boolean): string | null {
  if (!raw?.trim() || raw.includes('%<') || raw.includes('<>')) return null;
  const grouped = multiline && raw.startsWith('{') && raw.endsWith('}');
  const body = grouped ? raw.slice(1, -1) : raw;
  const content = multiline ? body.replace(/^(?:\\(?:[fF][^\\{};\r\n]+|H[0-9]*\.?[0-9]+[xX]?|C[0-9]+);)*/, '') : body;
  const tokens = multiline ? /\\[P\\{}~]|%%[dDpPcC%]|[^\\{}%]+|%(?!%)/gy : /%%[dDpPcC%]|[^%\r\n]+|%(?!%)/gy;
  const decoded: Record<string, string> = {
    '\\p': '\n', '\\~': '\u00a0', '\\{': '{', '\\}': '}', '\\\\': '\\',
    '%%d': '°', '%%p': '±', '%%c': '⌀', '%%%': '%',
  };
  let result = '';
  let position = 0;
  for (const match of content.matchAll(tokens)) {
    position += match[0].length;
    result += decoded[match[0].toLowerCase()] ?? match[0];
  }
  return position === content.length && result.trim() ? normalizeDwgEditText(result) : null;
}

export function updateDwgOperations(operations: DwgEditOperation[], source: DwgEditSource, value: string): DwgEditOperation[] {
  if (source.readOnlyReason || source.kind === 'BLOCK') throw new Error(source.readOnlyReason ?? '该对象只读。');
  const newText = normalizeDwgEditText(value);
  if (!newText.trim() || newText.length > 4096 || (!source.multiline && newText.includes('\n')) ||
    newText.includes('%<') || newText.includes('<>') || Array.from(newText).some((character) => {
      const code = character.charCodeAt(0);
      return character !== '\n' && (code < 32 || (code >= 127 && code <= 159));
    })) throw new Error('请输入有效文字。单行对象不能换行，且不支持自动字段。');
  const remaining = operations.filter((operation) => operation.handle !== source.handle);
  if (newText === source.expectedText) return remaining;
  if (remaining.length >= 100) throw new Error('每次最多修改 100 个对象。');
  return [...remaining, { handle: source.handle, kind: source.kind, expectedText: source.expectedText, newText }];
}

function distanceToSegment(point: DwgPoint, start: DwgPoint, end: DwgPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = dx * dx + dy * dy;
  const fraction = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length)) : 0;
  return Math.hypot(point.x - start.x - fraction * dx, point.y - start.y - fraction * dy);
}

function intersectsEntity(entity: DwgRenderEntity, point: DwgPoint, tolerance: number) {
  const { minX, minY, maxX, maxY } = entity.bounds;
  if (point.x < minX - tolerance || point.x > maxX + tolerance || point.y < minY - tolerance || point.y > maxY + tolerance) return false;
  switch (entity.kind) {
    case 'line': return distanceToSegment(point, entity.a, entity.b) <= tolerance;
    case 'circle': return Math.abs(Math.hypot(point.x - entity.center.x, point.y - entity.center.y) - entity.radius) <= tolerance;
    case 'polyline':
    case 'arc': {
      const points = entity.kind === 'arc' ? sampleArcRange(entity.center, entity.radius, entity.startAngle, entity.endAngle, true)
        : flattenBulges(entity.points, entity.bulges, entity.closed);
      return points.some((end, index) => index > 0 && distanceToSegment(point, points[index - 1], end) <= tolerance);
    }
    default: return true;
  }
}

export function hitDwgEditSources(drawing: DwgDrawing, view: DwgView, screen: DwgPoint, hidden: ReadonlySet<string>): DwgEditSource[] {
  const point = { x: (screen.x - view.offsetX) / view.scale, y: (view.offsetY - screen.y) / view.scale };
  const tolerance = 5 / view.scale;
  const hits = new Map<string, DwgEditSource>();
  for (const entity of drawing.entities) {
    const source = entity.editSource;
    if (source && !hits.has(source.key) && !hidden.has(entity.layer) && intersectsEntity(entity, point, tolerance)) hits.set(source.key, source);
  }
  return [...hits.values()];
}
