type ErrorShape = { code?: unknown; status?: unknown; message?: unknown };

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return '';
  const message = (error as ErrorShape).message;
  return typeof message === 'string' ? message : '';
}

export function getUserErrorMessage(error: unknown, fallback = '操作失败，请稍后重试。'): string {
  const shape = (error && typeof error === 'object' ? error : {}) as ErrorShape;
  const normalized = getErrorMessage(error).toLowerCase();

  if (/schema cache|could not find the table/.test(normalized)) {
    if (normalized.includes('catalog_items')) return '公共资源数据表不存在或尚未初始化，请联系管理员完成数据库配置。';
    if (normalized.includes('drawing_icons')) return '绘图图标数据表不存在或尚未初始化，请联系管理员完成数据库配置。';
    return '所需数据表不存在或尚未初始化，请联系管理员完成数据库配置。';
  }
  if (/column .* does not exist|could not find .* column/.test(normalized)) return '数据库字段不存在或尚未更新，请联系管理员完成数据库配置。';
  if (shape.status === 401 || normalized.includes('jwt expired')) return '登录状态已失效，请重新登录。';
  if (shape.status === 403 || shape.code === '42501' || normalized.includes('permission denied')) return '没有权限执行此操作。';
  if (shape.status === 409 || shape.code === '23505' || normalized.includes('duplicate key') || normalized.includes('conflict')) return '数据已存在或发生冲突，请刷新后重试。';
  if (error instanceof TypeError || /failed to fetch|network|timeout/.test(normalized)) return '网络连接失败，请检查网络后重试。';
  return fallback;
}
