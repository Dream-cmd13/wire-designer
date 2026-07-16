import { describe, expect, it } from 'vitest';
import { DRAWING_ICON_CATEGORIES, LOCAL_DRAWING_ICONS } from '@/lib/drawingIconLibrary';
import { createDrawingNumberTubeObject } from '@/lib/drawingDocument';

describe('drawing icon library', () => {
  it('covers every requested engineering drawing category', () => {
    expect(DRAWING_ICON_CATEGORIES).toHaveLength(9);
    expect(LOCAL_DRAWING_ICONS).toHaveLength(36);
    for (const category of DRAWING_ICON_CATEGORIES) {
      expect(LOCAL_DRAWING_ICONS.filter((item) => item.category === category).length).toBeGreaterThanOrEqual(4);
    }
  });

  it('creates a rectangular number tube with default text', () => {
    const object = createDrawingNumberTubeObject({ x: 100, y: 120 });
    expect(object).toMatchObject({
      kind: 'accessory',
      label: '号码管文字',
      accessoryType: 'sleeve',
      width: 180,
      height: 36,
    });
  });
});
