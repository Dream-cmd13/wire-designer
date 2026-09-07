import { describe, expect, it } from 'vitest';
import {
  listStaticDrawingCommonPhrases,
  listStaticDrawingIcons,
  listStaticDrawingTemplates,
  loadStaticDrawingTemplate,
} from '@/lib/drawingStaticResources';

describe('drawing static resources', () => {
  it('preserves all seeded resources with stable template ids and rich icon library', () => {
    expect(listStaticDrawingTemplates().map((template) => template.id))
      .toEqual(['template-single', 'template-double']);
    expect(listStaticDrawingCommonPhrases()).toHaveLength(3);

    const icons = listStaticDrawingIcons();
    expect(icons).toHaveLength(66);

    const iconIds = icons.map((icon) => icon.id);
    expect(new Set(iconIds).size).toBe(66);

    const iconNames = icons.map((icon) => icon.name);
    expect(new Set(iconNames).size).toBe(66);

    // 重点抽查核心类别与特征图标
    expect(iconNames).toContain('右向箭头');
    expect(iconNames).toContain('加号');
    expect(iconNames).toContain('接地');
    expect(iconNames).toContain('公连接器');
    expect(iconNames).toContain('矩形');
    expect(iconNames).toContain('警告');
    expect(iconNames).toContain('上锡');

    // 验证“对勾”归入“标识与包装”，而非“单位”
    const checkIcon = icons.find((icon) => icon.name === '对勾 ✓');
    expect(checkIcon).toBeDefined();
    expect(checkIcon?.category).toBe('标识与包装');

    // 验证每个图标的必要字段格式完整
    for (const icon of icons) {
      expect(icon.id).toBeTruthy();
      expect(icon.name).toBeTruthy();
      expect(icon.category).toBeTruthy();
      expect(icon.svgPath).toBeTruthy();
      expect(icon.defaultWidth).toBeGreaterThan(0);
      expect(icon.defaultHeight).toBeGreaterThan(0);
    }
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
