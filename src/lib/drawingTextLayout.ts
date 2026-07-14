import type { DrawingObject, DrawingPoint } from '@/types/drawing';

export type EditableDrawingTextField = 'text' | 'label' | 'title' | 'drawingNo' | 'revision' | 'requirements';

export type EditableDrawingTextRun = {
  valueStart: number;
  valueEnd: number;
  editableText: string;
  prefix: string;
  suffix: string;
  displayText: string;
  x: number;
  baseline: number;
  font: string;
  maxWidth?: number;
};

export type DrawingCaretLine = { start: DrawingPoint; end: DrawingPoint };

function run(
  editableText: string,
  x: number,
  baseline: number,
  font: string,
  options: { prefix?: string; suffix?: string; maxWidth?: number; valueStart?: number } = {},
): EditableDrawingTextRun {
  const prefix = options.prefix ?? '';
  const suffix = options.suffix ?? '';
  const valueStart = options.valueStart ?? 0;
  return {
    valueStart,
    valueEnd: valueStart + editableText.length,
    editableText,
    prefix,
    suffix,
    displayText: `${prefix}${editableText}${suffix}`,
    x,
    baseline,
    font,
    maxWidth: options.maxWidth,
  };
}

function setFont(context: CanvasRenderingContext2D, font: string) {
  context.font = font;
}

export function getEditableDrawingTextRuns(
  context: CanvasRenderingContext2D,
  object: DrawingObject,
  field: EditableDrawingTextField,
  value: string,
): EditableDrawingTextRun[] {
  const fontSize = object.style.fontSize;
  const normalFont = `${fontSize}px Arial`;

  if ((object.kind === 'text' || object.kind === 'label') && field === 'text') {
    return [run(value, 0, fontSize, normalFont)];
  }
  if (object.kind === 'connector' && field === 'label') {
    return [run(value, 8, 18, `600 ${fontSize}px Arial`, { maxWidth: object.width - 16 })];
  }
  if (object.kind === 'wire-bundle' && field === 'label') {
    return [run(value, 8, object.height - 5, normalFont, { suffix: ` · ${object.wireCount}芯` })];
  }
  if (object.kind === 'accessory' && field === 'label') {
    return [run(value, 6, object.height / 2 + 4, normalFont)];
  }
  if (object.kind === 'dimension' && field === 'label') {
    setFont(context, normalFont);
    const width = context.measureText(value).width;
    return [run(value, object.width / 2 - width / 2, object.height / 2 + 1, normalFont)];
  }
  if (object.kind === 'title-block') {
    if (field === 'title') return [run(value, 10, 20, `600 ${fontSize}px Arial`, { maxWidth: object.width - 100 })];
    if (field === 'drawingNo') return [run(value, 10, 42, '10px Arial', { prefix: '图号：' })];
    if (field === 'revision') return [run(value, object.width - 70, 32, '10px Arial', { prefix: '版本：' })];
  }
  if (object.kind === 'tech-requirements' && field === 'requirements') {
    const lines = value.split('\n');
    let valueStart = 0;
    return lines.map((line, index) => {
      const textRun = run(line, 10, 38 + index * 18, normalFont, {
        prefix: `${index + 1}. `,
        maxWidth: object.width - 20,
        valueStart,
      });
      valueStart += line.length + 1;
      return textRun;
    });
  }
  return [];
}

function horizontalScale(context: CanvasRenderingContext2D, textRun: EditableDrawingTextRun) {
  setFont(context, textRun.font);
  const width = context.measureText(textRun.displayText).width;
  return textRun.maxWidth && width > textRun.maxWidth ? textRun.maxWidth / width : 1;
}

function rotateLocalPoint(object: DrawingObject, point: DrawingPoint, inverse = false): DrawingPoint {
  const centerX = object.width / 2;
  const centerY = object.height / 2;
  const radians = (object.rotation * Math.PI / 180) * (inverse ? -1 : 1);
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const x = point.x - centerX;
  const y = point.y - centerY;
  return { x: centerX + x * cosine - y * sine, y: centerY + x * sine + y * cosine };
}

function findRun(runs: EditableDrawingTextRun[], selectionStart: number) {
  return runs.find((candidate) => selectionStart <= candidate.valueEnd) ?? runs[runs.length - 1];
}

export function measureDrawingCaret(
  context: CanvasRenderingContext2D,
  object: DrawingObject,
  field: EditableDrawingTextField,
  value: string,
  selectionStart: number,
): DrawingCaretLine {
  const runs = getEditableDrawingTextRuns(context, object, field, value);
  const textRun = findRun(runs, selectionStart);
  if (!textRun) return { start: { x: object.x, y: object.y }, end: { x: object.x, y: object.y } };
  setFont(context, textRun.font);
  const relativeIndex = Math.max(0, Math.min(textRun.editableText.length, selectionStart - textRun.valueStart));
  const beforeCaret = `${textRun.prefix}${textRun.editableText.slice(0, relativeIndex)}`;
  const scale = horizontalScale(context, textRun);
  const caretX = textRun.x + context.measureText(beforeCaret).width * scale;
  const metrics = context.measureText(textRun.displayText || 'M');
  const fontSize = Number.parseFloat(textRun.font.match(/[\d.]+px/)?.[0] ?? '') || object.style.fontSize;
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const localStart = rotateLocalPoint(object, { x: caretX, y: textRun.baseline - ascent });
  const localEnd = rotateLocalPoint(object, { x: caretX, y: textRun.baseline + descent });
  return {
    start: { x: object.x + localStart.x, y: object.y + localStart.y },
    end: { x: object.x + localEnd.x, y: object.y + localEnd.y },
  };
}

export function getDrawingCaretIndexAtPoint(
  context: CanvasRenderingContext2D,
  object: DrawingObject,
  field: EditableDrawingTextField,
  value: string,
  point: DrawingPoint,
): number {
  const worldLocal = { x: point.x - object.x, y: point.y - object.y };
  const local = rotateLocalPoint(object, worldLocal, true);
  const runs = getEditableDrawingTextRuns(context, object, field, value);
  const textRun = runs.reduce((nearest, candidate) =>
    Math.abs(candidate.baseline - local.y) < Math.abs(nearest.baseline - local.y) ? candidate : nearest, runs[0]);
  if (!textRun) return 0;
  setFont(context, textRun.font);
  const scale = horizontalScale(context, textRun);
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index <= textRun.editableText.length; index += 1) {
    const width = context.measureText(`${textRun.prefix}${textRun.editableText.slice(0, index)}`).width * scale;
    const distance = Math.abs(textRun.x + width - local.x);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }
  return textRun.valueStart + nearestIndex;
}
