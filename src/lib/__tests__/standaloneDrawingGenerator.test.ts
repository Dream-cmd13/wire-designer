import { describe, expect, it } from 'vitest';
import { DRAWING_PAGE_INSET } from '@/lib/drawingDocument';
import {
  applyDrawingWireBatch, countDrawingMaterialKinds, createDrawingFromWizard,
  validateStandaloneDrawingWizard,
} from '@/lib/drawingGenerator';
import { resolveDrawingTableCells } from '@/lib/drawingTableLayout';
import type { DrawingCatalogResource, DrawingConnectorResource, DrawingWizardDraft } from '@/types/drawing';

const connector: DrawingConnectorResource = { id: 'xh-4', name: 'XH2.54-4P', gender: 'female', pinCount: 4, category: '连接器', series: 'XH2.54', rowCount: 1, pitchMm: 2.54, scope: 'public' };
const wireResource: DrawingCatalogResource = { id: 'ul1007', catalogItemId: 'wire-1', resourceType: 'wire', name: 'UL1007', model: 'UL1007-24AWG', category: '线材' };

const wires = Array.from({ length: 4 }, (_, index) => ({ pin: index + 1, color: '#111827', lengthMm: 320, wireNo: `W-${index + 1}`, connectionNo: String(index + 1), targetPin: index + 1 }));

function draft(): DrawingWizardDraft {
  return {
    topology: { drawingType: 'internal', topology: 'double-end', wireKind: 'shielded' },
    leftConnector: connector, rightConnector: connector, drawingNo: 'WH-4P', totalLengthMm: 320,
    toleranceMm: 5, hasMold: true, heatShrink: 'Φ6热缩套管', wires, wireResource,
  };
}

describe('standalone drawing generator', () => {
  it('applies reverse wiring and sequential wire numbers', () => {
    const reversed = applyDrawingWireBatch(wires, { connection: 'reverse', wireNoPrefix: 'UL-', startNumber: 1 });
    expect(reversed.map((wire) => wire.targetPin)).toEqual([4, 3, 2, 1]);
    expect(reversed.map((wire) => wire.wireNo)).toEqual(['UL-01', 'UL-02', 'UL-03', 'UL-04']);
  });

  it('counts derived material kinds and generates a nested wire bundle', () => {
    expect(countDrawingMaterialKinds(draft())).toBe(4);
    const drawing = createDrawingFromWizard(draft());
    const bundle = drawing.objects.find((object) => object.kind === 'group' && object.groupKind === 'wire-bundle');
    expect(bundle?.kind).toBe('group');
    if (bundle?.kind === 'group') expect(bundle.children.every((child) => child.kind === 'group' && child.groupKind === 'wire-core')).toBe(true);
    expect(drawing.objects.some((object) => object.kind === 'wiring-table' && object.rows[0].P2 === '1')).toBe(true);
    const bom = drawing.objects.find((object) => object.kind === 'bom-table');
    expect(bom?.kind).toBe('bom-table');
    if (bom?.kind === 'bom-table') {
      expect(bom.rows.find((row) => row['物料名称/规格'] === connector.name)?.用量).toBe('2');
      expect(bom.rows.find((row) => row['物料名称/规格'] === wireResource.name)).toMatchObject({ 单位: 'M', 用量: '1.28' });
    }
  });

  it('anchors generated BOM rows to the drawing frame bottom', () => {
    const drawing = createDrawingFromWizard(draft());
    const bom = drawing.objects.find((object) => object.kind === 'bom-table');

    expect(bom?.kind).toBe('bom-table');
    if (bom?.kind !== 'bom-table') return;

    expect(bom.rows).toHaveLength(4);
    expect(bom.rowHeights).toEqual([18, 18, 18, 18]);
    expect(bom.height).toBe(96);
    expect(bom.y + bom.height).toBe(drawing.page.height - DRAWING_PAGE_INSET);

    const renderedBottom = Math.max(...resolveDrawingTableCells(bom).map((cell) => cell.y + cell.height));
    expect(renderedBottom).toBe(bom.height);
  });

  it('leaves the title block drawing number blank when no drawing number is provided', () => {
    const drawing = createDrawingFromWizard({ ...draft(), drawingNo: '' });
    const title = drawing.objects.find((object) => object.kind === 'table' && object.tableRole === 'title-block')!;

    expect(title.kind).toBe('table');
    if (title.kind !== 'table') return;
    expect(title.rows[3].C4).toBe('');
    expect(drawing.titleBlock.drawingNo).toBe('');
  });

  it('blocks missing wire resources, invalid core lengths, and out-of-range targets', () => {
    const invalid = draft();
    invalid.wireResource = undefined;
    invalid.wires = [{ ...invalid.wires[0], lengthMm: 0, targetPin: 99 }];
    const validation = validateStandaloneDrawingWizard(invalid);
    expect(validation.errors).toContain('请选择线材规格。');
    expect(validation.errors).toContain('芯线长度必须大于 0mm。');
    expect(validation.errors).toContain('目标 PIN 必须在右连接器 PIN 范围内。');
  });
});
