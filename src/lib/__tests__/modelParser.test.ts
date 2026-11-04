import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseModel, validateModelFile } from '../models/modelParser';
import { normalizeMeshes, STL_UNIT_SCALE, MODEL_LIMITS } from '../models/modelTypes';

const triangle = () => ({ name: 'part', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('model validation', () => {
  it('checks extensions, empty files and exact size boundary', () => {
    expect(validateModelFile({ name: 'Part.STP', size: MODEL_LIMITS.maxBytes })).toBe('step');
    expect(() => validateModelFile({ name: 'x.obj', size: 1 })).toThrow('STEP');
    expect(() => validateModelFile({ name: 'x.stl', size: 0 })).toThrow('空');
    expect(() => validateModelFile({ name: 'x.stl', size: MODEL_LIMITS.maxBytes + 1 })).toThrow('20 MiB');
  });
  it('converts units and preserves relative mesh positions', () => {
    expect(STL_UNIT_SCALE).toEqual({ mm: 1, cm: 10, m: 1000, inch: 25.4 });
    const second = triangle(); second.positions[0] = 5;
    const result = normalizeMeshes([triangle(), second], 25.4);
    expect(result.boundsMm.max[0]).toBeCloseTo(127);
    expect(result.meshes[0].positions[3]).toBeCloseTo(25.4);
    expect(result.triangleCount).toBe(2);
  });
  it('rejects empty, invalid coordinates/indices and excessive geometry', () => {
    expect(() => normalizeMeshes([])).toThrow('空');
    const invalid = triangle(); invalid.indices[0] = 3;
    expect(() => normalizeMeshes([invalid])).toThrow('索引');
    invalid.indices = new Uint32Array([0, 1]);
    expect(() => normalizeMeshes([invalid])).toThrow('三角形');
    const nan = triangle(); nan.positions[0] = NaN;
    expect(() => normalizeMeshes([nan])).toThrow('坐标');
    expect(() => normalizeMeshes([{ ...triangle(), indices: new Uint32Array((MODEL_LIMITS.maxTriangles + 1) * 3) }])).toThrow('三角形上限');
  });
});
describe('worker lifecycle', () => {
  function worker() {
    const instance = { postMessage: vi.fn(), terminate: vi.fn(), onmessage: null as null | ((event: { data: unknown }) => void), onerror: null as null | (() => void) };
    vi.stubGlobal('Worker', vi.fn(function () { return instance; }));
    return instance;
  }
  const blob = () => new Blob(['broken STEP']);
  it('terminates on cancellation and ignores late replies', async () => {
    const w = worker(); const controller = new AbortController();
    const task = parseModel(blob(), { format: 'step', stlUnit: 'mm', signal: controller.signal });
    controller.abort();
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(w.terminate).toHaveBeenCalledOnce();
  });
  it('terminates on timeout', async () => {
    vi.useFakeTimers(); const w = worker();
    const task = parseModel(blob(), { format: 'step', stlUnit: 'mm', signal: new AbortController().signal });
    const assertion = expect(task).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(MODEL_LIMITS.timeoutMs);
    await assertion; expect(w.terminate).toHaveBeenCalledOnce();
  });
  it('reports damaged files and engine errors as actionable errors', async () => {
    const w = worker(); const task = parseModel(blob(), { format: 'step', stlUnit: 'mm', signal: new AbortController().signal });
    await vi.waitFor(() => expect(w.postMessage).toHaveBeenCalled());
    const request = w.postMessage.mock.calls[0][0];
    w.onmessage?.({ data: { requestId: request.requestId, type: 'error', message: '模型解析失败，请检查文件是否损坏' } });
    await expect(task).rejects.toThrow('损坏'); expect(w.terminate).toHaveBeenCalledOnce();
  });
});
