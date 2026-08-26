import { describe, expect, it } from 'vitest';
import {
  createDefaultDrawingFrame,
  ensureDrawingFrame,
  formatDrawingDate,
} from '@/lib/drawingFrameDefaults';
import { parseHarnessConfig } from '@/lib/harnessConfigSchema';
import { createDefaultConfig } from '@/stores/harnessStore';

describe('drawingFrameDefaults', () => {
  it('formats dates into YYYY.MM.DD format', () => {
    const d = new Date(2026, 7, 25); // Aug 25, 2026
    expect(formatDrawingDate(d)).toBe('2026.08.25');
  });

  it('creates default drawing frame with current user name and today date', () => {
    const user = { name: '张工' };
    const frame = createDefaultDrawingFrame(user, { name: 'WH-PROJECT-01' });

    expect(frame.partNo).toBe('WH-PROJECT-01');
    expect(frame.approved.name).toBe('');
    expect(frame.approved.date).toBe('');
    expect(frame.designer.name).toBe('');
    expect(frame.designer.date).toBe('');
    expect(frame.drawn.name).toBe('张工');
    expect(frame.revisionRows[0].rev).toBe('X0');
    expect(frame.revisionRows[0].description).toBe('NEW RELEASE');
    expect(frame.revisionRows).toHaveLength(4);
    expect(frame.companyNameCn).toBe('万连科技');
    expect(frame.technicalRequirements).toContain('技术要求：');
    expect(frame.technicalRequirements).toContain('1. 线束100%导通测试');
    expect(frame.technicalRequirements).toContain('6. 产品符合RoHS环保标准。');
  });

  it('ensureDrawingFrame preserves existing values and fills missing fields', () => {
    const partial = {
      partNo: 'CUSTOM-PART-99',
      approved: { name: '李总', date: '2026.01.01' },
      revisionRows: [{ rev: 'A1', description: 'UPDATE', date: '2026.02.02' }],
    };
    const merged = ensureDrawingFrame(partial, { name: '默认用户' });

    expect(merged.partNo).toBe('CUSTOM-PART-99');
    expect(merged.approved.name).toBe('李总');
    expect(merged.approved.date).toBe('2026.01.01');
    expect(merged.designer.name).toBe('');
    expect(merged.drawn.name).toBe('默认用户');
    expect(merged.revisionRows[0].rev).toBe('A1');
    expect(merged.revisionRows).toHaveLength(4);
    expect(merged.technicalRequirements).toContain('技术要求：');

    // Test custom technical requirements preserved
    const customMerged = ensureDrawingFrame({
      ...partial,
      technicalRequirements: '自定义技术要求：\n1. 特殊测试要求',
    });
    expect(customMerged.technicalRequirements).toBe('自定义技术要求：\n1. 特殊测试要求');
  });
});

describe('harnessConfigSchema with drawingFrame', () => {
  it('parses harness config containing drawingFrame', () => {
    const config = createDefaultConfig({ name: '测试员' });
    const result = parseHarnessConfig(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.drawingFrame).toBeDefined();
      expect(result.data.drawingFrame?.drawn.name).toBe('测试员');
      expect(result.data.drawingFrame?.technicalRequirements).toContain('技术要求：');
    }
  });
});
