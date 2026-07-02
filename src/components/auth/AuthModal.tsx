import { useState } from 'react';
import { X, UserPlus, LogIn, Users } from 'lucide-react';
import { useUserStore } from '@/stores/userStore';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AuthMode = 'login' | 'register' | 'switch';

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const { users, currentUser, login, register, switchUser, logout } = useUserStore();

  if (!isOpen) return null;

  const handleLogin = () => {
    setError('');
    const user = login(email, password);
    if (user) {
      onClose();
    } else {
      setError('邮箱或密码错误');
    }
  };

  const handleRegister = () => {
    setError('');
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('请填写所有字段');
      return;
    }
    const user = register(name, email, password);
    if (user) {
      onClose();
    } else {
      setError('该邮箱已注册');
    }
  };

  const handleSwitch = (userId: string) => {
    switchUser(userId);
    onClose();
  };

  const handleLogout = () => {
    logout();
    setMode('login');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-96 max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">
            {mode === 'login' && '用户登录'}
            {mode === 'register' && '注册新用户'}
            {mode === 'switch' && '切换用户'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
            当前为本地演示登录，账号和项目仅保存在此浏览器中。后续如启用 Supabase，再切换为正式云端登录。
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
          )}

          {mode === 'switch' ? (
            <div className="space-y-2">
              {currentUser && (
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                      {currentUser.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{currentUser.name}</div>
                      <div className="text-xs text-slate-500">{currentUser.email}</div>
                    </div>
                  </div>
                  <span className="text-xs text-blue-600 font-medium">当前</span>
                </div>
              )}
              {users
                .filter((u) => u.id !== currentUser?.id)
                .map((user) => (
                  <button
                    key={user.id}
                    onClick={() => handleSwitch(user.id)}
                    className="w-full flex items-center gap-2 p-3 hover:bg-slate-50 rounded-lg transition-colors text-left cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-300 text-white flex items-center justify-center text-sm font-medium">
                      {user.name[0]}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-800">{user.name}</div>
                      <div className="text-xs text-slate-500">{user.email}</div>
                    </div>
                  </button>
                ))}
              {users.length <= 1 && (
                <div className="text-center text-sm text-slate-400 py-4">没有其他用户</div>
              )}
            </div>
          ) : (
            <>
              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">用户名</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入用户名"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">邮箱</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入邮箱"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="请输入密码"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 space-y-2">
          {mode === 'login' && (
            <>
              <button
                onClick={handleLogin}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                <LogIn className="w-4 h-4" /> 登录
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" /> 注册
                </button>
                {users.length > 0 && (
                  <button
                    onClick={() => { setMode('switch'); setError(''); }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors cursor-pointer"
                  >
                    <Users className="w-4 h-4" /> 切换
                  </button>
                )}
              </div>
            </>
          )}

          {mode === 'register' && (
            <>
              <button
                onClick={handleRegister}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" /> 注册
              </button>
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors cursor-pointer"
              >
                已有账号？去登录
              </button>
            </>
          )}

          {mode === 'switch' && (
            <>
              {currentUser && (
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors cursor-pointer"
                >
                  退出登录
                </button>
              )}
              <button
                onClick={() => { setMode('login'); setError(''); }}
                className="w-full px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors cursor-pointer"
              >
                返回登录
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
