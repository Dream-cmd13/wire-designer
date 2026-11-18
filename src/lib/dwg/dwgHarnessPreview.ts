import { CylinderGeometry, LatheGeometry, Vector2, type BufferGeometry } from 'three';
import { normalizeMeshes, type ParsedMesh } from '@/lib/models/modelTypes';
import type { DwgRenderEntity } from './dwgTypes';

export type M12Connector = 'male' | 'female';
interface DimensionHint { mm: number; note: string }
interface HarnessDimensions { lengthMm: number; diameterMm: number; connector: M12Connector }

const PART_NUMBER = /\bM12[A-Z]\d{2}-\d{2}-\d{3}(?!\d)/g;
const DECIMAL = String.raw`\d+(?:\.\d+)?`;
const TOLERANCE = String.raw`(?:\s*±\s*${DECIMAL})?`;
const OVERALL = new RegExp(String.raw`^\*\s*(${DECIMAL})${TOLERANCE}\s*(?:mm)?$`, 'i');
const NAMED_LENGTH = new RegExp(String.raw`(?:标称总长|总长|总长度)\s*:\s*(${DECIMAL})${TOLERANCE}\s*mm\b`, 'i');
const CABLE_OD = new RegExp(String.raw`(?:\bO\.?\s*D\.?|(?:线缆|电缆|外被)\s*外径)\s*:\s*(${DECIMAL})${TOLERANCE}(?:\s*(mm\b|cm\b|m\b|in(?:ch)?\b|μm\b|um\b|"))?`, 'gi');

function unambiguous(hints: DimensionHint[]): DimensionHint | null {
  return hints.length && hints.every((hint) => hint.mm === hints[0].mm) ? hints[0] : null;
}

export function suggestDwgHarness(fileName: string, entities: readonly DwgRenderEntity[]) {
  const partNumbers = new Set(fileName.normalize('NFKC').toUpperCase().match(PART_NUMBER));
  const lengths: DimensionHint[] = [];
  const diameters: DimensionHint[] = [];
  for (const entity of entities) {
    if (entity.kind !== 'text') continue;
    const lines = entity.lines.map((line) => line.normalize('NFKC').trim());
    const label = lines.join(' ');
    for (const part of label.toUpperCase().match(PART_NUMBER) ?? []) partNumbers.add(part);
    const length = (entity.isDimension ? OVERALL.exec(label) : null) ?? NAMED_LENGTH.exec(label);
    if (length) lengths.push({ mm: Number(length[1]), note: length[0] });
    for (const match of label.matchAll(CABLE_OD)) {
      if (!match[2] || match[2].toLowerCase() === 'mm') diameters.push({ mm: Number(match[1]), note: `OD:${match[1]}` });
    }
  }
  const partNumber = partNumbers.size === 1 ? [...partNumbers][0] : null;
  // These are the cataloged single-ended families represented in the supported DWG samples.
  const variant = partNumber?.slice(7);
  const connector: M12Connector | null = variant === '07-068' || variant === '07-093' ? 'male' : variant === '08-085' ? 'female' : null;
  return { partNumber, connector, length: unambiguous(lengths), diameter: unambiguous(diameters) };
}

function takeMesh(name: string, geometry: BufferGeometry): ParsedMesh {
  try {
    return { name, positions: Float32Array.from(geometry.getAttribute('position').array),
      normals: Float32Array.from(geometry.getAttribute('normal').array), indices: Uint32Array.from(geometry.getIndex()!.array) };
  } finally { geometry.dispose(); }
}

/** 线缆与占位接头均沿 X 轴放置，不把图纸投影当作安装路径。 */
export function buildDwgHarnessModel({ lengthMm, diameterMm, connector }: HarnessDimensions) {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0 || lengthMm > 100_000) throw new Error('标称总长必须大于 0 且不超过 100,000 mm。');
  if (!Number.isFinite(diameterMm) || diameterMm <= 0 || diameterMm > 100 || diameterMm >= lengthMm) {
    throw new Error('线缆外径必须大于 0、不超过 100 mm，且小于标称总长。');
  }
  const radius = diameterMm / 2;
  const end = Math.min(26, lengthMm / 4);
  const shell = Math.max(radius, 7.25);
  const mouth = 0.14 * end;
  const section = connector === 'female'
    ? [[0, mouth], [shell * 0.65, mouth], [shell * 0.65, 0], [shell, 0]]
    : [[0, 0], [shell * 0.52, 0], [shell * 0.52, mouth], [shell, mouth]];
  section.push([shell, end * 0.55], [shell * 0.85, end * 0.65], [radius, end], [0, end]);
  const plug = new LatheGeometry(section.map(([r, x]) => new Vector2(r, x)), 32).rotateZ(-Math.PI / 2);
  const cable = new CylinderGeometry(radius, radius, lengthMm - end, 32)
    .rotateZ(-Math.PI / 2).translate((lengthMm + end) / 2, 0, 0);
  return normalizeMeshes([takeMesh(`M12 ${connector === 'male' ? '公头' : '母头'}占位`, plug), takeMesh('线缆', cable)]);
}
