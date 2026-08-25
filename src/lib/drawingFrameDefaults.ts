import type { HarnessConfig, ProductionDrawingFrame } from '@/types/harness';

/**
 * Format a Date or timestamp into YYYY.MM.DD standard drawing date format
 */
export function formatDrawingDate(input?: Date | number | string): string {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${y}.${m}.${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/**
 * Generate a complete default ProductionDrawingFrame with today's date and the current user's name
 */
export function createDefaultDrawingFrame(
  currentUser?: { name?: string } | null,
  config?: Partial<HarnessConfig>,
): ProductionDrawingFrame {
  const today = formatDrawingDate(new Date());
  const author = currentUser?.name?.trim() || '工程师';
  const defaultPartNo = config?.name && config.name !== '新建线束'
    ? config.name
    : 'M12A04-07-093-1-10-500';

  return {
    partNo: defaultPartNo,
    title: '线束成品图纸',
    drawingNo: 'ENDE05',
    revision: 'X0',
    sheet: '1/1',
    scale: '1:1',
    unit: 'mm',
    size: 'A4',
    approved: {
      name: '',
      date: '',
    },
    designer: {
      name: '',
      date: '',
    },
    drawn: {
      name: author,
      date: today,
    },
    revisionRows: [
      { rev: 'X0', description: 'NEW RELEASE', date: today },
      { rev: '', description: '', date: '' },
      { rev: '', description: '', date: '' },
      { rev: '', description: '', date: '' },
    ],
    complianceNote: '该产品的所有材料及加工工艺必须符合 “WL-PZ-001 ” HSF 技术标准的控制要求。',
    companyNameCn: '万连科技',
    companyNameEn: 'WanLian Technology Co., Ltd',
  };
}

/**
 * Merge an existing or partial frame with defaults for any missing/empty properties
 */
export function ensureDrawingFrame(
  frame?: Partial<ProductionDrawingFrame> | null,
  currentUser?: { name?: string } | null,
  config?: Partial<HarnessConfig>,
): ProductionDrawingFrame {
  const defaults = createDefaultDrawingFrame(currentUser, config);
  if (!frame) return defaults;

  const revisionRows = Array.isArray(frame.revisionRows) && frame.revisionRows.length > 0
    ? frame.revisionRows.map((r, i) => ({
        rev: r?.rev ?? (defaults.revisionRows[i]?.rev || ''),
        description: r?.description ?? (defaults.revisionRows[i]?.description || ''),
        date: r?.date ?? (defaults.revisionRows[i]?.date || ''),
      }))
    : defaults.revisionRows;

  // Pad to 4 rows if fewer
  while (revisionRows.length < 4) {
    revisionRows.push({ rev: '', description: '', date: '' });
  }

  return {
    partNo: frame.partNo ?? defaults.partNo,
    title: frame.title ?? defaults.title,
    drawingNo: frame.drawingNo ?? defaults.drawingNo,
    revision: frame.revision ?? defaults.revision,
    sheet: frame.sheet ?? defaults.sheet,
    scale: frame.scale ?? defaults.scale,
    unit: frame.unit ?? defaults.unit,
    size: frame.size ?? defaults.size,
    approved: {
      name: frame.approved?.name ?? defaults.approved.name,
      date: frame.approved?.date ?? defaults.approved.date,
    },
    designer: {
      name: frame.designer?.name ?? defaults.designer.name,
      date: frame.designer?.date ?? defaults.designer.date,
    },
    drawn: {
      name: frame.drawn?.name ?? defaults.drawn.name,
      date: frame.drawn?.date ?? defaults.drawn.date,
    },
    revisionRows,
    complianceNote: frame.complianceNote ?? defaults.complianceNote,
    companyNameCn: frame.companyNameCn ?? defaults.companyNameCn,
    companyNameEn: frame.companyNameEn ?? defaults.companyNameEn,
  };
}
