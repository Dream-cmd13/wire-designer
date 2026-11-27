export const QUOTE_FILE_MAX_MIB = 20;
export const QUOTE_FILE_MAX_BYTES = QUOTE_FILE_MAX_MIB * 1024 * 1024;
export const QUOTE_FILE_MAX_COUNT = 5;
export const QUOTE_FILE_ACCEPT = '.pdf,.dwg,.dxf,.jpg,.jpeg,.png';
export const QUOTE_KINDS = ['按图加工', '新线束设计', '按样品评估'] as const;
export const QUOTE_REQUEST_BUCKET = 'quote-request-files';
export const QUOTE_UPLOAD_HOURS = 2;
export const QUOTE_CLEANUP_HOURS = 3;
const extensions = new Set(QUOTE_FILE_ACCEPT.split(','));

export interface QuoteFile {
  name: string;
  size: number;
  sha256: string;
}

export interface QuoteRequestInput {
  name: string;
  phone: string;
  email: string;
  company: string;
  demand: string;
  kind: string;
  files: QuoteFile[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || value.trim().length > max) throw new Error(`请检查${label}，最多 ${max} 字。`);
  return value.trim();
}

export function validateQuoteFile(name: string, size: number): void {
  if (!name || name.length > 160 || /[<>:"/\\|?*]/u.test(name) || Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error('文件名无效，请重命名后再上传。');
  }
  if (!extensions.has(name.slice(name.lastIndexOf('.')).toLowerCase())) throw new Error(`不支持文件「${name}」的格式。`);
  if (!Number.isSafeInteger(size) || size < 1 || size > QUOTE_FILE_MAX_BYTES) throw new Error(`「${name}」须为非空文件，且不超过 ${QUOTE_FILE_MAX_MIB} MB。`);
}

type QuoteRequestFields = Pick<QuoteRequestInput, 'demand' | 'name' | 'phone' | 'email'>;

export type QuoteRequestFieldErrors = Partial<Record<keyof QuoteRequestFields | 'contact', string>>;

function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/gu, '').replace(/^\+86/u, '');
}

export function getQuoteRequestFieldErrors(fields: QuoteRequestFields, hasFiles: boolean): QuoteRequestFieldErrors {
  const errors: QuoteRequestFieldErrors = {};
  const rawPhone = fields.phone.trim();
  const phone = normalizePhone(rawPhone);
  const email = fields.email.trim();
  if (!fields.demand.trim() && !hasFiles) errors.demand = '请描述需求或上传至少一份图纸。';
  if (!fields.name.trim()) errors.name = '请填写联系人。';
  if (!rawPhone && !email) errors.contact = '请填写手机号或邮箱，方便专员联系。';
  if (rawPhone && !/^1[3-9]\d{9}$/u.test(phone)) errors.phone = '请输入有效的中国大陆 11 位手机号。';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) errors.email = '请填写有效的邮箱。';
  return errors;
}

export function validateQuoteRequest(value: unknown): QuoteRequestInput {
  if (!isRecord(value)) throw new Error('询价内容无效。');
  const name = text(value.name, 60, '联系人');
  const company = text(value.company, 120, '企业名称');
  const demand = text(value.demand, 3000, '需求说明');
  const rawPhone = text(value.phone, 32, '手机号');
  const phone = normalizePhone(rawPhone);
  const email = text(value.email, 254, '邮箱').toLowerCase();
  const kind = text(value.kind, 20, '需求类型');
  const fieldErrors = getQuoteRequestFieldErrors({ name, phone: rawPhone, email, demand }, Array.isArray(value.files) && value.files.length > 0);
  const contactError = fieldErrors.name ?? fieldErrors.contact ?? fieldErrors.phone ?? fieldErrors.email;
  if (contactError) throw new Error(contactError);
  if (kind && !QUOTE_KINDS.some((option) => option === kind)) throw new Error('需求类型无效。');
  if (!Array.isArray(value.files) || value.files.length > QUOTE_FILE_MAX_COUNT) throw new Error('最多上传 5 份图纸。');
  const files = value.files.map((file: unknown): QuoteFile => {
    if (!isRecord(file) || typeof file.name !== 'string' || typeof file.size !== 'number'
      || typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(file.sha256)) throw new Error('附件资料无效，请重新选择文件。');
    validateQuoteFile(file.name, file.size);
    return { name: file.name, size: file.size, sha256: file.sha256 };
  });
  if (fieldErrors.demand) throw new Error(fieldErrors.demand);
  return { name, phone, email, company, demand, kind, files };
}

export function hasQuoteFileSignature(name: string, bytes: Uint8Array): boolean {
  const header = new TextDecoder().decode(bytes.subarray(0, 4096));
  switch (name.slice(name.lastIndexOf('.')).toLowerCase()) {
    case '.pdf': return /^%PDF-\d\.\d/u.test(header);
    case '.dwg': return /^AC10\d{2}/u.test(header);
    case '.dxf': return header.startsWith('AutoCAD Binary DXF\r\n\x1a\0')
      || /^(?:\s*999[ \t]*\r?\n[^\r\n]*\r?\n)*\s*0[ \t]*\r?\n[ \t]*SECTION\b/u.test(header);
    case '.png': return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    case '.jpg':
    case '.jpeg': return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    default: return false;
  }
}

export async function quoteFileHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function quoteFilePath(id: string, index: number): string {
  return `${id}/${index}`;
}
