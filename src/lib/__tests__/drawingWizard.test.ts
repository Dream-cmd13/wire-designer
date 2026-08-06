import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createDefaultDrawingWireRows,
  createDrawingConnectorResources,
  createHarnessConfigFromDrawingWizard,
  validateDrawingWizardDraft,
} from '@/lib/drawingWizard';
import {
  getProductionDrawingExportFilename,
  serializeProductionDrawingPdf,
  serializeProductionDrawingSvg,
} from '@/lib/productionDrawingExport';
import { updateProductionDrawingObject } from '@/lib/productionDrawingGenerator';
import type { DrawingWizardDraft, HarnessConfig } from '@/types/harness';
import { clearCatalogSnapshot, setCatalogSnapshot } from '@/lib/catalogRuntime';
import { TEST_CATALOG_SNAPSHOT } from './fixtures/catalogFixture';

function makeBaseConfig(): HarnessConfig {
  return {
    schemaVersion: 3,
    id: 'base',
    name: 'Base Project',
    createdAt: 0,
    updatedAt: 0,
    connectors: [],
    materials: [],
    protectiveSleeves: [],
    models: [],
    quantity: 1,
    leadTime: 'standard',
  };
}

describe('drawing wizard generator', () => {
  beforeEach(() => setCatalogSnapshot(TEST_CATALOG_SNAPSHOT));
  afterAll(() => clearCatalogSnapshot());

  it('generates a double-end 40PIN jacketed harness with drawing objects', () => {
    const left = createDrawingConnectorResources('left').find((item) => item.id === 'a1008h-2x20p');
    const right = createDrawingConnectorResources('right').find((item) => item.id === 'a1008h-2x20p');
    expect(left).toBeDefined();
    expect(right).toBeDefined();

    const draft: DrawingWizardDraft = {
      topology: {
        harnessType: 'internal',
        topology: 'double-end',
        wireKind: 'jacketed',
      },
      leftResource: left,
      rightResource: right,
      attributes: {
        drawingWireNo: 'WH-A1008H-40P',
        totalLengthMm: 320,
        lengthToleranceMm: 10,
      },
      wires: createDefaultDrawingWireRows(40, 320),
    };

    const next = createHarnessConfigFromDrawingWizard(makeBaseConfig(), draft);

    expect(next.connectors).toHaveLength(2);
    expect(next.materials).toHaveLength(1);
    expect(next.materials[0].spec.kind).toBe('jacketed');
    if (next.materials[0].spec.kind === 'jacketed') {
      expect(next.materials[0].spec.coreCount).toBe(40);
      expect(next.materials[0].spec.coreColors).toHaveLength(40);
    }
    expect(next.materials[0].circuits).toHaveLength(40);
    expect(next.materials[0].circuits[0].start?.pin).toBe(1);
    expect(next.materials[0].circuits[0].end?.pin).toBe(1);
    expect(next.materials[0].circuits[39].start?.pin).toBe(40);
    expect(next.materials[0].circuits[39].end?.pin).toBe(40);
    expect(next.productionDrawing?.objects.some((object) => object.kind === 'dimension' && object.label === '320±10mm')).toBe(true);
    const wiringTable = next.productionDrawing?.objects.find((object) => object.kind === 'wiring-table');
    expect(wiringTable).toBeDefined();
    if (wiringTable?.kind === 'wiring-table') {
      expect(wiringTable.rows).toHaveLength(40);
      expect(wiringTable.rows[0]).toMatchObject({
        item: 1,
        signalName: 'WIRE-01',
        connectionNo: '1',
        startPin: 1,
        endPin: 1,
        lengthMm: 320,
      });
    }
  });

  it('generates a single-end electronic harness as per-wire materials', () => {
    const resource = createDrawingConnectorResources('none')[0];
    const draft: DrawingWizardDraft = {
      topology: {
        harnessType: 'internal',
        topology: 'single-end',
        wireKind: 'electronic',
      },
      singleResource: resource,
      attributes: {
        drawingWireNo: 'WH-SINGLE',
        totalLengthMm: 500,
        lengthToleranceMm: 5,
        tailTreatment: {
          stripTinLengthMm: 3,
          halfStrip: true,
        },
      },
      wires: createDefaultDrawingWireRows(2, 500),
    };

    const next = createHarnessConfigFromDrawingWizard(makeBaseConfig(), draft);

    expect(next.connectors).toHaveLength(1);
    expect(next.materials).toHaveLength(2);
    expect(next.materials.every((material) => material.spec.kind === 'electronic')).toBe(true);
    expect(next.materials[0].circuits[0].start?.pin).toBe(1);
    expect(next.materials[0].circuits[0].end).toBeUndefined();
    if (next.materials[0].spec.kind === 'electronic') {
      expect(next.materials[0].spec.endTreatment.end).toMatchObject({
        stripped: true,
        stripLengthMm: 3,
        termination: 'tinned',
      });
    }
    expect(next.productionDrawing?.objects.some((object) =>
      object.kind === 'text' && object.text.includes('尾端处理'))).toBe(true);
  });

  it('offers the documented core color set for generated wire rows', () => {
    const colors = createDefaultDrawingWireRows(20).map((row) => row.color);

    expect(colors).toContain('金色');
    expect(colors).toContain('黄注绿');
    expect(colors).toContain('空白');
  });

  it('reports missing total length before generation', () => {
    const resource = createDrawingConnectorResources('none')[0];
    const validation = validateDrawingWizardDraft({
      topology: {
        harnessType: 'internal',
        topology: 'single-end',
        wireKind: 'electronic',
      },
      singleResource: resource,
      attributes: {},
      wires: createDefaultDrawingWireRows(1),
    });

    expect(validation.errors).toContain('总长度必须大于 0mm。');
  });

  it('updates editable production drawing object fields', () => {
    const left = createDrawingConnectorResources('left').find((item) => item.id === 'a1008h-2x20p')!;
    const right = createDrawingConnectorResources('right').find((item) => item.id === 'a1008h-2x20p')!;
    const config = createHarnessConfigFromDrawingWizard(makeBaseConfig(), {
      topology: {
        harnessType: 'internal',
        topology: 'double-end',
        wireKind: 'jacketed',
      },
      leftResource: left,
      rightResource: right,
      attributes: {
        drawingWireNo: 'WH-A1008H-40P',
        totalLengthMm: 320,
        lengthToleranceMm: 10,
      },
      wires: createDefaultDrawingWireRows(40, 320),
    });
    const dimension = config.productionDrawing!.objects.find((object) => object.kind === 'dimension')!;

    const next = updateProductionDrawingObject(config, dimension.id, {
      x: 360,
      label: '320±5mm',
    });
    const nextDimension = next.productionDrawing!.objects.find((object) => object.id === dimension.id)!;

    expect(nextDimension.x).toBe(360);
    expect(nextDimension.kind).toBe('dimension');
    if (nextDimension.kind === 'dimension') {
      expect(nextDimension.label).toBe('320±5mm');
    }
  });

  it('keeps titleBlock summary in sync when editing the title-block object', () => {
    const resource = createDrawingConnectorResources('none')[0];
    const config = createHarnessConfigFromDrawingWizard(makeBaseConfig(), {
      topology: {
        harnessType: 'internal',
        topology: 'single-end',
        wireKind: 'electronic',
      },
      singleResource: resource,
      attributes: {
        drawingWireNo: 'WH-SINGLE',
        totalLengthMm: 500,
        lengthToleranceMm: 5,
      },
      wires: createDefaultDrawingWireRows(2, 500),
    });
    const titleBlock = config.productionDrawing!.objects.find((object) => object.kind === 'title-block')!;

    const next = updateProductionDrawingObject(config, titleBlock.id, {
      drawingNo: 'WH-EDITED',
      revision: 'B',
    });

    expect(next.productionDrawing!.titleBlock.drawingNo).toBe('WH-EDITED');
    expect(next.productionDrawing!.titleBlock.revision).toBe('B');
  });

  it('serializes generated production drawings to SVG', () => {
    const resource = createDrawingConnectorResources('none')[0];
    const config = createHarnessConfigFromDrawingWizard(makeBaseConfig(), {
      topology: {
        harnessType: 'internal',
        topology: 'single-end',
        wireKind: 'electronic',
      },
      singleResource: resource,
      attributes: {
        drawingWireNo: 'WH-SVG',
        totalLengthMm: 500,
        lengthToleranceMm: 5,
      },
      wires: createDefaultDrawingWireRows(2, 500),
    });

    const svg = serializeProductionDrawingSvg(config);

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 1200 800"');
    expect(svg).toContain('500±5mm');
    expect(svg).toContain('WH-SVG');
    expect(svg).toContain('技术要求');
    expect(svg).toContain('Wire No.');
    expect(svg).toContain('WIRE-01');
    expect(getProductionDrawingExportFilename(config, 'png')).toBe('WH-SVG.png');
  });

  it('serializes generated production drawings to a basic PDF', () => {
    const resource = createDrawingConnectorResources('none')[0];
    const config = createHarnessConfigFromDrawingWizard(makeBaseConfig(), {
      topology: {
        harnessType: 'internal',
        topology: 'single-end',
        wireKind: 'electronic',
      },
      singleResource: resource,
      attributes: {
        drawingWireNo: 'WH-PDF',
        totalLengthMm: 500,
        lengthToleranceMm: 5,
      },
      wires: createDefaultDrawingWireRows(2, 500),
    });

    const pdf = serializeProductionDrawingPdf(config);

    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('/MediaBox [0 0 1200 800]');
    expect(pdf).toContain('WH-PDF');
    expect(pdf).toContain('Wire No.');
    expect(pdf).toContain('WIRE-01');
    expect(pdf).toContain('xref');
    expect(pdf).toContain('%%EOF');
    expect(getProductionDrawingExportFilename(config, 'pdf')).toBe('WH-PDF.pdf');
  });
});
