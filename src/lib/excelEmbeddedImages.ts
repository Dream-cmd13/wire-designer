import type { WorkBook } from 'xlsx';

type ZipEntryValue = Uint8Array | ArrayBuffer | string;

interface ZipEntryRecord {
  content?: ZipEntryValue;
}

type ZipEntry = ZipEntryValue | ZipEntryRecord;

export interface SheetEmbeddedImage {
  mediaPath: string;
  fileName: string;
  mimeType: string;
  bytes: number;
  dataUrl: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
};

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// XML prefixes are document-defined; resolve relationship attributes by namespace.
const RELATIONSHIP_NAMESPACES = [
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  'http://purl.oclc.org/ooxml/officeDocument/relationships',
];

function parseXml(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

function relationshipAttribute(element: Element, name: string): string | null {
  for (const namespace of RELATIONSHIP_NAMESPACES) {
    const value = element.getAttributeNS(namespace, name);
    if (value) return value;
  }
  return null;
}

function entriesOf(workbook: WorkBook): Record<string, ZipEntry> | null {
  const files = (workbook as unknown as { files?: Record<string, ZipEntry> }).files;
  return files && typeof files === 'object' ? files : null;
}

function toBytes(raw: unknown): Uint8Array | null {
  if (!raw) return null;
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (typeof raw === 'string') return new TextEncoder().encode(raw);
  if (typeof raw === 'object' && 'content' in (raw as ZipEntryRecord)) {
    return toBytes((raw as ZipEntryRecord).content);
  }
  return null;
}

function entryBytes(entries: Record<string, ZipEntry>, entryPath: string): Uint8Array | null {
  return toBytes(entries[entryPath]);
}

function entryText(entries: Record<string, ZipEntry>, entryPath: string): string | null {
  const bytes = entryBytes(entries, entryPath);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

function resolvePath(baseDir: string, target: string): string {
  const segments = target.startsWith('/') ? [] : baseDir.split('/');
  for (const part of target.replace(/^\//, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') segments.pop();
    else segments.push(part);
  }
  return segments.join('/');
}

function dirName(entryPath: string): string {
  const idx = entryPath.lastIndexOf('/');
  return idx === -1 ? '' : entryPath.slice(0, idx);
}

function baseName(entryPath: string): string {
  return entryPath.slice(entryPath.lastIndexOf('/') + 1);
}

function relsPathFor(entryPath: string): string {
  return `${dirName(entryPath)}/_rels/${baseName(entryPath)}.rels`;
}

interface Relationship {
  target: string;
  type: string;
}

function parseRelationships(xml: string): Map<string, Relationship> {
  const map = new Map<string, Relationship>();
  for (const element of Array.from(parseXml(xml).getElementsByTagNameNS('*', 'Relationship'))) {
    if (element.getAttribute('TargetMode') === 'External') continue;
    const id = element.getAttribute('Id');
    const target = element.getAttribute('Target');
    const type = element.getAttribute('Type') || '';
    if (id && target) map.set(id, { target, type });
  }
  return map;
}

function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const hasSecond = i + 1 < bytes.length;
    const hasThird = i + 2 < bytes.length;
    const b0 = bytes[i];
    const b1 = hasSecond ? bytes[i + 1] : 0;
    const b2 = hasThird ? bytes[i + 2] : 0;
    result += BASE64_CHARS[b0 >> 2];
    result += BASE64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += hasSecond ? BASE64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += hasThird ? BASE64_CHARS[b2 & 0x3f] : '=';
  }
  return result;
}

export function extractSheetImages(workbook: WorkBook, sheetName: string): SheetEmbeddedImage[] {
  const entries = entriesOf(workbook);
  if (!entries || !sheetName) return [];

  const workbookXml = entryText(entries, 'xl/workbook.xml');
  const workbookRelsXml = entryText(entries, 'xl/_rels/workbook.xml.rels');
  if (!workbookXml || !workbookRelsXml) return [];
  const workbookRels = parseRelationships(workbookRelsXml);

  let sheetEntry: string | null = null;
  for (const sheet of Array.from(parseXml(workbookXml).getElementsByTagNameNS('*', 'sheet'))) {
    const name = sheet.getAttribute('name');
    const relId = relationshipAttribute(sheet, 'id');
    if (!name || !relId || name !== sheetName) continue;
    const target = workbookRels.get(relId)?.target;
    if (target) sheetEntry = resolvePath('xl', target);
    break;
  }
  if (!sheetEntry) return [];

  const sheetRelsXml = entryText(entries, relsPathFor(sheetEntry));
  if (!sheetRelsXml) return [];
  let drawingEntry: string | null = null;
  for (const rel of parseRelationships(sheetRelsXml).values()) {
    if (rel.type.endsWith('/drawing')) {
      drawingEntry = resolvePath(dirName(sheetEntry), rel.target);
      break;
    }
  }
  if (!drawingEntry) return [];

  const drawingXml = entryText(entries, drawingEntry);
  if (!drawingXml) return [];
  const drawingRels = parseRelationships(entryText(entries, relsPathFor(drawingEntry)) || '');

  const images: SheetEmbeddedImage[] = [];
  const seenMedia = new Set<string>();
  const drawing = parseXml(drawingXml);
  for (const picture of Array.from(drawing.getElementsByTagNameNS('*', 'pic'))) {
    const blip = picture.getElementsByTagNameNS('*', 'blip')[0];
    const relId = blip ? relationshipAttribute(blip, 'embed') : null;
    if (!relId) continue;
    const target = drawingRels.get(relId)?.target;
    if (!target) continue;
    const mediaPath = resolvePath(dirName(drawingEntry), target);
    if (seenMedia.has(mediaPath)) continue;
    const bytes = entryBytes(entries, mediaPath);
    if (!bytes) continue;
    const mimeType = MIME_BY_EXTENSION[baseName(mediaPath).split('.').pop()?.toLowerCase() || ''];
    if (!mimeType) continue;
    seenMedia.add(mediaPath);
    images.push({
      mediaPath,
      fileName: baseName(mediaPath),
      mimeType,
      bytes: bytes.byteLength,
      dataUrl: `data:${mimeType};base64,${bytesToBase64(bytes)}`,
    });
  }
  return images;
}
