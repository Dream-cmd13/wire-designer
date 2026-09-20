type ErrorShape = { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

/**
 * 业务校验错误：文案本身就是给用户看的说明（例如“第 3 行线材规格末尾须有长度”），
 * 允许原样展示。数据库、网络、存储等原始错误一律不允许直出，必须经 getUserErrorMessage 转换。
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return '';
  const message = (error as ErrorShape).message;
  return typeof message === 'string' ? message : '';
}

function isUserFacingError(error: unknown): boolean {
  if (error instanceof UserFacingError) return true;
  if (!error || typeof error !== 'object') return false;
  return (error as ErrorShape).name === 'UserFacingError';
}

export function getUserErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  if (isUserFacingError(error)) return getErrorMessage(error) || fallback;

  const shape = (error && typeof error === 'object' ? error : {}) as ErrorShape;
  const normalized = getErrorMessage(error).toLowerCase();
  const status = typeof shape.status === 'number' ? shape.status : undefined;
  const code = typeof shape.code === 'string' ? shape.code : undefined;
  const name = typeof shape.name === 'string' ? shape.name.toLowerCase() : '';

  if (/invalid login credentials|invalid_grant|invalid password|email not confirmed/.test(normalized)) {
    return '账号或密码不正确，请重新输入。';
  }
  if (status === 401 || /jwt expired|session.*(expired|missing|not found)|refresh token|not authenticated/.test(normalized)) {
    return '登录已过期，请重新登录后继续。';
  }
  if (status === 403 || code === '42501' || /permission denied|insufficient privilege|row-level security|not authorized|forbidden/.test(normalized)) {
    return '没有权限执行此操作，请联系管理员处理。';
  }
  if (name.includes('quotaexceeded') || /quota|storage full|disk full/.test(normalized)) {
    return '本地存储空间不足，未能备份最新修改，请清理空间后重试。';
  }
  if (name.includes('securityerror') || /access is denied|operation is insecure|local.?storage/.test(normalized)) {
    return '浏览器阻止了本机存储，未能备份最新修改，请检查浏览器隐私设置后重试。';
  }
  if (/schema cache|could not find the table|does not exist/.test(normalized)) {
    return '所需数据暂时无法加载，请联系管理员处理。';
  }
  if (/object not found|no such object|file.*not found/.test(normalized)) {
    return '相关文件不存在或已被删除，请联系管理员确认。';
  }
  if (/bucket|storage|failed to (download|upload)/.test(normalized)) {
    return '图片和附件暂时无法加载，请稍后重试；如持续出现，请联系管理员。';
  }
  if (/unexpected token|json\.parse|failed to parse|parse error|corrupt|malformed|invalid file/.test(normalized)) {
    return '文件内容已损坏或格式不正确，无法读取。';
  }
  if (status === 409 || code === '23505' || /duplicate key|already exists|conflict/.test(normalized)) {
    return '相同记录已存在，请刷新后重试。';
  }
  if (error instanceof TypeError || /failed to fetch|network|timeout|timed out|offline|connection|fetch/.test(normalized)) {
    return '网络连接失败，请检查网络后重试。';
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    return '服务暂时不可用，请稍后重试。';
  }
  return fallback;
}
