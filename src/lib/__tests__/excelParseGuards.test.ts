import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePriceWorkbook } from '@/lib/priceImport';
import { UserFacingError } from '@/lib/userErrorMessage';
import { assertZipWithinBudget, estimateZipUncompressedBytes } from '@/lib/zipBudget';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function workbookBuffer(sheet: XLSX.WorkSheet): ArrayBuffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '材料价格');
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

function priceSheet(dataRows: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([
    ['物料类型', '物料名称', '规格', '单位', '含税单价'],
    ...dataRows,
  ]);
}

/** 用真实 deflate 构造一个高压缩比 ZIP（可控的最小异常样本，不做无限展开）。 */
function buildDeflatedZip(content: Uint8Array): Uint8Array {
  const name = Buffer.from('bomb.bin');
  const compressed = deflateRawSync(Buffer.from(content));

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(content.length, 22);
  local.writeUInt16LE(name.length, 26);
  const localRecord = Buffer.concat([local, name, compressed]);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(compressed.length, 20);
  central.writeUInt32LE(content.length, 24);
  central.writeUInt16LE(name.length, 28);
  const centralRecord = Buffer.concat([central, name]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralRecord.length, 12);
  eocd.writeUInt32LE(localRecord.length, 16);

  return Buffer.concat([localRecord, centralRecord, eocd]);
}

describe('excel parse guards', () => {
  it('estimates the decompressed size of a real workbook without unpacking it', () => {
    const buffer = workbookBuffer(priceSheet([['连接器', 'M12', '4针', '个', 1.23]]));
    const estimated = estimateZipUncompressedBytes(buffer);
    expect(estimated).toBeGreaterThan(0);
    expect(estimated).toBeLessThan(128 * 1024 * 1024);
    expect(() => assertZipWithinBudget(buffer)).not.toThrow();
  });

  it('rejects a high-compression zip before parsing', () => {
    const bomb = buildDeflatedZip(new Uint8Array(2 * 1024 * 1024));
    expect(estimateZipUncompressedBytes(toArrayBuffer(bomb))).toBe(2 * 1024 * 1024);
    expect(() => assertZipWithinBudget(toArrayBuffer(bomb), 1024 * 1024)).toThrow(/解压后超过/);
  });

  it('rejects a price file over the 5 MB compressed limit before parsing', () => {
    const oversized = new ArrayBuffer(5 * 1024 * 1024 + 1);
    expect(() => parsePriceWorkbook(oversized, [])).toThrow(/不能超过 5 MB/);
  });

  it('rejects a corrupt workbook with a user-facing error', () => {
    const corrupt = toArrayBuffer(Buffer.from('PK\u0003\u0004 this is a broken zip payload', 'latin1'));
    expect(() => parsePriceWorkbook(corrupt, [])).toThrow(UserFacingError);
    expect(() => parsePriceWorkbook(corrupt, [])).toThrow(/损坏/);
  });

  it('rejects a sheet range beyond 10000 rows or 5 columns', () => {
    const tooTall = priceSheet([['连接器', 'M12', '4针', '个', 1]]);
    tooTall['!ref'] = 'A1:E10002';
    expect(() => parsePriceWorkbook(workbookBuffer(tooTall), [])).toThrow(/最多 10000/);

    const tooWide = priceSheet([['连接器', 'M12', '4针', '个', 1]]);
    tooWide['!ref'] = 'A1:F2';
    expect(() => parsePriceWorkbook(workbookBuffer(tooWide), [])).toThrow(/最多 10000/);
  });

  it('rejects a template-only workbook with no price rows', () => {
    const buffer = workbookBuffer(priceSheet([]));
    expect(() => parsePriceWorkbook(buffer, [])).toThrow(/价格记录必须为 1 至 10000/);
  });
});
