export type WriteFailureCode = 'conflict' | 'missing' | 'forbidden' | 'network';

/**
 * 文档写入失败分类：冲突不能按普通网络错误自动重试，必须保留本地内容并交由用户选择恢复方式。
 */
export class DocumentWriteError extends Error {
  readonly code: WriteFailureCode;

  constructor(code: WriteFailureCode, message: string) {
    super(message);
    this.name = 'DocumentWriteError';
    this.code = code;
  }
}

interface PostgrestErrorLike {
  message?: unknown;
  code?: unknown;
}

const CONFLICT_MESSAGE = '云端已有更新的版本，本次保存未覆盖本地内容。请选择恢复方式。';
const MISSING_MESSAGE = '该文档已在云端被删除，本次保存未写入；本地内容仍保留。';
const FORBIDDEN_MESSAGE = '当前账号暂时无法保存，请重新登录或联系管理员。';

/** 把 Supabase/PostgREST 错误转换为带分类的写入错误；无法识别的一律按网络失败处理。 */
export function toDocumentWriteError(
  error: unknown,
  fallbackMessage = '保存失败，请检查网络后重试。',
): DocumentWriteError {
  if (error instanceof DocumentWriteError) return error;
  const shape = (error && typeof error === 'object' ? error : {}) as PostgrestErrorLike;
  const message = typeof shape.message === 'string' ? shape.message : '';
  const code = typeof shape.code === 'string' ? shape.code : '';
  if (code === '42501' || message.includes('Forbidden')) {
    return new DocumentWriteError('forbidden', FORBIDDEN_MESSAGE);
  }
  if (message.includes('Version conflict') || code === '40001') {
    return new DocumentWriteError('conflict', CONFLICT_MESSAGE);
  }
  if (message.includes('Document already exists') || code === '23505') {
    return new DocumentWriteError('conflict', '云端已存在同 ID 的文档，未执行覆盖写入。请刷新后处理。');
  }
  if (message.includes('Document not found')) {
    return new DocumentWriteError('missing', MISSING_MESSAGE);
  }
  return new DocumentWriteError('network', fallbackMessage);
}

export function isDocumentWriteConflict(error: unknown): boolean {
  return error instanceof DocumentWriteError && error.code === 'conflict';
}
