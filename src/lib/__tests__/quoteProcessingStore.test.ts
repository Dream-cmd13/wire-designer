import { beforeEach, describe, expect, it } from 'vitest';
import { useHarnessStore } from '@/stores/harnessStore';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import type { HarnessConfig } from '@/types/harness';
import { addConnectorJumper, attachMaterialEndpoint } from '@/lib/commands';

const counts = { weldingPoints: 2, strippingPoints: 1, crimpingPoints: 1 };
function fixture(): HarnessConfig {
  return {
    ...createFallbackConfig(),
    quotation: { processingEnds: 1, srPoints: 0, ...counts },
    connectors: [{ id: 'a', label: 'A', position: { x: 0, y: 0 }, jumpers: [],
      connector: { id: 'c', resourceItemId: 'c', name: 'M12', pinCount: 5, shielded: false, type: 'male', pinLabels: ['1', '2', '3', '4', '5'] } }],
    materials: [{ id: 'w', name: '六芯线', resourceItemId: 'w', position: { x: 0, y: 0 }, width: 100, circuits: [],
      spec: { kind: 'jacketed', coreCount: 6, shielded: false, jacketMaterial: 'PVC', jacketColor: 'black', odMm: 5,
        coreColors: ['红色', '黑色', '白色', '蓝色', '绿色', '黄色'], awg: 24, lengthMm: 500,
        endTreatment: { start: { stripped: false, termination: 'none' }, end: { stripped: false, termination: 'none' } } } }],
  };
}
function expectCleared() {
  expect(useHarnessStore.getState().config.quotation).toEqual({ processingEnds: 1, srPoints: 0 });
}

describe('project processing counts', () => {
  beforeEach(() => useHarnessStore.getState().replaceDocument(fixture()));

  it('retains entered counts when loading, moving parts and changing quantity or length', () => {
    const state = useHarnessStore.getState();
    state.updateConnector('a', { position: { x: 50, y: 20 } });
    state.updateMaterial('w', { spec: { ...state.config.materials[0].spec, lengthMm: 1000 } });
    state.setConfig({ quantity: 10 });
    expect(useHarnessStore.getState().config.quotation).toMatchObject(counts);
  });

  it('clears counts after changing a connector part', () => {
    const state = useHarnessStore.getState();
    state.updateConnector('a', { connector: { ...state.config.connectors[0].connector, resourceItemId: 'different' } });
    expectCleared();
  });

  it('clears counts after changing wire cores', () => {
    const state = useHarnessStore.getState();
    const spec = state.config.materials[0].spec;
    if (spec.kind !== 'jacketed') throw new Error('Expected jacketed cable');
    state.updateMaterial('w', { spec: { ...spec, coreCount: 4 } });
    expectCleared();
  });

  it('clears counts when wiring changes through a document patch', () => {
    const state = useHarnessStore.getState();
    state.patchDocument({ materials: state.config.materials.map(material => ({ ...material,
      circuits: [{ id: 'wire-1', color: 'red', signalName: '', start: { connectorId: 'a', connectorSide: 'right', pin: 1 } }],
    })) });
    expectCleared();
  });

  it('clears counts when a connector is removed', () => {
    useHarnessStore.getState().removeConnector('a');
    expectCleared();
  });

  it('preserves persisted counts during document replacement and undo', () => {
    useHarnessStore.getState().removeConnector('a');
    useHarnessStore.getState().replaceDocument(fixture());
    expect(useHarnessStore.getState().config.quotation).toMatchObject(counts);
  });

  it('clears counts after a canvas connection edit through document replacement', () => {
    const state = useHarnessStore.getState();
    const next = attachMaterialEndpoint(state.config, { materialId: 'w', endpoint: 'start',
      connectorId: 'a', connectorSide: 'right', pin: 1 });
    state.replaceDocument(next, { userEdit: true });
    expectCleared();
  });

  it('clears counts after adding a jumper through the canvas edit path', () => {
    const state = useHarnessStore.getState();
    state.replaceDocument(addConnectorJumper(state.config, 'a', 'right', 1, 2), { userEdit: true });
    expectCleared();
  });
});
