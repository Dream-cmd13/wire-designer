import { X, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { ReactNode } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
  title?: string;
  destructive?: boolean;
}

interface ActionToastProps {
  title?: string;
  message: string;
  tone?: 'default' | 'success' | 'danger';
  role?: 'status' | 'alertdialog';
  primaryAction?: ToastAction;
  secondaryAction?: ToastAction;
  onClose: () => void;
  position?: 'top' | 'center';
}

const TONE_STYLES: Record<NonNullable<ActionToastProps['tone']>, string> = {
  default: 'border-slate-200/80 bg-white/95 text-slate-800 shadow-[0_10px_35px_rgba(0,0,0,0.08)]',
  success: 'border-emerald-200 bg-white/95 text-slate-850 shadow-[0_10px_35px_rgba(16,185,129,0.06),0_10px_35px_rgba(0,0,0,0.06)]',
  danger: 'border-rose-200 bg-white/95 text-slate-850 shadow-[0_10px_35px_rgba(244,63,94,0.06),0_10px_35px_rgba(0,0,0,0.06)]',
};

const TONE_DEFAULTS = {
  default: {
    iconClass: 'bg-blue-50 text-blue-500 border border-blue-100/60',
    icon: <Info className="h-4 w-4" />,
  },
  success: {
    iconClass: 'bg-emerald-50 text-emerald-600 border border-emerald-100/60',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  danger: {
    iconClass: 'bg-rose-50 text-rose-500 border border-rose-100/60',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
};

const POSITION_STYLES = {
  top: 'top-8 left-1/2 -translate-x-1/2 animate-toast-in-top',
  center: 'top-[35%] left-1/2 z-[75] animate-toast-in-center',
};

function ToastButton({ action, emphasis = 'secondary' }: { action: ToastAction; emphasis?: 'primary' | 'secondary' }) {
  const baseClassName = emphasis === 'primary'
    ? action.destructive
      ? 'bg-rose-500 text-white hover:bg-rose-600 active:bg-rose-700 shadow-sm shadow-rose-500/10 disabled:bg-slate-100 disabled:text-slate-400'
      : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 shadow-sm shadow-blue-500/10 disabled:bg-slate-100 disabled:text-slate-400'
    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-800 disabled:text-slate-405';

  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      title={action.title}
      className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-[0.98] disabled:active:scale-100 disabled:cursor-not-allowed ${baseClassName}`}
    >
      {action.icon}
      <span>{action.label}</span>
    </button>
  );
}

export function ActionToast({
  title,
  message,
  tone = 'default',
  role = 'status',
  primaryAction,
  secondaryAction,
  onClose,
  position = 'top',
}: ActionToastProps) {
  const config = TONE_DEFAULTS[tone];
  const isCenter = position === 'center';

  const toastContent = (
    <div
      role={role}
      aria-live={role === 'status' ? 'polite' : 'assertive'}
      className={`fixed z-[75] flex min-w-[340px] max-w-[min(92vw,560px)] items-center gap-3.5 rounded-xl border p-4 shadow-xl backdrop-blur-md ${POSITION_STYLES[position]} ${TONE_STYLES[tone]}`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${config.iconClass}`}>
        {config.icon}
      </div>
      <div className="min-w-0 flex-1">
        {title ? <div className="mb-0.5 text-sm font-bold text-slate-900">{title}</div> : null}
        <div className="text-xs font-medium text-slate-550 leading-relaxed">{message}</div>
      </div>
      {(secondaryAction || primaryAction) && (
        <div className="flex shrink-0 items-center gap-1.5">
          {secondaryAction ? <ToastButton action={secondaryAction} /> : null}
          {primaryAction ? <ToastButton action={primaryAction} emphasis="primary" /> : null}
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 flex items-center justify-center cursor-pointer"
        aria-label="关闭提示"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  if (isCenter) {
    return (
      <>
        <div className="fixed inset-0 z-[70] bg-slate-900/10 backdrop-blur-[1px] transition-opacity duration-300" onClick={onClose} />
        {toastContent}
      </>
    );
  }

  return toastContent;
}


