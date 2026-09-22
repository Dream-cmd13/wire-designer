import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CatalogRepository } from '@/lib/catalogRepository';
import { DrawingCatalogRepository } from '@/lib/drawingCatalogRepository';
import { DrawingMaterialRepository } from '@/lib/drawingMaterialRepository';

const read = (path: string) => readFileSync(path, 'utf8');

const rejectSession = async () => {
  throw new Error('登录后才能访问公共物料目录。');
};

describe('anonymous catalog access guards', () => {
  it('blocks catalog reads when the session guard rejects', async () => {
    const repository = new CatalogRepository({} as never, rejectSession);

    await expect(repository.loadSnapshot()).rejects.toThrow('登录后才能访问公共物料目录。');
  });

  it('blocks drawing catalog reads when the session guard rejects', async () => {
    const repository = new DrawingCatalogRepository({} as never, rejectSession);

    await expect(repository.listResources()).rejects.toThrow('登录后才能访问公共物料目录。');
  });

  it('blocks company material list and create when the session guard rejects', async () => {
    const repository = new DrawingMaterialRepository({
      list: async () => [],
      insert: async () => {
        throw new Error('insert should not be reached without a session');
      },
    }, rejectSession);

    await expect(repository.list()).rejects.toThrow('登录后才能访问公共物料目录。');
    await expect(repository.create({
      code: 'M-01',
      nameAndSpecification: '端子 2.8',
      unit: 'PCS',
      note: '',
    })).rejects.toThrow('登录后才能访问公共物料目录。');
  });

  it('gates every workbench catalog entry point behind canUseCatalog', () => {
    const panel = read('src/components/drawings/standalone/DrawingResourcePanel.tsx');
    const wizard = read('src/components/drawings/standalone/StandaloneDrawingWizard.tsx');
    const materialDialog = read('src/components/drawings/standalone/DrawingMaterialTableDialog.tsx');
    const page = read('src/pages/DrawingWorkbenchPage.tsx');

    expect(panel).toContain('canUseCatalog');
    expect(wizard).toContain('canUseCatalog');
    expect(materialDialog).toContain('canUseCatalog');
    expect(page.match(/canUseCatalog=\{Boolean\(currentUser\)\}/g)).toHaveLength(3);
  });

  it('gates protected routes and resets catalog data in App', () => {
    const app = read('src/App.tsx');

    expect(app).toContain('requiresAuth(route)');
    expect(app).toContain('LoginRequiredPanel');
    expect(app).toContain('Boolean(currentUserId)');
    expect(app).toContain('useCatalogStore.getState().reset()');
    expect(app).toContain('usePriceStore.getState().reset()');
    expect(app).toContain('useFinishedHarnessStore.getState().reset()');
  });
});
