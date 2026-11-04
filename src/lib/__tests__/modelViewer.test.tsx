// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as React from 'react';
import * as testing from '@testing-library/react';
import { getCameraFit } from '../models/modelView';
import { ModelViewer } from '@/components/models/ModelViewer';
import type { ParsedModel } from '../models/modelTypes';

const mocks = vi.hoisted(() => ({ dispose: vi.fn(), controlsDispose: vi.fn(), disconnect: vi.fn(), draw: vi.fn() }));
vi.mock('three', async (load) => {
  const actual = await load<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    domElement = document.createElement('canvas');
    setPixelRatio() {} setSize() {} forceContextLoss() {} render() { mocks.draw(); } dispose() { mocks.dispose(); }
  } };
});
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const { Vector3 } = await vi.importActual<typeof import('three')>('three');
  return { OrbitControls: class { target = new Vector3(); update() {} addEventListener() {} removeEventListener() {} dispose() { mocks.controlsDispose(); } } };
});
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = mocks.disconnect; });
const model: ParsedModel = { meshes: [{ name: 'part', positions: new Float32Array([0,0,0,1,0,0,0,1,0]), indices: new Uint32Array([0,1,2]) }], boundsMm: { min: [0,0,0], max: [1,1,0] }, triangleCount: 1 };
afterEach(() => { testing.cleanup(); vi.clearAllMocks(); });
describe('camera fit and canvas ownership', () => {
  it('keeps clipping and aspect finite for tiny, large, flat and zero-size containers', () => {
    for (const size of [1e-8, 1, 1e12]) for (const [width, height] of [[0,0], [1,1000], [1000,1]]) {
      const fit = getCameraFit({ min: [0,0,0], max: [size,size,0] }, width, height);
      expect(fit.distance).toBeGreaterThan(size / 2);
      expect(fit.near).toBeGreaterThan(0);
      expect(fit.far).toBeGreaterThan(fit.distance + size);
      expect(Number.isFinite(fit.distance)).toBe(true);
    }
  });
  it('supports view/edge controls and disposes each mount including StrictMode replay', () => {
    const { rerender, unmount } = testing.render(<React.StrictMode><ModelViewer model={model} /></React.StrictMode>);
    for (const name of ['等轴测','前视','顶视','右视','重置视角','网格特征边']) testing.fireEvent.click(testing.screen.getByRole('button', { name }));
    rerender(<React.StrictMode><ModelViewer model={{ ...model }} /></React.StrictMode>);
    unmount();
    expect(mocks.dispose.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(mocks.controlsDispose.mock.calls.length).toBeGreaterThan(mocks.dispose.mock.calls.length);
    expect(mocks.disconnect).toHaveBeenCalledTimes(mocks.dispose.mock.calls.length);
    expect(document.querySelector('canvas')).toBeNull();
  });
  it('shows actionable WebGL context loss and allows recreation', () => {
    testing.render(<ModelViewer model={model} />);
    testing.fireEvent(document.querySelector('canvas')!, new Event('webglcontextlost', { cancelable: true }));
    expect(testing.screen.getByRole('alert').textContent).toContain('WebGL');
    testing.fireEvent.click(testing.screen.getByRole('button', { name: '重建画布' }));
    expect(testing.screen.queryByRole('alert')).toBeNull();
  });
});
