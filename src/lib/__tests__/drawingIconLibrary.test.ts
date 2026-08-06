import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dialogSource = readFileSync(new URL('../../components/drawings/standalone/DrawingIconLibraryDialog.tsx', import.meta.url), 'utf8');

describe('drawing icon catalog integration', () => {
  it('loads icons from the Supabase drawing catalog instead of a frontend fixture', () => {
    expect(dialogSource).toContain('drawingCatalogRepository');
    expect(dialogSource).toContain('listIcons');
    expect(dialogSource).not.toContain('LOCAL_DRAWING_ICONS');
  });
});
