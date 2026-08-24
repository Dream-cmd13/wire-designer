import { describe, expect, it } from 'vitest';
import {
  listStaticDrawingCommonPhrases,
  listStaticDrawingIcons,
  listStaticDrawingTemplates,
  loadStaticDrawingTemplate,
} from '@/lib/drawingStaticResources';

describe('drawing static resources', () => {
  it('preserves all seeded resources with stable template ids', () => {
    expect(listStaticDrawingTemplates().map((template) => template.id))
      .toEqual(['template-single', 'template-double']);
    expect(listStaticDrawingCommonPhrases()).toHaveLength(3);
    expect(listStaticDrawingIcons().map((icon) => icon.name))
      .toEqual(['接地', '警告', '上锡', '屏蔽']);
  });

  it('returns an isolated template document', () => {
    const first = loadStaticDrawingTemplate('template-single');
    const second = loadStaticDrawingTemplate('template-single');

    expect(first).not.toBe(second);
    expect(first?.titleBlock.drawingNo).toBe('TPL-SINGLE');
    if (first) first.titleBlock.title = '已修改';
    expect(second?.titleBlock.title).toBe('单头普通电子线模板');
  });

  it('returns null for an unknown template', () => {
    expect(loadStaticDrawingTemplate('missing')).toBeNull();
  });
});
