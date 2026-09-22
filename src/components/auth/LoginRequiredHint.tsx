import { useState } from 'react';
import { LogIn, LockKeyhole } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';

interface LoginRequiredHintProps {
  message?: string;
  className?: string;
}

export function LoginRequiredHint({
  message = '登录后才能访问公共物料目录。',
  className = '',
}: LoginRequiredHintProps) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded border border-dashed border-slate-300 bg-slate-50 p-4 text-center ${className}`}
      >
        <LockKeyhole className="h-5 w-5 text-slate-400" />
        <p className="text-xs text-slate-600">{message}</p>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1 rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          <LogIn className="h-3.5 w-3.5" />
          登录
        </button>
      </div>
      {authOpen && <AuthModal isOpen onClose={() => setAuthOpen(false)} />}
    </>
  );
}
