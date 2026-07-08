import type { Connector, OvermoldSpec, WireType, WireColor, WireGauge } from '@/types/harness';

// ============================================================
// Connector Catalog (20+ types with pinLabels)
// ============================================================

export const CONNECTORS: Connector[] = [
  // --- JST XH Series (2.5mm pitch) ---
  { id: 'jst-xh-2', name: 'JST XH 2P', manufacturer: 'JST', pinCount: 2, pitch: 2.5, type: 'female', pinLabels: ['1', '2'] },
  { id: 'jst-xh-3', name: 'JST XH 3P', manufacturer: 'JST', pinCount: 3, pitch: 2.5, type: 'female', pinLabels: ['1', '2', '3'] },
  { id: 'jst-xh-4', name: 'JST XH 4P', manufacturer: 'JST', pinCount: 4, pitch: 2.5, type: 'female', pinLabels: ['1', '2', '3', '4'] },
  { id: 'jst-xh-5', name: 'JST XH 5P', manufacturer: 'JST', pinCount: 5, pitch: 2.5, type: 'female', pinLabels: ['1', '2', '3', '4', '5'] },

  // --- JST PH Series (2.0mm pitch) ---
  { id: 'jst-ph-2', name: 'JST PH 2.0 2P', manufacturer: 'JST', pinCount: 2, pitch: 2.0, type: 'female', pinLabels: ['1', '2'] },
  { id: 'jst-ph-3', name: 'JST PH 2.0 3P', manufacturer: 'JST', pinCount: 3, pitch: 2.0, type: 'female', pinLabels: ['1', '2', '3'] },
  { id: 'jst-ph-4', name: 'JST PH 2.0 4P', manufacturer: 'JST', pinCount: 4, pitch: 2.0, type: 'female', pinLabels: ['1', '2', '3', '4'] },

  // --- JST EH Series (2.5mm pitch, higher current) ---
  { id: 'jst-eh-2', name: 'JST EH 2P', manufacturer: 'JST', pinCount: 2, pitch: 2.5, type: 'female', pinLabels: ['1', '2'] },
  { id: 'jst-eh-3', name: 'JST EH 3P', manufacturer: 'JST', pinCount: 3, pitch: 2.5, type: 'female', pinLabels: ['1', '2', '3'] },

  // --- JST GH Series (1.25mm pitch) ---
  { id: 'jst-gh-4', name: 'JST GH 1.25 4P', manufacturer: 'JST', pinCount: 4, pitch: 1.25, type: 'female', pinLabels: ['1', '2', '3', '4'] },

  // --- JST SH Series (1.0mm pitch) ---
  { id: 'jst-sh-4', name: 'JST SH 1.0 4P', manufacturer: 'JST', pinCount: 4, pitch: 1.0, type: 'female', pinLabels: ['1', '2', '3', '4'] },

  // --- JST ZH Series (1.5mm pitch) ---
  { id: 'jst-zh-4', name: 'JST ZH 1.5 4P', manufacturer: 'JST', pinCount: 4, pitch: 1.5, type: 'female', pinLabels: ['1', '2', '3', '4'] },

  // --- Molex Series ---
  { id: 'molex-2510-2', name: 'Molex 2510 2P', manufacturer: 'Molex', pinCount: 2, pitch: 2.54, type: 'female', pinLabels: ['1', '2'] },
  { id: 'molex-2510-4', name: 'Molex 2510 4P', manufacturer: 'Molex', pinCount: 4, pitch: 2.54, type: 'female', pinLabels: ['1', '2', '3', '4'] },
  { id: 'molex-microfit-2', name: 'Molex Micro-Fit 3.0 2P', manufacturer: 'Molex', pinCount: 2, pitch: 3.0, type: 'female', pinLabels: ['1', '2'] },
  { id: 'molex-microfit-4', name: 'Molex Micro-Fit 3.0 4P', manufacturer: 'Molex', pinCount: 4, pitch: 3.0, type: 'female', pinLabels: ['1', '2', '3', '4'] },

  // --- XT Series (Amass, high current) ---
  { id: 'xt30', name: 'XT30', manufacturer: 'Amass', pinCount: 2, type: 'female', pinLabels: ['+', '-'] },
  { id: 'xt60', name: 'XT60', manufacturer: 'Amass', pinCount: 2, type: 'female', pinLabels: ['+', '-'] },
  { id: 'xt90', name: 'XT90', manufacturer: 'Amass', pinCount: 2, type: 'female', pinLabels: ['+', '-'] },

  // --- USB ---
  { id: 'usb-a', name: 'USB Type-A', manufacturer: 'Generic', pinCount: 4, type: 'female', pinLabels: ['VBUS', 'D-', 'D+', 'GND'] },
  { id: 'usb-c', name: 'USB Type-C', manufacturer: 'Generic', pinCount: 16, type: 'receptacle', pinLabels: ['VBUS', 'D-', 'D+', 'SBU1', 'CC1', 'GND', 'VBUS', 'SBU2', 'D-', 'D+', 'GND', 'TX1+', 'TX1-', 'RX2-', 'RX2+', 'GND'] },

  // --- Dupont ---
  { id: 'dupont-1x1', name: 'Dupont 2.54 1P', manufacturer: 'Dupont', pinCount: 1, pitch: 2.54, type: 'female', pinLabels: ['1'] },
  { id: 'dupont-2p', name: 'Dupont 2.54 2P', manufacturer: 'Dupont', pinCount: 2, pitch: 2.54, type: 'female', pinLabels: ['1', '2'] },
  { id: 'dupont-4p', name: 'Dupont 2.54 4P', manufacturer: 'Dupont', pinCount: 4, pitch: 2.54, type: 'female', pinLabels: ['1', '2', '3', '4'] },

  // --- Anderson Power Pole ---
  { id: 'anderson-2', name: 'Anderson 2P', manufacturer: 'Anderson', pinCount: 2, type: 'receptacle', pinLabels: ['+', '-'] },

  // --- M8 / M12 Circular ---
  { id: 'm8-3', name: 'M8 3-Pin', manufacturer: 'Generic', pinCount: 3, type: 'male', pinLabels: ['1', '2', '3'] },
  { id: 'm8-4', name: 'M8 4-Pin', manufacturer: 'Generic', pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'] },
  { id: 'm12-4', name: 'M12 4-Pin (A-Coded)', manufacturer: 'Generic', pinCount: 4, type: 'male', pinLabels: ['1', '2', '3', '4'] },
  { id: 'm12-5', name: 'M12 5-Pin (A-Coded)', manufacturer: 'Generic', pinCount: 5, type: 'male', pinLabels: ['1', '2', '3', '4', '5'] },
  {
    id: 'm12a04-07-093',
    name: 'M12成型式防水连接器 4芯 A编码 焊线式公头 非屏蔽款+11.8L双网纹螺丝',
    manufacturer: '万连',
    pinCount: 4,
    type: 'male',
    pinLabels: ['1', '2', '3', '4'],
    housingMaterial: 'PA66+GF',
    contactMaterial: '黄铜镀金',
    nutMaterial: '黄铜镀镍',
  },

  // --- Automotive: Deutsch DT ---
  { id: 'deutsch-dt-2', name: 'Deutsch DT 2P', manufacturer: 'Deutsch', pinCount: 2, pitch: 6.35, type: 'receptacle', pinLabels: ['A', 'B'] },
  { id: 'deutsch-dt-4', name: 'Deutsch DT 4P', manufacturer: 'Deutsch', pinCount: 4, pitch: 6.35, type: 'receptacle', pinLabels: ['A', 'B', 'C', 'D'] },
  { id: 'deutsch-dt-6', name: 'Deutsch DT 6P', manufacturer: 'Deutsch', pinCount: 6, pitch: 6.35, type: 'receptacle', pinLabels: ['A', 'B', 'C', 'D', 'E', 'F'] },
];

// ============================================================
// Wire Types
// ============================================================

export const WIRE_TYPES: WireType[] = [
  { id: 'silicone', name: '硅胶线', description: '高柔性耐高温', temperatureRating: '200\u00B0C' },
  { id: 'ul1007', name: 'UL1007', description: '通用PVC线', temperatureRating: '80\u00B0C' },
  { id: 'ul1061', name: 'UL1061', description: '细径PVC线', temperatureRating: '80\u00B0C' },
  { id: 'gxl', name: 'GXL', description: '汽车级交联线', temperatureRating: '125\u00B0C' },
  { id: 'ptfe', name: 'PTFE', description: '特氟龙高温线', temperatureRating: '250\u00B0C' },
];

// ============================================================
// Wire Colors
// ============================================================

export const WIRE_COLORS: WireColor[] = [
  { id: 'red', name: '红色', hex: '#DC2626' },
  { id: 'black', name: '黑色', hex: '#171717' },
  { id: 'white', name: '白色', hex: '#F5F5F5' },
  { id: 'green', name: '绿色', hex: '#16A34A' },
  { id: 'blue', name: '蓝色', hex: '#2563EB' },
  { id: 'yellow', name: '黄色', hex: '#CA8A04' },
  { id: 'orange', name: '橙色', hex: '#EA580C' },
  { id: 'purple', name: '紫色', hex: '#9333EA' },
  { id: 'brown', name: '棕色', hex: '#92400E' },
  { id: 'gray', name: '灰色', hex: '#6B7280' },
  { id: 'pink', name: '粉色', hex: '#EC4899' },
];

// ============================================================
// Wire Gauges
// ============================================================

export const WIRE_GAUGES: WireGauge[] = [
  { awg: 22, diameterMm: 0.644, maxCurrent: 7 },
  { awg: 24, diameterMm: 0.511, maxCurrent: 3.5 },
  { awg: 26, diameterMm: 0.405, maxCurrent: 2.2 },
  { awg: 28, diameterMm: 0.321, maxCurrent: 1.4 },
  { awg: 30, diameterMm: 0.255, maxCurrent: 0.9 },
];

// ============================================================
// Overmold Catalog (外模目录)
// ============================================================

export const OVERMOLDS: OvermoldSpec[] = [
  {
    id: 'pvc-45p-pe',
    name: '黑色PVC外模 + 透明PE内模',
    outerMaterial: '黑色PVC胶料',
    outerHardness: '45P',
    innerMaterial: '低密度透明PE胶料',
    innerMaterialOptional: true,
  },
];

// ============================================================
// Lead Time Options
// ============================================================

export const LEAD_TIME_OPTIONS = [
  { id: 'rush' as const, name: '加急', days: '10个工作日', multiplier: 1.3 },
  { id: 'standard' as const, name: '标准', days: '20-30个工作日', multiplier: 1.0 },
  { id: 'economy' as const, name: '经济', days: '30-50个工作日', multiplier: 0.9 },
];

// ============================================================
// Protection Options
// ============================================================

export const PROTECTION_OPTIONS = [
  { id: 'none', name: '无', price: 0 },
  { id: 'heat-shrink', name: '热缩管', price: 0.5 },
  { id: 'braided', name: '编织网管', price: 1.0 },
  { id: 'spiral', name: '螺旋缠绕管', price: 0.8 },
  { id: 'convoluted', name: '波纹管', price: 1.2 },
];

// ============================================================
// Base Prices
// ============================================================

export const BASE_PRICES = {
  connector: (pinCount: number) => 0.5 + pinCount * 0.3,
  wirePerMeter: (awg: number, type: string) => {
    const gaugeMultiplier: Record<number, number> = { 22: 2.0, 24: 1.5, 26: 1.0, 28: 0.8, 30: 0.6 };
    const typeMultiplier: Record<string, number> = { silicone: 1.5, ul1007: 1.0, ul1061: 0.9, gxl: 1.3, ptfe: 2.0 };
    return (gaugeMultiplier[awg] || 1) * (typeMultiplier[type] || 1);
  },
  laborPerConnector: 2.0,
  laborPerMeter: 1.5,
};
