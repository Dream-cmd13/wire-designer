import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { StorageBootstrapState } from '@/lib/storageBootstrap';

interface StorageSetupBannerProps {
  state: StorageBootstrapState;
  checking: boolean;
  onRetry: () => void;
}

export function StorageSetupBanner({ state, checking, onRetry }: StorageSetupBannerProps) {
  if (state.status === 'ready' || state.status === 'unconfigured') return null;

  return (
    <div
      className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-amber-900"
      role="alert"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 text-xs leading-5">
          <p className="font-medium">
            {state.status === 'error'
              ? state.message
              : '图片和附件功能暂时不可用，保存或查看可能会失败。请联系管理员完成系统配置。'}
          </p>
          <p className="mt-0.5 text-amber-800/80">配置完成后可重新检测，无需刷新页面。</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="重新检测文件服务状态"
          aria-label="重新检测文件服务状态"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
          重新检测
        </button>
      </div>
    </div>
  );
}
