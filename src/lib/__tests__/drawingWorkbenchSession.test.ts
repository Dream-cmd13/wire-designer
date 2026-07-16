import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('drawing workbench runtime entry', () => {
  beforeEach(() => vi.resetModules());

  it('confirms a restored drawing only on the first entry in this runtime', async () => {
    const session = await import('@/lib/drawingWorkbenchSession');
    expect(session.enterDrawingWorkbench(true)).toBe('confirm');
    expect(session.enterDrawingWorkbench(true)).toBe('resume');
  });

  it('creates when the first entry has no stored drawing', async () => {
    const session = await import('@/lib/drawingWorkbenchSession');
    expect(session.enterDrawingWorkbench(false)).toBe('create');
    expect(session.enterDrawingWorkbench(true)).toBe('resume');
  });
});
