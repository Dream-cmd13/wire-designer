import { describe, expect, it } from 'vitest';
import { CatalogItemError, parseCatalogItemRow } from '@/lib/catalogItem';

const connectorRow = {
  id: '1',
  kind: 'connector',
  code: 'xh254-4p-f',
  name: 'XH2.54-4P',
  model: 'XH2.54-4P-F',
  manufacturer: '',
  resource_group: '绘图连接器',
  description: '',
  image_path: null,
  sort_order: 10,
  spec: {
    connectorType: 'female',
    pinCount: 4,
    pinLabels: ['1', '2', '3', '4'],
  },
};

describe('parseCatalogItemRow', () => {
  it('accepts a connector with a typed and isolated spec', () => {
    const parsed = parseCatalogItemRow(connectorRow);

    expect(parsed).toEqual(expect.objectContaining({
      kind: 'connector',
      code: 'xh254-4p-f',
    }));
    expect(parsed.spec).not.toBe(connectorRow.spec);
  });

  it.each([
    { kind: 'unknown', spec: {} },
    { kind: 'connector', spec: { connectorType: 'female', pinCount: 0, pinLabels: [] } },
    { kind: 'wire', spec: { kind: 'jacketed', awg: 24, coreCount: 4, coreColors: [] } },
  ])('rejects invalid catalog data %#', (patch) => {
    expect(() => parseCatalogItemRow({
      id: '1',
      code: 'bad',
      name: 'bad',
      model: 'bad',
      manufacturer: '',
      resource_group: '',
      description: '',
      image_path: null,
      sort_order: 0,
      ...patch,
    })).toThrow(CatalogItemError);
  });
});
