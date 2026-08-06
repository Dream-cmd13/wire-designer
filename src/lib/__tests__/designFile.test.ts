import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDesignFile, parseDesignFile } from '@/lib/designFile';
import {
  createDefaultDrawingWireRows,
  createDrawingConnectorResources,
  createHarnessConfigFromDrawingWizard,
} from '@/lib/drawingWizard';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import type { Project } from '@/types/user';
import { clearCatalogSnapshot, setCatalogSnapshot } from '@/lib/catalogRuntime';
import { TEST_CATALOG_SNAPSHOT } from './fixtures/catalogFixture';

describe('design file import/export', () => {
  beforeEach(() => setCatalogSnapshot(TEST_CATALOG_SNAPSHOT));
  afterAll(() => clearCatalogSnapshot());

  it('round-trips a complete design envelope', () => {
    const config = { ...createFallbackConfig(), id: 'config-1', name: '测试线束' };
    const project: Project = {
      id: 'project-1',
      userId: 'user-1',
      name: '测试项目',
      description: '导入导出测试',
      harnessConfigId: config.id,
      createdAt: 1,
      updatedAt: 2,
      status: 'draft',
    };

    const result = parseDesignFile(createDesignFile(project, config));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.preview.name).toBe('测试项目');
      expect(result.preview.config).toEqual(config);
    }
  });

  it('accepts a raw complete HarnessConfig as a recovery-friendly import', () => {
    const config = { ...createFallbackConfig(), id: 'raw-1', name: '原始设计' };
    const result = parseDesignFile(config);
    expect(result.success).toBe(true);
  });

  it('rejects a malformed nested document without producing a preview', () => {
    const config = {
      ...createFallbackConfig(),
      materials: [{ id: 'broken', name: 'broken', circuits: [] }],
    };
    const result = parseDesignFile(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues?.length).toBeGreaterThan(0);
    }
  });

  it('preserves generated production drawings through design file round-trip', () => {
    const resource = createDrawingConnectorResources('none')[0];
    const config = createHarnessConfigFromDrawingWizard(createFallbackConfig(), {
      topology: {
        harnessType: 'internal',
        topology: 'single-end',
        wireKind: 'electronic',
      },
      singleResource: resource,
      attributes: {
        drawingWireNo: 'WH-PERSIST',
        totalLengthMm: 500,
        lengthToleranceMm: 5,
      },
      wires: createDefaultDrawingWireRows(2, 500),
    });
    const project: Project = {
      id: 'project-persist',
      userId: 'user-1',
      name: 'Production Drawing Project',
      description: 'production drawing persistence',
      harnessConfigId: config.id,
      createdAt: 1,
      updatedAt: 2,
      status: 'draft',
    };

    const result = parseDesignFile(createDesignFile(project, config));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.preview.config.productionDrawing?.titleBlock.drawingNo).toBe('WH-PERSIST');
      expect(result.preview.config.productionDrawing?.objects.some((object) => object.kind === 'dimension')).toBe(true);
      const wiringTable = result.preview.config.productionDrawing?.objects.find((object) => object.kind === 'wiring-table');
      expect(wiringTable).toBeDefined();
      if (wiringTable?.kind === 'wiring-table') {
        expect(wiringTable.rows).toHaveLength(2);
        expect(wiringTable.rows[0].signalName).toBe('WIRE-01');
      }
      expect(result.preview.config.materials[0].circuits[0].lengthMm).toBe(500);
      expect(result.preview.config.materials[0].circuits[0].connectionNo).toBe('1');
    }
  });
});
