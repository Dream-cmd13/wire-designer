import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { StorageBootstrapState } from '@/lib/storageBootstrap';

interface StorageSetupBannerProps {
  state: StorageBootstrapState;
  checking: boolean;
  onRetry: () => void;
}

function bucketNames(bucketIds: string[]) {
  return bucketIds.join('、');
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
          {state.status === 'error' ? (
            <p>{state.message}</p>
          ) : (
            <>
              <p className="font-medium">远程存储未完成初始化。</p>
              {state.missingBuckets.length > 0 && (
                <p>
                  缺少存储桶：<code className="break-all font-mono">{bucketNames(state.missingBuckets)}</code>。
                </p>
              )}
              {state.publicBuckets.length > 0 && (
                <p>
                  以下存储桶不是私有桶：
                  <code className="break-all font-mono">{bucketNames(state.publicBuckets)}</code>。
                </p>
              )}
              <p>
                请在部署环境运行{' '}
                <code className="break-all font-mono">npm run supabase:bootstrap-storage</code>。
              </p>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onRetry}
          disabled={checking}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-amber-700 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          title="重新检测存储状态"
          aria-label="重新检测存储状态"
        >
          <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
