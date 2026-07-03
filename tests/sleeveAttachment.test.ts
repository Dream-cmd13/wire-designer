import { describe, expect, it } from 'vitest';
import { updateMaterial, updateProtectiveSleeve } from '@/lib/commands';
import { lengthMmToCanvasWidth, placeSleeveAroundMaterials } from '@/lib/canvasMaterials';
import type {
  CanvasWireMaterial,
  HarnessConfig,
  ProtectiveSleeve,
} from '@/types/harness';

function makeConfig(
  materialLengthMm = 300,
  sleeveLengthMm = 100,
): HarnessConfig {
  const material: CanvasWireMaterial = {
    id: 'material-1',
    name: 'W1',
    position: { x: 100, y: 200 },
    width: lengthMmToCanvasWidth(materialLengthMm),
    spec: {
      kind: 'electronic',
      color: 'red',
      lengthMm: materialLengthMm,
      awg: 26,
      ulNumber: '1007',
      endTreatment: { stripped: false },
    },
    circuits: [],
  };
  const sleeveWidth = lengthMmToCanvasWidth(sleeveLengthMm);
  const sleeve: ProtectiveSleeve = {
    id: 'sleeve-1',
    type: 'heat-shrink',
    position: {
      x: material.position.x + (material.width - sleeveWidth) / 2,
      y: 194,
    },
    width: sleeveWidth,
    height: 36,
    lengthMm: sleeveLengthMm,
    attachedMaterialIds: [material.id],
  };

  return {
    schemaVersion: 3,
    id: 'config-1',
    name: 'Test',
    createdAt: 1,
    updatedAt: 1,
    connectors: [],
    materials: [material],
    protectiveSleeves: [sleeve],
    models: [],
    quantity: 1,
    leadTime: 'standard',
  };
}

describe('protective sleeve attachment geometry', () => {
  it('keeps a 100 mm sleeve centered when its material shrinks from 300 mm to 100 mm', () => {
    const config = makeConfig();
    const spec = {
      ...config.materials[0].spec,
      lengthMm: 100,
    };

    const next = updateMaterial(config, 'material-1', { spec });

    expect(next.materials[0].width).toBe(60);
    expect(next.protectiveSleeves[0].position.x).toBe(100);
    expect(next.protectiveSleeves[0].attachedMaterialIds).toEqual(['material-1']);
  });

  it('centers an attached sleeve even when the sleeve is longer than the material', () => {
    const config = makeConfig(300, 200);
    const spec = {
      ...config.materials[0].spec,
      lengthMm: 50,
    };

    const next = updateMaterial(config, 'material-1', { spec });

    expect(next.materials[0].width).toBe(40);
    expect(next.protectiveSleeves[0].width).toBe(120);
    expect(next.protectiveSleeves[0].position.x).toBe(60);
    expect(next.protectiveSleeves[0].attachedMaterialIds).toEqual(['material-1']);
  });

  it('recomputes sleeve width and center when sleeve length changes in the property editor path', () => {
    const config = makeConfig(300, 100);

    const next = updateProtectiveSleeve(config, 'sleeve-1', { lengthMm: 300 });

    expect(next.protectiveSleeves[0].width).toBe(180);
    expect(next.protectiveSleeves[0].position.x).toBe(100);
  });

  it('keeps attachment centered when material position and width change together', () => {
    const config = makeConfig();

    const next = updateMaterial(config, 'material-1', {
      position: { x: 400, y: 500 },
      width: 60,
    });

    expect(next.protectiveSleeves[0].position).toEqual({ x: 400, y: 493 });
  });

  it('supports one sleeve around all four arranged electronic wires', () => {
    const base = makeConfig().materials[0];
    const materials = [0, 28, 56, 84].map((offset, index) => ({
      ...base,
      id: `material-${index + 1}`,
      position: { x: 100, y: 200 + offset },
    }));

    const placement = placeSleeveAroundMaterials(materials, 60);

    expect(placement).toEqual({
      position: { x: 160, y: 198 },
      height: 110,
    });
  });

  it('supports one sleeve around an explicit two-wire subset', () => {
    const base = makeConfig().materials[0];
    const subset = [0, 28].map((offset, index) => ({
      ...base,
      id: `material-${index + 1}`,
      position: { x: 100, y: 200 + offset },
    }));

    const placement = placeSleeveAroundMaterials(subset, 60);

    expect(placement).toEqual({
      position: { x: 160, y: 198 },
      height: 54,
    });
  });
});
