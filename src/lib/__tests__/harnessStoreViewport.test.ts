import { beforeEach, describe, expect, it } from 'vitest';
import { useHarnessStore } from '@/stores/harnessStore';

describe('harnessStore viewport persistence', () => {
  beforeEach(() => {
    useHarnessStore.getState().resetConfig();
  });

  it('initializes canvasViewport and twoDViewport as null', () => {
    const state = useHarnessStore.getState();
    expect(state.canvasViewport).toBeNull();
    expect(state.twoDViewport).toBeNull();
  });

  it('updates and persists canvasViewport', () => {
    const viewport = { x: 120, y: 340, zoom: 1.75 };
    useHarnessStore.getState().setCanvasViewport(viewport);

    expect(useHarnessStore.getState().canvasViewport).toEqual(viewport);
  });

  it('updates and persists twoDViewport', () => {
    const viewport = { zoom: 2.2, pan: { x: 50, y: -80 } };
    useHarnessStore.getState().setTwoDViewport(viewport);

    expect(useHarnessStore.getState().twoDViewport).toEqual(viewport);
  });

  it('resets viewports to null on resetConfig', () => {
    useHarnessStore.getState().setCanvasViewport({ x: 100, y: 200, zoom: 1.5 });
    useHarnessStore.getState().setTwoDViewport({ zoom: 1.2, pan: { x: 10, y: 20 } });

    useHarnessStore.getState().resetConfig();

    expect(useHarnessStore.getState().canvasViewport).toBeNull();
    expect(useHarnessStore.getState().twoDViewport).toBeNull();
  });

  it('resets viewports to null on replaceDocument', () => {
    useHarnessStore.getState().setCanvasViewport({ x: 100, y: 200, zoom: 1.5 });
    useHarnessStore.getState().setTwoDViewport({ zoom: 1.2, pan: { x: 10, y: 20 } });

    useHarnessStore.getState().replaceDocument(useHarnessStore.getState().config);

    expect(useHarnessStore.getState().canvasViewport).toBeNull();
    expect(useHarnessStore.getState().twoDViewport).toBeNull();
  });
});
