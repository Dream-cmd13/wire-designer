import { beforeEach, describe, expect, it } from 'vitest';
import { useDrawingStore } from '@/stores/drawingStore';

describe('independent drawing store', () => {
  beforeEach(() => {
    useDrawingStore.setState({ documents: {}, activeDocumentId: null, saveState: 'saved' });
  });

  it('atomically replaces the library with one new default drawing', () => {
    useDrawingStore.getState().createDocument('Old drawing one');
    useDrawingStore.getState().createDocument('Old drawing two');
    const next = useDrawingStore.getState().replaceWithNewDocument('Untitled drawing');
    const state = useDrawingStore.getState();

    expect(Object.keys(state.documents)).toEqual([next.id]);
    expect(state.activeDocumentId).toBe(next.id);
    expect(next.objects.flatMap((object) => (
      object.visible && 'tableRole' in object ? [object.tableRole] : []
    )))
      .toEqual(['bom', 'revision', 'title-block']);
  });
});
