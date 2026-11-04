import { UserFacingError } from './userErrorMessage';

const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP64_MARKER = 0xffffffff;
const EOCD_MIN_LENGTH = 22;
const EOCD_MAX_COMMENT = 65536;

/** 浏览器内解析 Excel 的解压后体积预算，防止高压缩比文件阻塞主线程。 */
export const EXCEL_DECOMPRESSED_BUDGET_BYTES = 128 * 1024 * 1024;

/**
 * 通过 ZIP 中央目录估算解压后总字节数（不实际解压）。
 * 不是合法 ZIP 或使用 ZIP64/数据描述符无法估算时返回 null，由调用方按损坏文件处理。
 * 超过预算时提前返回当前累计值（调用方只用于拒绝判断）。
 */
export function estimateZipUncompressedBytes(data: ArrayBuffer): number | null {
  const view = new DataView(data);
  const length = view.byteLength;
  if (length < EOCD_MIN_LENGTH) return null;

  const searchStart = Math.max(0, length - EOCD_MIN_LENGTH - EOCD_MAX_COMMENT);
  let eocdOffset = -1;
  for (let offset = length - EOCD_MIN_LENGTH; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === ZIP_EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  if (entryCount === 0xffff || centralOffset === ZIP64_MARKER) return null;

  let offset = centralOffset;
  let total = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > length || view.getUint32(offset, true) !== ZIP_CENTRAL_SIGNATURE) {
      return null;
    }
    const uncompressed = view.getUint32(offset + 24, true);
    if (uncompressed === ZIP64_MARKER) return null;
    total += uncompressed;
    if (total > EXCEL_DECOMPRESSED_BUDGET_BYTES) return total;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return total;
}

/** 解析前检查解压后体积；无法估算（非 ZIP/损坏）时交由解析器按损坏文件处理。 */
export function assertZipWithinBudget(
  data: ArrayBuffer,
  limitBytes: number = EXCEL_DECOMPRESSED_BUDGET_BYTES,
): void {
  const uncompressed = estimateZipUncompressedBytes(data);
  if (uncompressed !== null && uncompressed > limitBytes) {
    throw new UserFacingError(
      `文件解压后超过 ${Math.round(limitBytes / (1024 * 1024))} MB，已拒绝解析。`,
    );
  }
}
