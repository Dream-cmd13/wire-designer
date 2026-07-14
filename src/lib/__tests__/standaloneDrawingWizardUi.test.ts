import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('standalone drawing wizard UI contract', () => {
  it('uses public resources, eight filters, batch wiring, and no unsupported topology', () => {
    const wizard = readFileSync('src/components/drawings/standalone/StandaloneDrawingWizard.tsx', 'utf8');
    const selector = readFileSync('src/components/drawings/standalone/DrawingResourceSelect.tsx', 'utf8');
    const batch = readFileSync('src/components/drawings/standalone/DrawingWireBatchEditor.tsx', 'utf8');
    expect(wizard).toContain('drawingCatalogRepository');
    expect(wizard).toContain('图库模板');
    expect(wizard).toContain('物料种类');
    expect(wizard).not.toContain('one-to-many');
    for (const label of ['资源类型', '名称', '公/母', '类别', '系列', 'PIN 位数', '排位', '间距']) {
      expect(selector).toContain(label);
    }
    expect(batch).toContain('反序接线');
    expect(batch).toContain('递增线号');
  });
});
