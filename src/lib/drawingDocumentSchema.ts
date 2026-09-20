import type { DrawingDocument, DrawingObject } from '@/types/drawing';

const DRAWING_OBJECT_KINDS: ReadonlySet<string> = new Set([
  'connector',
  'wire-bundle',
  'accessory',
  'text',
  'label',
  'dimension',
  'line',
  'polyline',
  'curve',
  'freehand',
  'table',
  'bom-table',
  'wiring-table',
  'tech-requirements',
  'group',
  'icon',
  'title-block',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalFiniteNumber(value: unknown): boolean {
  return value === undefined || isFiniteNumber(value);
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(isFiniteNumber);
}

function isMergeCell(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.rowIndex)
    && isFiniteNumber(value.columnIndex)
    && isFiniteNumber(value.rowSpan)
    && isFiniteNumber(value.columnSpan);
}

function isTextSizes(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((size) => (
    isRecord(size)
    && isFiniteNumber(size.width)
    && isFiniteNumber(size.height)
    && isFiniteNumber(size.fontSize)
  ));
}

function isTextOffsets(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every(isPoint);
}

function isTableRole(value: unknown): boolean {
  return value === 'bom' || value === 'revision' || value === 'title-block';
}

function isPoint(value: unknown): boolean {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isStyle(value: unknown): boolean {
  return isRecord(value)
    && typeof value.fill === 'string'
    && typeof value.stroke === 'string'
    && isFiniteNumber(value.strokeWidth)
    && isFiniteNumber(value.fontSize)
    && typeof value.color === 'string';
}

function isTableObject(value: Record<string, unknown>): boolean {
  if (typeof value.title !== 'string' || !isStringArray(value.columns)) return false;
  if (!Array.isArray(value.rows)) return false;
  const rowsValid = value.rows.every((row) => (
    isRecord(row) && Object.values(row).every((cell) => typeof cell === 'string')
  ));
  if (!rowsValid) return false;
  if (value.showTitleRow !== undefined && typeof value.showTitleRow !== 'boolean') return false;
  if (!isOptionalFiniteNumber(value.titleRowHeight)) return false;
  if (!isOptionalFiniteNumber(value.headerRowHeight)) return false;
  if (value.columnWidths !== undefined && !isFiniteNumberArray(value.columnWidths)) return false;
  if (value.rowHeights !== undefined && !isFiniteNumberArray(value.rowHeights)) return false;
  if (value.columnKeys !== undefined && !isStringArray(value.columnKeys)) return false;
  if (value.tableRole !== undefined && !isTableRole(value.tableRole)) return false;
  if (value.mergedCells !== undefined) {
    if (!Array.isArray(value.mergedCells) || !value.mergedCells.every(isMergeCell)) return false;
  }
  if (value.textSizes !== undefined && !isTextSizes(value.textSizes)) return false;
  if (value.textOffsets !== undefined && !isTextOffsets(value.textOffsets)) return false;
  if (value.projectionCellKey !== undefined && typeof value.projectionCellKey !== 'string') return false;
  return true;
}

export function isDrawingObject(value: unknown): value is DrawingObject {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.kind !== 'string' || !DRAWING_OBJECT_KINDS.has(value.kind)) return false;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return false;
  if (!isFiniteNumber(value.width) || !isFiniteNumber(value.height)) return false;
  if (!isFiniteNumber(value.rotation) || !isFiniteNumber(value.zIndex)) return false;
  if (typeof value.locked !== 'boolean' || typeof value.visible !== 'boolean') return false;
  if (!isStyle(value.style)) return false;

  switch (value.kind) {
    case 'connector':
      return typeof value.label === 'string'
        && isFiniteNumber(value.pinCount)
        && (value.gender === 'male' || value.gender === 'female' || value.gender === 'receptacle')
        && (value.side === 'left' || value.side === 'right' || value.side === 'none');
    case 'wire-bundle':
      return typeof value.label === 'string'
        && isFiniteNumber(value.wireCount)
        && (value.wireKind === 'electronic'
          || value.wireKind === 'twisted'
          || value.wireKind === 'ribbon'
          || value.wireKind === 'parallel'
          || value.wireKind === 'shielded');
    case 'accessory':
      return typeof value.label === 'string'
        && (value.accessoryType === 'sleeve'
          || value.accessoryType === 'packaging'
          || value.accessoryType === 'specification'
          || value.accessoryType === 'model');
    case 'text':
    case 'label':
      return typeof value.text === 'string';
    case 'dimension':
      return typeof value.label === 'string' && isPoint(value.start) && isPoint(value.end);
    case 'line':
    case 'polyline':
    case 'curve':
    case 'freehand':
      return Array.isArray(value.points)
        && value.points.length > 0
        && value.points.every(isPoint)
        && typeof value.orthogonal === 'boolean'
        && (value.name === undefined || typeof value.name === 'string');
    case 'table':
    case 'bom-table':
    case 'wiring-table':
      return isTableObject(value);
    case 'tech-requirements':
      return isStringArray(value.requirements);
    case 'group':
      return (value.groupKind === 'wire-bundle' || value.groupKind === 'wire-core')
        && Array.isArray(value.children)
        && value.children.every(isDrawingObject);
    case 'icon':
      return typeof value.name === 'string' && typeof value.svgPath === 'string';
    case 'title-block':
      return typeof value.title === 'string'
        && typeof value.drawingNo === 'string'
        && typeof value.revision === 'string';
    default:
      return false;
  }
}

function isDrawingPage(value: unknown): boolean {
  return isRecord(value)
    && value.size === 'A4'
    && value.orientation === 'landscape'
    && isFiniteNumber(value.width)
    && isFiniteNumber(value.height);
}

function isTitleBlock(value: unknown): boolean {
  return isRecord(value)
    && typeof value.title === 'string'
    && typeof value.drawingNo === 'string'
    && typeof value.revision === 'string';
}

function isRevisionRow(value: unknown): boolean {
  return isRecord(value)
    && typeof value.revision === 'string'
    && typeof value.description === 'string'
    && typeof value.date === 'string';
}

export function isDrawingDocument(value: unknown): value is DrawingDocument {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== 1) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.name !== 'string') return false;
  if (!isFiniteNumber(value.createdAt) || !isFiniteNumber(value.updatedAt)) return false;
  if (!isDrawingPage(value.page)) return false;
  if (!Array.isArray(value.objects) || !value.objects.every(isDrawingObject)) return false;
  if (!isTitleBlock(value.titleBlock)) return false;
  if (!Array.isArray(value.revisionTable) || !value.revisionTable.every(isRevisionRow)) return false;
  if (!isStringArray(value.techRequirements)) return false;
  return true;
}
