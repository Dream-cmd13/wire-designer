import type { JacketCoreCount, JacketMaterial, JacketColor } from '@/types/harness';

export interface ParsedWireSpec {
  color?: string;
  lengthMm?: number;
  awg?: number;
  ulNumber?: string;
  jacketMaterial?: JacketMaterial;
  jacketColor?: JacketColor;
  coreCount?: JacketCoreCount;
  shielded?: boolean;
}

const JACKET_CORE_COUNTS: JacketCoreCount[] = [
  1, 2, 3, 4, 5, 6, 8, 12, 17, 20, 24, 30, 32, 40, 50,
];

/**
 * Parses a simplified quick input string to extract wire/cable parameters.
 * E.g., "pvc 22 8" -> { jacketMaterial: 'PVC', awg: 22, coreCount: 8 }
 *       "red 22 300" -> { color: 'red', awg: 22, lengthMm: 300 }
 */
export function parseQuickInput(query: string, kind: 'electronic' | 'jacketed'): ParsedWireSpec {
  const result: ParsedWireSpec = {};
  if (!query) return result;

  // Normalize query: lowercase, replace commas/dashes/underscores/slashes with space
  let text = query.toLowerCase().replace(/[,;\-_/]/g, ' ').trim();

  // 1. Explicit regex parsing

  // AWG: temporarily only recognize 22. E.g. "22awg", "22 awg", "22g", "22 g", "awg22", "awg 22"
  const awgMatch = text.match(/\b(awg\s*|g\s*)?(\d+)\s*(awg|g)\b/i) || text.match(/\b(awg)\s*(\d+)\b/i);
  if (awgMatch) {
    const val = parseInt(awgMatch[2] || awgMatch[1], 10);
    if (!isNaN(val)) {
      if (val === 22) {
        result.awg = 22;
      }
      text = text.replace(awgMatch[0], ' ');
    }
  }

  // Length: e.g. "300mm", "300 mm", "300毫米", "300m" -> Discard length from parsing
  const lenMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(mm|毫米|m|米)\b/i);
  if (lenMatch) {
    text = text.replace(lenMatch[0], ' ');
  }

  // Core count: e.g. "8芯", "8芯线", "8core", "8cores", "8c", "8p"
  const coreMatch = text.match(/\b(\d+)\s*(芯|core|cores|c|p)\b/i);
  if (coreMatch) {
    const val = parseInt(coreMatch[1], 10);
    if (!isNaN(val)) {
      if (JACKET_CORE_COUNTS.includes(val as JacketCoreCount)) {
        result.coreCount = val as JacketCoreCount;
      }
      text = text.replace(coreMatch[0], ' ');
    }
  }

  // Shielded: e.g. "shield", "shielded", "屏蔽", "带屏蔽", "双绞屏蔽", "不带屏蔽", "非屏蔽", "无屏蔽"
  const unshieldMatch = text.match(/(不带|非|无|un|non|no\s+)\s*(shield|屏蔽)/i);
  if (unshieldMatch) {
    result.shielded = false;
    text = text.replace(unshieldMatch[0], ' ');
  } else {
    const shieldMatch = text.match(/(shield|屏蔽)/i);
    if (shieldMatch) {
      result.shielded = true;
      text = text.replace(shieldMatch[0], ' ');
    }
  }

  // Jacket material: "pvc", "pur"
  const matMatch = text.match(/\b(pvc|pur)\b/i);
  if (matMatch) {
    result.jacketMaterial = matMatch[1].toUpperCase() as JacketMaterial;
    text = text.replace(matMatch[0], ' ');
  }

  // UL Number: "1007", "2464", "20276"
  const ulMatch = text.match(/\b(?:ul)?\s*(1007|2464|20276)\b/i);
  if (ulMatch) {
    const val = ulMatch[1];
    if (val === '1007') {
      result.ulNumber = '1007';
    } else {
      result.ulNumber = 'UL' + val;
    }
    text = text.replace(ulMatch[0], ' ');
  }

  // Colors:
  if (kind === 'electronic') {
    const colorMap: Record<string, string> = {
      '红色': 'red', '红': 'red', 'red': 'red',
      '黑色': 'black', '黑': 'black', 'black': 'black',
      '白色': 'white', '白': 'white', 'white': 'white',
      '绿色': 'green', '绿': 'green', 'green': 'green',
      '蓝色': 'blue', '蓝': 'blue', 'blue': 'blue',
      '黄色': 'yellow', '黄': 'yellow', 'yellow': 'yellow',
      '橙色': 'orange', '橙': 'orange', 'orange': 'orange',
      '紫色': 'purple', '紫': 'purple', 'purple': 'purple',
      '棕色': 'brown', '棕': 'brown', 'brown': 'brown',
      '灰色': 'gray', '灰': 'gray', 'gray': 'gray',
      '金色': 'gold', '金': 'gold', 'gold': 'gold',
      '粉色': 'pink', '粉': 'pink', 'pink': 'pink',
      '黄注绿': 'yellow-green', '黄绿': 'yellow-green', 'yellowgreen': 'yellow-green', 'yellow-green': 'yellow-green',
      '空白': 'blank', 'blank': 'blank',
    };
    for (const key of Object.keys(colorMap)) {
      // Use regex to match boundary word or raw character
      const isChinese = /[\u4e00-\u9fa5]/.test(key);
      const pattern = isChinese ? key : `\\b${key}\\b`;
      if (new RegExp(pattern, 'i').test(text)) {
        result.color = colorMap[key];
        text = text.replace(new RegExp(pattern, 'gi'), ' ');
        break; // Take first matched color
      }
    }
  } else {
    // Jacket colors: black / green
    const jacketColorMap: Record<string, JacketColor> = {
      '黑色': 'black', '黑': 'black', 'black': 'black',
      '绿色': 'green', '绿': 'green', 'green': 'green',
    };
    for (const key of Object.keys(jacketColorMap)) {
      const isChinese = /[\u4e00-\u9fa5]/.test(key);
      const pattern = isChinese ? key : `\\b${key}\\b`;
      if (new RegExp(pattern, 'i').test(text)) {
        result.jacketColor = jacketColorMap[key];
        text = text.replace(new RegExp(pattern, 'gi'), ' ');
        break;
      }
    }
  }

  // 2. Scan remaining tokens for standalone numbers (heuristic parsing)
  const numMatches = text.match(/\b\d+(\.\d+)?\b/g);
  if (numMatches) {
    const numbers = numMatches.map(Number).filter((n) => !isNaN(n));

    for (const num of numbers) {
      // Heuristic: If awg is not defined and number is 22, recognize it
      if (num === 22 && result.awg === undefined) {
        result.awg = 22;
      }
      // Heuristic: If coreCount is not defined (jacketed only) and number is a valid core count
      else if (
        kind === 'jacketed' &&
        result.coreCount === undefined &&
        JACKET_CORE_COUNTS.includes(num as JacketCoreCount)
      ) {
        result.coreCount = num as JacketCoreCount;
      }
      // Fallback: If we have an unused small number, it could be coreCount
      else if (kind === 'jacketed' && result.coreCount === undefined && num > 0 && num <= 100) {
        result.coreCount = num as JacketCoreCount;
      }
    }
  }

  return result;
}
