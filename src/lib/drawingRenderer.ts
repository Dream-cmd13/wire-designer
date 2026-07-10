import type { DrawingDocument, DrawingObject, DrawingPoint } from '@/types/drawing';

function drawPolyline(context: CanvasRenderingContext2D, points: DrawingPoint[], curve: boolean) {
  if (points.length < 2) return;
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  if (curve && points.length >= 3) {
    for (let index = 1; index < points.length - 1; index += 1) {
      const point = points[index];
      const next = points[index + 1];
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
  } else {
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  }
  context.stroke();
}

function drawTable(context: CanvasRenderingContext2D, object: Extract<DrawingObject, { kind: 'table' | 'bom-table' | 'wiring-table' }>) {
  const rowHeight = 18;
  const columnWidth = object.width / Math.max(1, object.columns.length);
  const maxBodyRows = Math.max(0, Math.floor(object.height / rowHeight) - 1);
  const hasMoreRows = object.rows.length > maxBodyRows;
  const visibleRows = object.rows.slice(0, hasMoreRows ? Math.max(0, maxBodyRows - 1) : maxBodyRows);
  context.fillStyle = object.style.fill;
  context.fillRect(0, 0, object.width, object.height);
  context.strokeRect(0, 0, object.width, object.height);
  context.save();
  context.beginPath();
  context.rect(0, 0, object.width, object.height);
  context.clip();
  context.font = `600 ${object.style.fontSize}px Arial`;
  object.columns.forEach((column, index) => {
    context.fillText(column, index * columnWidth + 5, rowHeight - 6);
    context.beginPath();
    context.moveTo(index * columnWidth, 0);
    context.lineTo(index * columnWidth, object.height);
    context.stroke();
  });
  context.beginPath();
  context.moveTo(0, rowHeight);
  context.lineTo(object.width, rowHeight);
  context.stroke();
  context.font = `${Math.max(8, object.style.fontSize - 1)}px Arial`;
  visibleRows.forEach((row, rowIndex) => {
    const y = rowHeight * (rowIndex + 2);
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(object.width, y);
    context.stroke();
    object.columns.forEach((column, columnIndex) => {
      context.fillText(row[column] ?? '', columnIndex * columnWidth + 5, y - 6, columnWidth - 8);
    });
  });
  if (hasMoreRows) {
    const y = rowHeight * (visibleRows.length + 2);
    context.beginPath();
    context.moveTo(0, y - rowHeight);
    context.lineTo(object.width, y - rowHeight);
    context.stroke();
    context.fillText(`另有 ${object.rows.length - visibleRows.length} 行，详见导出明细`, 5, y - 6, object.width - 10);
  }
  context.restore();
}

function drawObject(context: CanvasRenderingContext2D, object: DrawingObject) {
  context.save();
  context.translate(object.x + object.width / 2, object.y + object.height / 2);
  context.rotate((object.rotation * Math.PI) / 180);
  context.translate(-object.width / 2, -object.height / 2);
  context.strokeStyle = object.style.stroke;
  context.fillStyle = object.style.color;
  context.lineWidth = object.style.strokeWidth;
  context.font = `${object.style.fontSize}px Arial`;

  if (object.kind === 'connector') {
    context.fillStyle = object.style.fill;
    context.fillRect(0, 0, object.width, object.height);
    context.strokeRect(0, 0, object.width, object.height);
    context.fillStyle = object.style.color;
    context.font = `600 ${object.style.fontSize}px Arial`;
    context.fillText(object.label, 8, 18, object.width - 16);
    context.beginPath();
    context.moveTo(0, 25);
    context.lineTo(object.width, 25);
    context.stroke();
    context.font = '9px Arial';
    Array.from({ length: Math.min(object.pinCount, 40) }, (_, index) => {
      const column = index % 2;
      const row = Math.floor(index / 2);
      context.fillText(String(index + 1), 18 + column * 65, 45 + row * 9);
    });
  } else if (object.kind === 'wire-bundle') {
    context.fillStyle = object.style.fill;
    context.beginPath();
    context.roundRect(0, object.height / 2 - 16, object.width, 32, 16);
    context.fill();
    context.stroke();
    for (let index = 0; index < Math.min(12, object.wireCount); index += 1) {
      const y = object.height * 0.25 + index * 5;
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(object.width, y);
      context.stroke();
    }
    context.fillStyle = object.style.color;
    context.fillText(`${object.label} · ${object.wireCount}芯`, 8, object.height - 5);
  } else if (object.kind === 'accessory') {
    context.fillStyle = object.style.fill;
    context.fillRect(0, 0, object.width, object.height);
    context.strokeRect(0, 0, object.width, object.height);
    context.fillStyle = object.style.color;
    context.fillText(object.label, 6, object.height / 2 + 4);
  } else if (object.kind === 'text' || object.kind === 'label') {
    context.fillText(object.text, 0, object.style.fontSize);
  } else if (object.kind === 'dimension') {
    const y = object.height / 2;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(object.width, y);
    context.moveTo(0, y - 8);
    context.lineTo(0, y + 8);
    context.moveTo(object.width, y - 8);
    context.lineTo(object.width, y + 8);
    context.stroke();
    const labelWidth = context.measureText(object.label).width;
    context.fillStyle = '#ffffff';
    context.fillRect(object.width / 2 - labelWidth / 2 - 5, y - 12, labelWidth + 10, 17);
    context.fillStyle = object.style.color;
    context.fillText(object.label, object.width / 2 - labelWidth / 2, y + 1);
  } else if (object.kind === 'line' || object.kind === 'polyline' || object.kind === 'curve' || object.kind === 'freehand') {
    drawPolyline(context, object.points.map((point) => ({ x: point.x - object.x, y: point.y - object.y })), object.kind === 'curve');
  } else if (object.kind === 'table' || object.kind === 'bom-table' || object.kind === 'wiring-table') {
    drawTable(context, object);
  } else if (object.kind === 'tech-requirements') {
    context.fillStyle = object.style.fill;
    context.fillRect(0, 0, object.width, object.height);
    context.strokeRect(0, 0, object.width, object.height);
    context.fillStyle = object.style.color;
    context.font = `600 ${object.style.fontSize}px Arial`;
    context.fillText('技术要求', 10, 18);
    context.font = `${object.style.fontSize}px Arial`;
    object.requirements.forEach((requirement, index) => context.fillText(`${index + 1}. ${requirement}`, 10, 38 + index * 18, object.width - 20));
  } else if (object.kind === 'title-block') {
    context.fillStyle = object.style.fill;
    context.fillRect(0, 0, object.width, object.height);
    context.strokeRect(0, 0, object.width, object.height);
    context.beginPath();
    context.moveTo(object.width - 80, 0);
    context.lineTo(object.width - 80, object.height);
    context.stroke();
    context.fillStyle = object.style.color;
    context.font = `600 ${object.style.fontSize}px Arial`;
    context.fillText(object.title, 10, 20, object.width - 100);
    context.font = '10px Arial';
    context.fillText(`图号：${object.drawingNo}`, 10, 42);
    context.fillText(`版本：${object.revision}`, object.width - 70, 32);
  }
  context.restore();
}

export function renderDrawingCanvas(
  context: CanvasRenderingContext2D,
  document: DrawingDocument,
  selectedObjectId?: string | null,
) {
  context.clearRect(0, 0, document.page.width, document.page.height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, document.page.width, document.page.height);
  context.strokeStyle = '#111827';
  context.lineWidth = 1;
  context.strokeRect(20, 20, document.page.width - 40, document.page.height - 40);
  document.objects
    .filter((object) => object.visible)
    .sort((left, right) => left.zIndex - right.zIndex)
    .forEach((object) => {
      drawObject(context, object);
      if (object.id === selectedObjectId) {
        context.save();
        context.strokeStyle = '#2563eb';
        context.lineWidth = 2;
        context.setLineDash([5, 4]);
        context.strokeRect(object.x - 4, object.y - 4, object.width + 8, object.height + 8);
        context.restore();
      }
    });
}

export function getDrawingObjectAtPoint(document: DrawingDocument, point: DrawingPoint): DrawingObject | undefined {
  return document.objects
    .filter((object) => object.visible)
    .sort((left, right) => right.zIndex - left.zIndex)
    .find((object) => point.x >= object.x && point.x <= object.x + object.width && point.y >= object.y && point.y <= object.y + object.height);
}
