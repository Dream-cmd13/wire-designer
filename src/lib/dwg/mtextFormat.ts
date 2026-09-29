export interface MTextHeightCode {
  value: number;
  /** 代码形如 \\H0.8x; 时为相对当前高度的倍数，形如 \\H2.5; 时为绝对高度。 */
  relative: boolean;
}

export interface MTextContent {
  lines: string[];
  /** MTEXT 内联颜色代码（\\C<index>;）最后一次出现值；256 表示随层。 */
  colorIndex: number | null;
  bold: boolean;
  /** MTEXT 内联字高代码（\\H<value>[x];）；存在多个不同取值时返回 null。 */
  height: MTextHeightCode | null;
}

/**
 * AutoCAD 单行文本中的 %% 控制码：%%d 度数、%%p 正负号、%%c 直径、%%% 百分号；
 * %%u/%%o/%%k 为下划线/上划线/删除线开关，渲染时去除。
 */
export function decodePercentCodes(text: string): string {
  return text
    .replace(/%%[uUoOkK]/g, '')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/%%[cC]/g, '⌀')
    .replace(/%%%/g, '%');
}

const SKIP_TO_SEMICOLON_CODES = new Set(['f', 'F', 'W', 'Q', 'T', 'A', 'p']);
const TOGGLE_CODES = new Set(['L', 'l', 'O', 'o', 'K', 'k', 'N', 'n']);

/**
 * 解析 MTEXT 文本中的格式化代码（\\fSimSun|b0|i0|c134|p2;、\\C1;、\\P 换行、\\H1.5x; 等），
 * 返回纯文本行。仅保留最后一个颜色代码、是否加粗与统一的内联字高，用于渲染。
 */
export function parseMText(raw: string): MTextContent {
  const lines: string[] = [];
  let current = '';
  let colorIndex: number | null = null;
  let bold = false;
  let height: MTextHeightCode | null = null;
  let heightConflict = false;
  let index = 0;

  const skipToSemicolon = (): void => {
    const end = raw.indexOf(';', index);
    index = end < 0 ? raw.length : end + 1;
  };

  while (index < raw.length) {
    const character = raw[index];

    if (character === '\\') {
      const next = raw[index + 1];
      if (next === undefined) break;

      if (next === 'P') {
        lines.push(decodePercentCodes(current));
        current = '';
        index += 2;
        continue;
      }
      if (SKIP_TO_SEMICOLON_CODES.has(next)) {
        if (next === 'f' || next === 'F') {
          const end = raw.indexOf(';', index);
          const spec = raw.slice(index + 2, end < 0 ? raw.length : end);
          if (/(^|\|)b1(\||$)/.test(spec)) bold = true;
        }
        skipToSemicolon();
        continue;
      }
      if (next === 'S') {
        const end = raw.indexOf(';', index);
        const body = raw.slice(index + 2, end < 0 ? raw.length : end);
        current += body.replace(/#/g, '/').replace(/\^/g, ' ');
        index = end < 0 ? raw.length : end + 1;
        continue;
      }
      if (next === 'C') {
        const end = raw.indexOf(';', index);
        const value = Number.parseInt(raw.slice(index + 2, end < 0 ? raw.length : end), 10);
        if (Number.isFinite(value)) colorIndex = value;
        index = end < 0 ? raw.length : end + 1;
        continue;
      }
      if (next === 'H') {
        const end = raw.indexOf(';', index);
        const body = raw.slice(index + 2, end < 0 ? raw.length : end).trim();
        const match = /^([0-9]*\.?[0-9]+)(x?)$/i.exec(body);
        if (match) {
          const value = Number.parseFloat(match[1]);
          const relative = match[2].toLowerCase() === 'x';
          if (value > 0) {
            if (!height) height = { value, relative };
            else if (height.value !== value || height.relative !== relative) heightConflict = true;
          }
        }
        index = end < 0 ? raw.length : end + 1;
        continue;
      }
      if (TOGGLE_CODES.has(next)) {
        index += 2;
        continue;
      }
      if (next === '~') {
        current += ' ';
        index += 2;
        continue;
      }
      if (next === '\\' || next === '{' || next === '}') {
        current += next;
        index += 2;
        continue;
      }
      index += 2;
      continue;
    }

    if (character === '{' || character === '}') {
      index += 1;
      continue;
    }

    current += character;
    index += 1;
  }

  lines.push(decodePercentCodes(current));

  return {
    lines: lines.map((line) => line.replace(/\s+$/, '')),
    colorIndex,
    bold,
    height: heightConflict ? null : height,
  };
}
