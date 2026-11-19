import { CylinderGeometry, LatheGeometry, Vector2, type BufferGeometry } from 'three';
import { normalizeMeshes, type ParsedMesh, type ParsedModel } from '@/lib/models/modelTypes';
import type { DwgRenderEntity } from './dwgTypes';

export type M12Connector = 'male' | 'female';
export type HarnessLengthBasis = 'cable' | 'overall';
interface DimensionHint { mm: number; note: string }
interface LengthHint extends DimensionHint { basis: HarnessLengthBasis }
interface HarnessDimensions {
  lengthMm: number;
  lengthBasis: HarnessLengthBasis;
  diameterMm: number;
  connector: M12Connector;
  partNumber?: string;
}

const PART_NUMBER = /\bM12[A-Z]\d{2}-\d{2}-\d{3}(?!\d)/g;
const DWG_MILLIMETERS = 4;
const SINGLE_END_TEMPLATE = /^M12A(?:04|05|08)-(?:07-068|07-093|08-085)-\d+-\d+-(\d+)\.DWG$/;
const END_REFERENCE = /(?:^|[\s,;])(?:([AB])|[JP]([12]))\s*(?:端(?:连接器)?)?\s*:?\s*M12[A-Z]\d{2}-\d{2}-\d{3}(?!\d)/g;
const DECIMAL = String.raw`\d+(?:\.\d+)?`;
const TOLERANCE = String.raw`(?:\s*±\s*${DECIMAL})?`;
const STARRED_LENGTH = new RegExp(String.raw`^\*\s*(${DECIMAL})${TOLERANCE}\s*(?:mm)?$`, 'i');
const LENGTH_LABEL = /((?:总成\s*)?总长(?:度)?|(?:线缆|电缆)\s*长度|线长)\s*:/g;
const OD_LABEL = /(?:\bO\.?\s*D\.?|(?:线缆|电缆|外被)\s*外径)\s*:/gi;
const NAMED_LENGTH = new RegExp(String.raw`^(${DECIMAL})${TOLERANCE}\s*(mm|m)(?=$|\s*(?:[;；]|,(?!\s*\d)))`, 'i');
const CABLE_OD = new RegExp(String.raw`^(${DECIMAL})${TOLERANCE}(?:\s*(mm)\b)?(?=$|\s*(?:[;；]|,(?!\s*\d)|(?:PVC|PUR|TPE|TPU)\b|[棕白蓝黑红绿黄灰橙紫]))`, 'i');
const DIMENSION_CONTINUATION = /^(?:[-+−–—~至到\d./±]|,\s*\d|to\b|(?:mm|cm|m|in|inch|mil)\b)/i;

function unambiguous<T extends DimensionHint>(hints: T[], agrees: (hint: T, first: T) => boolean = () => true): T | null {
  return hints.length && hints.every((hint) => hint.mm === hints[0].mm && agrees(hint, hints[0])) ? hints[0] : null;
}

function readDimensionValue(label: string, afterLabel: number, pattern: RegExp) {
  const [line, nextLine] = label.slice(afterLabel).trimStart().split(/\n+/);
  const value = pattern.exec(line);
  if (value?.[0].length === line.length && nextLine && DIMENSION_CONTINUATION.test(nextLine)) return null;
  return value;
}

export function suggestDwgHarness(fileName: string, entities: readonly DwgRenderEntity[], units: number | null) {
  const name = fileName.normalize('NFKC').toUpperCase();
  const template = units === DWG_MILLIMETERS ? SINGLE_END_TEMPLATE.exec(name) : null;
  const partNumbers = new Set(name.match(PART_NUMBER));
  const annotatedEnds = new Set<string>();
  const lengths: LengthHint[] = [];
  const diameters: DimensionHint[] = [];
  let ambiguousLength = false;
  let ambiguousDiameter = false;
  for (const entity of entities) {
    if (entity.kind !== 'text') continue;
    const lines = entity.lines.map((line) => line.normalize('NFKC').trim()).filter(Boolean);
    const label = lines.join('\n');
    const upperLabel = label.toUpperCase();
    for (const part of upperLabel.match(PART_NUMBER) ?? []) partNumbers.add(part);
    for (const end of upperLabel.matchAll(END_REFERENCE)) {
      annotatedEnds.add(end[1] === 'B' || end[2] === '2' ? 'second' : 'first');
    }
    if (template && entity.isDimension) {
      const starred = STARRED_LENGTH.exec(lines.join(' '));
      if (starred && Number(starred[1]) === Number(template[1])) {
        // In these drawing templates the starred dimension starts at the cable exit.
        lengths.push({ mm: Number(starred[1]), note: starred[0], basis: 'cable' });
      }
    }
    for (const match of label.matchAll(LENGTH_LABEL)) {
      const length = readDimensionValue(label, match.index + match[0].length, NAMED_LENGTH);
      if (length) {
        lengths.push({ mm: Number(length[1]) * (length[2].toLowerCase() === 'm' ? 1000 : 1),
          note: `${match[0]} ${length[0]}`, basis: match[1].includes('总长') ? 'overall' : 'cable' });
      } else ambiguousLength = true;
    }
    for (const match of label.matchAll(OD_LABEL)) {
      const diameter = readDimensionValue(label, match.index + match[0].length, CABLE_OD);
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
    length: ambiguousLength ? null : unambiguous(lengths, (hint, first) => hint.basis === first.basis),
    diameter: ambiguousDiameter ? null : unambiguous(diameters) };
}

function takeMesh(name: string, geometry: BufferGeometry): ParsedMesh {
  try {
    return { name, positions: Float32Array.from(geometry.getAttribute('position').array),
      normals: Float32Array.from(geometry.getAttribute('normal').array), indices: Uint32Array.from(geometry.getIndex()!.array) };
  } finally { geometry.dispose(); }
}

/** 线缆与占位接头均沿 X 轴放置，不把图纸投影当作安装路径。 */
export function buildDwgHarnessModel({ lengthMm, lengthBasis, diameterMm, connector, partNumber }: HarnessDimensions) {
  if (!Number.isFinite(lengthMm) || lengthMm <= 0 || lengthMm > 100_000) throw new Error('标称长度必须大于 0 且不超过 100,000 mm。');
  const end = lengthBasis === 'cable' ? 26 : Math.min(26, lengthMm / 4);
  const cableLength = lengthBasis === 'cable' ? lengthMm : lengthMm - end;
  if (!Number.isFinite(diameterMm) || diameterMm <= 0 || diameterMm > 100 || diameterMm >= cableLength) {
    throw new Error('线缆外径必须大于 0、不超过 100 mm，且小于可用线缆段长度。');
  }
  const radius = diameterMm / 2;
  const shell = Math.max(radius, 7.25);
  const detailed = partNumber === 'M12A04-07-068' && connector === 'male';
  const section: Vector2[] = [];
  const profile = (...points: [radius: number, fraction: number][]) => {
    for (const [r, fraction] of points) section.push(new Vector2(r, end * fraction));
  };
  if (detailed) {
    profile([0, 0.08], [5.4, 0.08], [5.4, 0], [5.95, 0]);
    // Annular ridges show the threaded region in the drawing without modeling a machinable thread.
    for (let ring = 0; ring < 6; ring++) {
      const start = 0.045 + ring * 0.043;
      profile([5.45, start], [6, start + 0.012], [6, start + 0.022], [5.45, start + 0.034]);
    }
    profile([5.45, 0.32], [shell, 0.32], [shell, 0.41], [6.1, 0.41], [6.1, 0.45],
      [shell, 0.45], [shell, 0.76], [Math.max(5.8, radius), 0.80], [Math.max(5.8, radius), 0.9]);
  } else if (connector === 'female') {
    profile([0, 0.14], [shell * 0.65, 0.14], [shell * 0.65, 0], [shell, 0], [shell, 0.55], [shell * 0.85, 0.65]);
  } else {
    profile([0, 0], [shell * 0.52, 0], [shell * 0.52, 0.14], [shell, 0.14], [shell, 0.55], [shell * 0.85, 0.65]);
  }
  profile([radius, 1], [0, 1]);
  const plug = new LatheGeometry(section, 48).rotateZ(-Math.PI / 2);
  const meshes = [takeMesh(`P1 · M12 ${connector === 'male' ? '公头' : '母头'}占位`, plug)];
  if (detailed) {
    for (const [index, [y, z]] of [[-2, 2], [2, 2], [2, -2], [-2, -2]].entries()) {
      const pin = new CylinderGeometry(0.55, 0.55, end * 0.075, 16)
        .rotateZ(-Math.PI / 2).translate(end * 0.0525, y, z);
      meshes.push(takeMesh(`P1 针位 ${index + 1} · 示意`, pin));
    }
  }
  const cable = new CylinderGeometry(radius, radius, cableLength, 32)
    .rotateZ(-Math.PI / 2).translate(end + cableLength / 2, 0, 0);
  meshes.push(takeMesh('线缆', cable));
  const connectorBoundsMm: ParsedModel['boundsMm'] = { min: [0, -shell, -shell], max: [end, shell, shell] };
  return { ...normalizeMeshes(meshes), connectorBoundsMm };
}
