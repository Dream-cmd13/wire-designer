import { useState } from 'react';
import { LogIn, LockKeyhole } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';

interface LoginRequiredPanelProps {
  title?: string;
  description?: string;
}

export function LoginRequiredPanel({
  title = '需要登录后使用',
  description = '当前功能需要登录后使用，请先登录。',
}: LoginRequiredPanelProps = {}) {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <div className="flex h-full items-center justify-center bg-slate-100 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <LockKeyhole className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-2 text-sm text-slate-500">{description}</p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            <LogIn className="h-4 w-4" />
            登录
          </button>
        </div>
      </div>
      {authOpen && <AuthModal isOpen onClose={() => setAuthOpen(false)} />}
    </>
  );
}
