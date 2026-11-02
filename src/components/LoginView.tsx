import React, { useState } from 'react';
import { Gamepad2, Lock, User, LogIn, AlertCircle, Loader2, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { GameNetSettings, User as UserType } from '../types/index.ts';

interface LoginViewProps {
  settings?: GameNetSettings;
  users?: UserType[];
  onLoginSuccess: (user: UserType) => void;
  onLoginSubmit: (credentials: { username: string; password?: string }) => Promise<UserType>;
}

export const LoginView: React.FC<LoginViewProps> = ({
  settings,
  onLoginSuccess,
  onLoginSubmit,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brandName = settings?.name || 'مجموعه گیم‌نت نکسوس (NEXUS)';

  const doLogin = async (userToSubmit: string, passToSubmit: string) => {
    try {
      setLoading(true);
      setError(null);

      const targetUser = userToSubmit.trim();
      const targetPass = passToSubmit.trim();

      if (!targetUser) {
        setError('لطفا نام کاربری را وارد کنید.');
        return;
      }
      if (!targetPass) {
        setError('لطفا رمز عبور را وارد کنید.');
        return;
      }

      const user = await onLoginSubmit({
        username: targetUser,
        password: targetPass,
      });


      if (user) {
        onLoginSuccess(user);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'نام کاربری یا رمز عبور نامعتبر است.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(username, password);
  };

  return (
    <div className="min-h-screen bg-[#0B1325] flex items-center justify-center p-4 selection:bg-[#2596BE]/30 selection:text-white">
      {/* Background Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -right-20 w-96 h-96 bg-[#2596BE]/15 rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/4 -left-20 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl"></div>
      </div>

      <div className="w-full max-w-md bg-[#111C33]/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#2596BE] to-[#1E7E9E] flex items-center justify-center text-white mx-auto shadow-lg shadow-[#2596BE]/30">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-black text-white tracking-tight">
              {brandName}
            </h1>
            <p className="text-xs text-[#2596BE] font-bold mt-1">
              سامانه جامع مدیریت مالی و حسابداری
            </p>
          </div>
          <p className="text-xs text-slate-400">
            جهت ورود به پنل، اطلاعات کاربری خود را وارد کنید
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              نام کاربری (Username)
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="مثال: admin"
                autoFocus
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
              />
              <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              رمز عبور (Password)
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="رمز عبور را وارد کنید"
                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-700 bg-slate-900/80 text-white text-xs font-mono placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
              />
              <Lock className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1 text-slate-400 hover:text-white absolute left-3 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[#2596BE] hover:bg-[#1E7E9E] active:scale-[0.99] text-white font-bold text-xs sm:text-sm shadow-md shadow-[#2596BE]/25 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>ورود به سامانه</span>
          </button>
        </form>

        {/* Security Footer Notice */}
        <div className="pt-2 border-t border-slate-800/80 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span>سامانه مدیریت مالی و حسابداری امن</span>
        </div>
      </div>
    </div>
  );
};
