import React from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  Wallet,
  Coffee,
  Users2,
  UserCheck,
  BarChart3,
  Settings,
  Sun,
  Moon,
  Gamepad2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  X,
  LogOut,
  Lock,
} from 'lucide-react';
import { GameNetSettings, User } from '../types/index.ts';

export type ActiveTab =
  | 'dashboard'
  | 'tabs'
  | 'transactions'
  | 'accounts'
  | 'buffet'
  | 'contacts'
  | 'staff'
  | 'reports'
  | 'settings';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onOpenSalesModal: () => void;
  user: User | null;
  settings?: GameNetSettings;
  onOpenUserSwitch?: () => void;
  onLogout?: () => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  openTabsCount?: number;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isMobileOpen: boolean;
  setIsMobileOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  onOpenSalesModal,
  user,
  settings,
  onOpenUserSwitch,
  onLogout,
  theme,
  setTheme,
  openTabsCount = 0,
  isCollapsed,
  setIsCollapsed,
  isMobileOpen,
  setIsMobileOpen,
}) => {
  const brandName = settings?.name || 'سامانه حسابداری نکسوس';

  const hasPermission = (tabId: ActiveTab): boolean => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const perms = user.permissions || [];
    if (perms.includes('all')) return true;

    switch (tabId) {
      case 'dashboard':
        return perms.includes('view_dashboard');
      case 'tabs':
        return perms.includes('manage_tabs');
      case 'buffet':
        return perms.includes('manage_buffet');
      case 'contacts':
        return perms.includes('manage_contacts');
      case 'settings':
        return perms.includes('manage_settings') || perms.includes('manage_users');
      case 'reports':
        return perms.includes('view_reports');
      case 'staff':
        return perms.includes('manage_staff');
      case 'accounts':
        return perms.includes('manage_accounts');
      case 'transactions':
        return perms.includes('manage_transactions') || perms.includes('delete_transactions') || perms.includes('view_reports');
      default:
        return true;
    }
  };

  const navItems: { id: ActiveTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'داشبورد مدیریتی', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> },
    {
      id: 'tabs',
      label: 'میزها و حساب‌های باز',
      icon: <Gamepad2 className="w-5 h-5 shrink-0" />,
      badge: openTabsCount > 0 ? openTabsCount : undefined,
    },
    { id: 'transactions', label: 'دفتر تراکنش‌ها', icon: <ReceiptText className="w-5 h-5 shrink-0" /> },
    { id: 'accounts', label: 'صندوق و حساب‌ها', icon: <Wallet className="w-5 h-5 shrink-0" /> },
    { id: 'buffet', label: 'کالاها، خدمات و انبار', icon: <Coffee className="w-5 h-5 shrink-0" /> },
    { id: 'contacts', label: 'اشخاص و نسیه', icon: <Users2 className="w-5 h-5 shrink-0" /> },
    { id: 'staff', label: 'پرسنل و حقوق', icon: <UserCheck className="w-5 h-5 shrink-0" /> },
    { id: 'reports', label: 'گزارشات و سود/زیان', icon: <BarChart3 className="w-5 h-5 shrink-0" /> },
    { id: 'settings', label: 'تنظیمات و دسترسی‌ها', icon: <Settings className="w-5 h-5 shrink-0" /> },
  ];

  const handleNavClick = (tabId: ActiveTab) => {
    if (!hasPermission(tabId)) {
      return;
    }
    setActiveTab(tabId);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full select-none">
      {/* Brand & Collapse Header */}
      <div
        className={`p-3.5 border-b border-slate-200 dark:border-slate-800/80 flex items-center transition-all ${
          isCollapsed ? 'flex-col gap-2 justify-center items-center' : 'justify-between'
        }`}
      >
        {!isCollapsed ? (
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2596BE] to-[#1E7E9E] flex items-center justify-center text-white shadow-md shadow-[#2596BE]/25 shrink-0">
              <Gamepad2 className="w-5 h-5 shrink-0" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-black tracking-tight text-slate-900 dark:text-white truncate" title={brandName}>
                {brandName}
              </span>
              <span className="text-[10px] text-[#2596BE] font-bold truncate">
                مدیریت مالی و حسابداری
              </span>
            </div>
          </div>
        ) : (
          <div
            className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2596BE] to-[#1E7E9E] flex items-center justify-center text-white shadow-md shadow-[#2596BE]/25 shrink-0"
            title={`${brandName} - سامانه حسابداری`}
          >
            <Gamepad2 className="w-5 h-5 shrink-0" />
          </div>
        )}

        {/* Desktop Collapse Toggle Button */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? 'گسترش منو' : 'جمع کردن منو'}
          className={`hidden lg:flex p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 ${
            isCollapsed ? 'mt-1' : ''
          }`}
        >
          {isCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Mobile Close Drawer Button */}
        <button
          type="button"
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Action Button (Unified Sales & Income) */}
      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onOpenSalesModal();
            if (isMobileOpen) setIsMobileOpen(false);
          }}
          className={`w-full py-2.5 rounded-xl bg-[#2596BE] hover:bg-[#1E7E9E] active:scale-[0.98] text-white font-bold transition-all shadow-md shadow-[#2596BE]/25 cursor-pointer flex items-center justify-center gap-2 ${
            isCollapsed ? 'px-2' : 'px-4'
          }`}
          title="ثبت سریع فروش و درآمد"
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="text-xs sm:text-sm whitespace-nowrap">ثبت سریع</span>}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-1.5 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const allowed = hasPermission(item.id);

          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              disabled={!allowed}
              title={
                !allowed
                  ? `${item.label} (عدم دسترسی کاربری)`
                  : isCollapsed
                  ? item.label
                  : undefined
              }
              className={`w-full flex items-center rounded-xl transition-all relative ${
                isCollapsed ? 'justify-center p-3' : 'justify-between px-3.5 py-2.5 text-xs sm:text-sm'
              } ${
                !allowed
                  ? 'opacity-35 grayscale cursor-not-allowed hover:opacity-40 text-slate-400 dark:text-slate-600'
                  : isActive
                  ? 'bg-[#2596BE] text-white font-bold shadow-sm cursor-pointer'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60 font-medium cursor-pointer'
              }`}
            >
              <div className="flex items-center gap-3">
                {item.icon}
                {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </div>

              {/* Status indicators */}
              <div className="flex items-center gap-1.5">
                {!allowed && (
                  <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                )}
                {/* Badge for open tabs */}
                {allowed && item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                      isCollapsed
                        ? 'absolute -top-1 -left-1 bg-amber-500 text-white'
                        : isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-500 text-white shadow-xs'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer Section: Theme Switch & Profile & Logout */}
      <div className="p-3 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
        {/* Theme Toggle */}
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={`w-full flex items-center rounded-xl transition-colors cursor-pointer text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 ${
            isCollapsed ? 'justify-center p-2.5' : 'justify-between px-3 py-2 text-xs font-semibold'
          }`}
          title={theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}
        >
          <div className="flex items-center gap-2.5">
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
            {!isCollapsed && <span>{theme === 'dark' ? 'پوسته روشن' : 'پوسته تاریک'}</span>}
          </div>
          {!isCollapsed && (
            <span className="text-[10px] text-slate-400 font-mono">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </span>
          )}
        </button>

        {/* User Card & Logout Button */}
        {user && (
          <div className="space-y-1.5">
            <div
              className={`w-full flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-2 text-right ${
                isCollapsed ? 'justify-center' : 'justify-between'
              }`}
            >
              <div
                onClick={onOpenUserSwitch}
                className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1"
                title={`تغییر حساب یا کاربر (${user.fullName})`}
              >
                <div className="w-7 h-7 rounded-lg bg-[#2596BE]/20 text-[#2596BE] flex items-center justify-center font-bold text-xs shrink-0">
                  {user.fullName.charAt(0)}
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                      {user.fullName}
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate font-medium">
                      {user.role === 'admin'
                        ? 'مدیر کل (ادمین)'
                        : user.role === 'accountant'
                        ? 'حسابدار'
                        : 'اپراتور'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Logout Action Button */}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className={`w-full flex items-center rounded-xl border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer text-xs font-bold ${
                  isCollapsed ? 'justify-center p-2.5' : 'justify-center gap-2 py-2 px-3'
                }`}
                title="خروج از حساب"
              >
                <LogOut className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span>خروج از سامانه</span>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Right Sidebar */}
      <aside
        className={`hidden lg:flex flex-col shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-[#0B1325]/95 backdrop-blur-md transition-all duration-200 ease-in-out z-30 sticky top-0 h-screen ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          {/* Backdrop blur */}
          <div
            onClick={() => setIsMobileOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in"
          />
          {/* Drawer anchored strictly to the RIGHT edge in RTL */}
          <div className="fixed top-0 bottom-0 right-0 w-72 max-w-[85vw] bg-white dark:bg-[#0B1325] border-l border-slate-200 dark:border-slate-800 shadow-2xl z-10 animate-in slide-in-from-right duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
