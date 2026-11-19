import { CylinderGeometry, LatheGeometry, Vector2, type BufferGeometry } from 'three';
import { normalizeMeshes, type ParsedMesh } from '@/lib/models/modelTypes';
import type { DwgRenderEntity } from './dwgTypes';

export type M12Connector = 'male' | 'female';
interface DimensionHint { mm: number; note: string }
interface HarnessDimensions { lengthMm: number; diameterMm: number; connector: M12Connector }

const PART_NUMBER = /\bM12[A-Z]\d{2}-\d{2}-\d{3}(?!\d)/g;
const DWG_MILLIMETERS = 4;
const SINGLE_END_TEMPLATE = /^M12A(?:04|05|08)-(?:07-068|07-093|08-085)-\d+-\d+-(\d+)\.DWG$/;
const END_REFERENCE = /(?:^|[\s,;，；])(?:([AB])|[JP]([12]))\s*(?:端(?:连接器)?)?\s*:\s*M12[A-Z]\d{2}-\d{2}-\d{3}(?!\d)/g;
const DECIMAL = String.raw`\d+(?:\.\d+)?`;
const TOLERANCE = String.raw`(?:\s*±\s*${DECIMAL})?`;
const OVERALL = new RegExp(String.raw`^\*\s*(${DECIMAL})${TOLERANCE}\s*(?:mm)?$`, 'i');
const LENGTH_LABEL = /(?:标称)?总长(?:度)?\s*:\s*/g;
const OD_LABEL = /(?:\bO\.?\s*D\.?|(?:线缆|电缆|外被)\s*外径)\s*:\s*/gi;
const NAMED_LENGTH = new RegExp(String.raw`^(${DECIMAL})${TOLERANCE}\s*mm\b(?!\s*[-–—~～至\d./±])`, 'i');
const CABLE_OD = new RegExp(String.raw`^(${DECIMAL})${TOLERANCE}(?:\s*(mm)\b)?(?=$|\s*(?:[;；]|,(?!\s*\d)|(?:PVC|PUR|TPE|TPU)\b|[棕白蓝黑红绿黄灰橙紫]))`, 'i');

function unambiguous(hints: DimensionHint[]): DimensionHint | null {
  return hints.length && hints.every((hint) => hint.mm === hints[0].mm) ? hints[0] : null;
}

export function suggestDwgHarness(fileName: string, entities: readonly DwgRenderEntity[], units: number | null) {
  const name = fileName.normalize('NFKC').toUpperCase();
  const template = units === DWG_MILLIMETERS ? SINGLE_END_TEMPLATE.exec(name) : null;
  const partNumbers = new Set(name.match(PART_NUMBER));
  const annotatedEnds = new Set<string>();
  const lengths: DimensionHint[] = [];
  const diameters: DimensionHint[] = [];
  let ambiguousLength = false;
  let ambiguousDiameter = false;
  for (const entity of entities) {
    if (entity.kind !== 'text') continue;
    const lines = entity.lines.map((line) => line.normalize('NFKC').trim());
    const label = lines.join(' ');
    const upperLabel = label.toUpperCase();
    for (const part of upperLabel.match(PART_NUMBER) ?? []) partNumbers.add(part);
    for (const end of upperLabel.matchAll(END_REFERENCE)) {
      annotatedEnds.add(end[1] === 'B' || end[2] === '2' ? 'second' : 'first');
    }
    if (template && entity.isDimension) {
      const starred = OVERALL.exec(label);
      if (starred && Number(starred[1]) === Number(template[1])) {
        lengths.push({ mm: Number(starred[1]), note: starred[0] });
      }
    }
    for (const match of label.matchAll(LENGTH_LABEL)) {
      const length = NAMED_LENGTH.exec(label.slice(match.index + match[0].length));
      if (length) lengths.push({ mm: Number(length[1]), note: match[0] + length[0] });
      else ambiguousLength = true;
    }
    for (const match of label.matchAll(OD_LABEL)) {
      const diameter = CABLE_OD.exec(label.slice(match.index + match[0].length));
      if (diameter && (diameter[2] || units === DWG_MILLIMETERS)) {
        diameters.push({ mm: Number(diameter[1]), note: `OD:${diameter[1]}` });
      } else {
        ambiguousDiameter = true;
      }
    }
  }
  const partNumber = partNumbers.size === 1 ? [...partNumbers][0] : null;
  // These are the cataloged single-ended families represented in the supported DWG samples.
  const variant = partNumber?.slice(7);
  const connector: M12Connector | null = variant === '07-068' || variant === '07-093' ? 'male' : variant === '08-085' ? 'female' : null;
  return { partNumber, connector, multipleEnds: annotatedEnds.size > 1,
    length: ambiguousLength ? null : unambiguous(lengths), diameter: ambiguousDiameter ? null : unambiguous(diameters) };
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
