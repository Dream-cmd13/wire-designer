/**
 * DWG 文字度量：解析（折行、包围盒估算）与渲染（字号、行距）共用同一套比例，
 * 否则会出现折行后仍超出文字框或包围盒偏差。
 */

/** canvas 字号 / 文字高度（图纸文字高度为大写字母高度）。 */
export const TEXT_SIZE_RATIO = 1.35;

/** 行距 / 文字高度。 */
export const TEXT_LINE_SPACING = 1.66;

/** 西文字符宽度 / em；宋体实测 CJK 为 1 em、西文为 0.5 em。 */
export const TEXT_LATIN_EM_RATIO = 0.5;

const WIDE_CHAR_START = 0x2e80;

/** CJK 等全角字符（可独立断行；西文单词则不可从中间断开）。 */
export function isWideChar(char: string): boolean {
  return char.charCodeAt(0) > WIDE_CHAR_START;
}

export function textCharWidth(char: string, height: number): number {
  const em = height * TEXT_SIZE_RATIO;
  return isWideChar(char) ? em : em * TEXT_LATIN_EM_RATIO;
}

export function textWidthOf(line: string, height: number): number {
  let width = 0;
  for (const char of line) width += textCharWidth(char, height);
  return width;
}
