import { SSF } from 'xlsx';

/** Keep the source Excel display format separate from the unrounded numeric value. */
export function formatCostNumber(
  value: number | null | undefined,
  numberFormat?: string,
  missing = '-',
): string {
  if (value == null || !Number.isFinite(value)) return missing;
  const plainNumber = () => {
    const text = value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 6 });
    if (value !== 0 && Number(text) === 0) return value > 0 ? '<0.000001' : '>-0.000001';
    return text;
  };
  if (!numberFormat || numberFormat.trim().toLowerCase() === 'general') return plainNumber();
  try {
    return SSF.format(numberFormat, value).trim();
  } catch {
    // SheetJS SSF does not support mixed mandatory/optional fractional digits.
    const decimal = /^(#,##0|0)\.(0*)(#+)$/.exec(numberFormat);
    if (decimal) {
      return value.toLocaleString('en-US', {
        useGrouping: decimal[1].includes(','),
        minimumFractionDigits: decimal[2].length,
        maximumFractionDigits: decimal[2].length + decimal[3].length,
      });
    }
    return plainNumber();
  }
}

export function costNumberFormats(config: Record<string, unknown>): Record<string, string> {
  const formats = config.numberFormats;
  if (!formats || typeof formats !== 'object' || Array.isArray(formats)) return {};
  return Object.fromEntries(Object.entries(formats).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
