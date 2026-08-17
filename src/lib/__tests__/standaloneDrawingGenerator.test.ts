import { describe, expect, it } from 'vitest';
import { DRAWING_PAGE_INSET } from '@/lib/drawingDocument';
import {
  applyDrawingWireBatch, countDrawingMaterialKinds, createDrawingFromWizard,
  validateStandaloneDrawingWizard,
} from '@/lib/drawingGenerator';
import { resolveDrawingTableCells } from '@/lib/drawingTableLayout';
import type { DrawingCatalogResource, DrawingConnectorResource, DrawingWizardDraft } from '@/types/drawing';

const connector: DrawingConnectorResource = { id: 'xh-4', name: 'XH2.54-4P', gender: 'female', pinCount: 4, category: '连接器', series: 'XH2.54', rowCount: 1, pitchMm: 2.54, scope: 'public' };
const wireResource: DrawingCatalogResource = { id: 'ul1007', resourceItemId: 'wire-1', resourceType: 'wire', name: 'UL1007', model: 'UL1007-24AWG', resourceGroup: '线材' };
const protectiveSleeveResource: DrawingCatalogResource = {
  id: 'heat-shrink-6', resourceItemId: 'sleeve-1', resourceType: 'protective_sleeve',
  name: 'Φ6热缩套管', model: 'HS-6MM', resourceGroup: '绘图辅材',
  specification: 'Φ6mm · 2:1 · polyolefin · black', unit: 'PCS',
};

const wires = Array.from({ length: 4 }, (_, index) => ({ pin: index + 1, color: '#111827', lengthMm: 320, wireNo: `W-${index + 1}`, connectionNo: String(index + 1), targetPin: index + 1 }));

function draft(): DrawingWizardDraft {
  return {
    endpointForm: 'double-end',
    leftConnector: connector, rightConnector: connector, drawingNo: 'WH-4P', totalLengthMm: 320,
    toleranceMm: 5, hasMold: true, protectiveSleeveResource, wires, wireResource,
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

  it('uses the selected protective sleeve for material count, drawing label, and BOM code', () => {
    const drawingDraft = draft();

    expect(countDrawingMaterialKinds(drawingDraft)).toBe(4);

    const drawing = createDrawingFromWizard(drawingDraft);
    expect(drawing.objects).toContainEqual(expect.objectContaining({
      kind: 'accessory', accessoryType: 'sleeve', label: 'Φ6热缩套管',
    }));
    const bom = drawing.objects.find((object) => object.kind === 'bom-table');
    expect(bom?.kind).toBe('bom-table');
    if (bom?.kind === 'bom-table') {
      expect(bom.rows.find((row) => row['物料名称/规格'] === 'Φ6热缩套管')).toMatchObject({
        物料编码: 'HS-6MM', 单位: 'PCS', 用量: '1',
      });
    }
  });

  it('omits sleeve objects and BOM rows when no sleeve is selected', () => {
    const drawingDraft = { ...draft(), protectiveSleeveResource: undefined };

    expect(countDrawingMaterialKinds(drawingDraft)).toBe(3);

    const drawing = createDrawingFromWizard(drawingDraft);
    expect(drawing.objects.some((object) => object.kind === 'accessory' && object.accessoryType === 'sleeve')).toBe(false);
    const bom = drawing.objects.find((object) => object.kind === 'bom-table');
    expect(bom?.kind).toBe('bom-table');
    if (bom?.kind === 'bom-table') {
      expect(bom.rows.some((row) => row['物料名称/规格'] === 'Φ6热缩套管')).toBe(false);
    }
  });

  it('persists only canonical endpoint and protective sleeve fields', () => {
    const drawing = createDrawingFromWizard(draft());

    expect(drawing.wizardSource).toMatchObject({
      endpointForm: 'double-end',
      protectiveSleeveResource,
    });
    expect(drawing.wizardSource).not.toHaveProperty('topology');
    expect(drawing.wizardSource).not.toHaveProperty('drawingType');
    expect(drawing.wizardSource).not.toHaveProperty('wireKind');
    expect(drawing.wizardSource).not.toHaveProperty('heatShrink');
    expect(drawing.wizardSource).not.toHaveProperty('heatShrinkResource');
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
