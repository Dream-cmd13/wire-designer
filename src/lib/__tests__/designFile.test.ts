import { describe, expect, it } from 'vitest';
import { createDesignFile, parseDesignFile } from '@/lib/designFile';
import { createFallbackConfig } from '@/lib/normalizeHarnessConfig';
import type { Project } from '@/types/user';

describe('design file import/export', () => {
  it('round-trips a complete design envelope', () => {
    const config = { ...createFallbackConfig(), id: 'config-1', name: '测试线束' };
    const project: Project = {
      id: 'project-1',
      userId: 'user-1',
      name: '测试项目',
      description: '导入导出测试',
      harnessConfigId: config.id,
      createdAt: 1,
      updatedAt: 2,
      status: 'draft',
    };

    const result = parseDesignFile(createDesignFile(project, config));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.preview.name).toBe('测试项目');
      expect(result.preview.config).toEqual(config);
    }
  });

  it('accepts a raw complete HarnessConfig as a recovery-friendly import', () => {
    const config = { ...createFallbackConfig(), id: 'raw-1', name: '原始设计' };
    const result = parseDesignFile(config);
    expect(result.success).toBe(true);
  });

  it('rejects a malformed nested document without producing a preview', () => {
    const config = {
      ...createFallbackConfig(),
      materials: [{ id: 'broken', name: 'broken', circuits: [] }],
    };
    const result = parseDesignFile(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues?.length).toBeGreaterThan(0);
    }
  });
});
