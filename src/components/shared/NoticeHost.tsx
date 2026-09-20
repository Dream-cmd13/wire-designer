import { useNoticeStore } from '@/stores/noticeStore';
import { ActionToast } from './ActionToast';

/**
 * 统一通知容器：集中处理颜色、关闭时间、重复提示与上下排列。
 * 页面只需调用 notify(...)，不要各自叠加 toast。
 */
export function NoticeHost() {
  const notices = useNoticeStore((state) => state.notices);
  const dismiss = useNoticeStore((state) => state.dismiss);

  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 top-6 z-[75] flex flex-col items-center gap-2.5">
      {notices.map((notice) => (
        <ActionToast
          key={notice.id}
          stacked
          title={notice.title}
          message={notice.message}
          tone={notice.tone}
          primaryAction={notice.action
            ? {
              label: notice.action.label,
              onClick: notice.action.onClick,
              destructive: notice.action.destructive,
            }
            : undefined}
          onClose={() => dismiss(notice.id)}
        />
      ))}
    </div>
  );
}
