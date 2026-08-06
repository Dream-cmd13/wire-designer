import type { Connector } from '@/types/harness';
import type { CatalogSnapshot } from '@/types/catalog';

export const TEST_CONNECTORS: Connector[] = [
  {
    id: 'fixture-2p',
    name: 'Fixture 2P',
    manufacturer: 'Fixture',
    pinCount: 2,
    type: 'female',
    pinLabels: ['1', '2'],
  },
  {
    id: 'fixture-3p',
    name: 'Fixture 3P',
    manufacturer: 'Fixture',
    pinCount: 3,
    type: 'female',
    pinLabels: ['1', '2', '3'],
  },
  {
    id: 'fixture-4p',
    name: 'Fixture 4P',
    manufacturer: 'Fixture',
    pinCount: 4,
    type: 'female',
    pinLabels: ['1', '2', '3', '4'],
  },
];

export const TEST_DRAWING_CONNECTORS: Connector[] = [
  {
    id: 'a1008h-2x20p',
    name: 'A1008H 2x20P',
    manufacturer: 'Fixture',
    pinCount: 40,
    pitch: 2.54,
    type: 'female',
    pinLabels: Array.from({ length: 40 }, (_, index) => String(index + 1)),
  },
  {
    id: 'fixture-none-2p',
    name: 'Fixture single-end 2P',
    manufacturer: 'Fixture',
    pinCount: 2,
    pitch: 2.54,
    type: 'female',
    pinLabels: ['1', '2'],
  },
];

export const TEST_CATALOG_SNAPSHOT: CatalogSnapshot = {
  connectors: [...TEST_CONNECTORS, ...TEST_DRAWING_CONNECTORS],
  wires: [],
  wireTypes: [],
  wireColors: [],
  wireGauges: [],
  overmolds: [],
  leadTimeOptions: [],
  protectionOptions: [],
  pricingRules: [],
  quantityDiscountRules: [],
  loadedAt: 0,
};
