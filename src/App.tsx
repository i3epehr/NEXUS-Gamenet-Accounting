import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api.ts';
import {
  Account,
  AuditLog,
  Category,
  DashboardStats,
  GameNetSettings,
  GamingServiceItem,
  OpenTab,
  PayrollRecord,
  Person,
  Product,
  Reservation,
  Staff,
  Transaction,
  User,
} from './types/index.ts';
import { Sidebar, ActiveTab } from './components/Sidebar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { OpenTabsView } from './components/OpenTabsView.tsx';
import { TransactionsView } from './components/TransactionsView.tsx';
import { AccountsView } from './components/AccountsView.tsx';
import { BuffetView } from './components/BuffetView.tsx';
import { ContactsView } from './components/ContactsView.tsx';
import { StaffView } from './components/StaffView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { UnifiedSalesModal } from './components/UnifiedSalesModal.tsx';
import { ReceiptModal } from './components/ReceiptModal.tsx';
import { LoginView } from './components/LoginView.tsx';
import {
  Loader2,
  AlertCircle,
  RefreshCw,
  Menu,
  Sparkles,
  Sun,
  Moon,
  Calendar,
  Clock,
} from 'lucide-react';
import { formatJalaliReadable, getJalaliDateString } from './utils/jalali.ts';
import { useLockBodyScroll } from './utils/useLockBodyScroll.ts';

export default function App() {
  const [activeTab, setActiveTabState] = useState<ActiveTab>(() => {
    try {
      const saved = localStorage.getItem('nexus_active_tab');
      if (
        saved &&
        [
          'dashboard',
          'tabs',
          'transactions',
          'accounts',
          'buffet',
          'contacts',
          'staff',
          'reports',
          'settings',
        ].includes(saved)
      ) {
        return saved as ActiveTab;
      }
    } catch {
      // ignore
    }
    return 'tabs';
  });

  const setActiveTab = (tab: ActiveTab) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('nexus_active_tab', tab);
    } catch {
      // ignore
    }
  };
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('nexus_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  });

  // Sidebar states (Collapsible right sidebar)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('nexus_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const handleToggleSidebarCollapse = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    try {
      localStorage.setItem('nexus_sidebar_collapsed', collapsed ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  // Core Data States
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [gamingServices, setGamingServices] = useState<GamingServiceItem[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [settings, setSettings] = useState<GameNetSettings>({
    name: 'مجموعه بازی‌های نکسوس (NEXUS Arena)',
    phone: '021-88990011',
    address: 'تهران، خیابان شریعتی، مجتمع ورزشی تفریحی نکسوس',
    receiptFooter: 'از حضور و بازی شما سپاسگزاریم | اینستاگرام: @nexus.gamenet',
    currency: 'toman',
    theme: 'dark',
    buffetCategories: [
      'نوشیدنی خنک',
      'کافه گرم',
      'تنقلات و اسنک',
      'فست‌فود و غذا',
      'شکلات و بیسکویت',
      'سایر خوراکی‌ها',
    ],
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modals & UI Controls
  const [isUnifiedSalesOpen, setIsUnifiedSalesOpen] = useState(false);
  const [receiptModalTx, setReceiptModalTx] = useState<Transaction | null>(null);
  const [isUserLoginOpen, setIsUserLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Lock background page scrolling whenever any modal is open
  useLockBodyScroll(
    isUnifiedSalesOpen ||
    receiptModalTx !== null ||
    isUserLoginOpen
  );

  // Loading & error state
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync theme with document class and attributes
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
    try {
      localStorage.setItem('nexus_theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Sync document title with game net name
  useEffect(() => {
    if (settings?.name) {
      document.title = `${settings.name} | سامانه حسابداری`;
    }
  }, [settings?.name]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + N for Unified Sales Modal
      if (e.altKey && (e.key === 'n' || e.key === 'N' || e.key === 'د')) {
        e.preventDefault();
        setIsUnifiedSalesOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Fetch all core data
  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [
        dashData,
        accData,
        txData,
        catData,
        buffetData,
        contactData,
        staffData,
        settingsData,
        auditData,
        tabsData,
        resvData,
        usersData,
        userData,
        gamingData,
      ] = await Promise.all([
        api.getDashboard().catch(() => null),
        api.getAccounts().catch(() => ({ accounts: [] })),
        api.getTransactions().catch(() => ({ transactions: [] })),
        api.getCategories().catch(() => ({ categories: [] })),
        api.getBuffet().catch(() => ({ products: [], inventoryLogs: [], gamingServices: [] })),
        api.getContacts().catch(() => ({ persons: [] })),
        api.getStaff().catch(() => ({ staff: [], payrollRecords: [] })),
        api.getSettings().catch(() => ({ settings: null })),
        api.getAuditLogs().catch(() => ({ auditLogs: [] })),
        api.getTabs().catch(() => ({ tabs: [] })),
        api.getReservations().catch(() => ({ reservations: [] })),
        api.getUsers().catch(() => ({ users: [] })),
        api.getCurrentUser().catch(() => ({ user: null })),
        api.getGamingServices().catch(() => ({ services: [] })),
      ]);

      if (dashData) setStats(dashData);
      setAccounts(accData.accounts || []);
      setTransactions(txData.transactions || []);
      setCategories(catData.categories || []);
      setProducts(buffetData.products || []);
      setGamingServices(
        gamingData?.services && gamingData.services.length > 0
          ? gamingData.services
          : buffetData?.gamingServices || []
      );
      setInventoryLogs(buffetData.inventoryLogs || []);
      setPersons(contactData.persons || []);
      setStaff(staffData.staff || []);
      setPayrollRecords(staffData.payrollRecords || []);
      if (settingsData?.settings) setSettings(settingsData.settings);
      setAuditLogs(auditData.auditLogs || []);
      if (tabsData.tabs) setOpenTabs(tabsData.tabs);
      if (resvData.reservations) setReservations(resvData.reservations);
      if (usersData.users) setUsers(usersData.users);
      if (userData.user) setUser(userData.user);
    } catch (err: unknown) {
      console.error('Data fetch error:', err);
      setError(err instanceof Error ? err.message : 'خطا در بارگذاری اطلاعات');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Background worker: Periodically check if any reservations have arrived at their scheduled time
    const resvTimer = setInterval(async () => {
      try {
        const now = new Date();
        const clientJalaliDate = getJalaliDateString(now);
        const hh = now.getHours().toString().padStart(2, '0');
        const mm = now.getMinutes().toString().padStart(2, '0');
        const clientTime = `${hh}:${mm}`;
        const res = await api.checkAutoOpenReservations(clientJalaliDate, clientTime);
        if (res && res.openedCount > 0) {
          fetchData();
        }
      } catch {
        // ignore background poll errors
      }
    }, 15000);

    return () => clearInterval(resvTimer);
  }, [fetchData]);

  // Unified Sales & Expense Instant Checkout Handler
  const handleUnifiedInstantCheckout = async (data: {
    type?: 'income' | 'expense';
    items?: {
      productId?: string;
      name: string;
      quantity: number;
      unitPrice?: number;
      totalPrice?: number;
      isBuffet?: boolean;
    }[];
    amount?: number;
    accountId?: string;
    personId?: string;
    description?: string;
    categoryId?: string;
    customerName?: string;
    customerPhone?: string;
    date: string;
    jalaliDate: string;
    paymentMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
    walletAmount?: number;
    cashOrPosAmount?: number;
    tableOption?: 'none' | 'new' | 'existing';
    tableTitle?: string;
    existingTabId?: string;
  }) => {
    if (data.type === 'expense') {
      const tx = await api.createTransaction({
        type: 'expense',
        amount: data.amount || 0,
        accountId: data.accountId,
        personId: data.personId,
        categoryId: data.categoryId,
        description: data.description || 'هزینه متفرقه',
        date: data.date,
        jalaliDate: data.jalaliDate,
      });
      return { transaction: tx };
    }

    const res = await api.checkoutUnified({
      cart: (data.items || []).map((it) => ({
        productId: it.productId,
        name: it.name,
        quantity: it.quantity,
        unitPrice: it.unitPrice || 0,
        totalPrice: it.totalPrice || (it.unitPrice || 0) * it.quantity,
        isBuffet: it.isBuffet,
      })),
      tableOption: data.tableOption,
      tableTitle: data.tableTitle,
      existingTabId: data.existingTabId,
      amount: data.amount || 0,
      accountId: data.accountId,
      personId: data.personId,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      paymentMethod: data.paymentMethod,
      walletAmount: data.walletAmount,
      cashOrPosAmount: data.cashOrPosAmount,
      description: data.description,
      categoryId: data.categoryId,
      date: data.date,
      jalaliDate: data.jalaliDate,
    });
    if (res.persons) {
      setPersons(res.persons);
    }
    return res;
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    try {
      localStorage.removeItem('nexus_active_tab');
    } catch {
      // ignore
    }
    setActiveTabState('tabs');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginUsername.trim()) {
      setLoginError('نام کاربری را وارد کنید.');
      return;
    }
    try {
      setLoginLoading(true);
      setLoginError(null);
      const res = await api.login({ username: loginUsername.trim(), password: loginPassword });
      setUser(res.user);
      setIsUserLoginOpen(false);
      const savedTab = localStorage.getItem('nexus_active_tab') as ActiveTab | null;
      if (savedTab) {
        setActiveTabState(savedTab);
      } else {
        setActiveTab('tabs');
      }
      setLoginUsername('');
      setLoginPassword('');
      fetchData();
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'نام کاربری یا رمز عبور نامعتبر است.');
    } finally {
      setLoginLoading(false);
    }
  };

  const openTabsCount = openTabs.filter((t) => t.status === 'open').length;

  const tabTitles: Record<ActiveTab, string> = {
    dashboard: 'داشبورد مدیریتی',
    tabs: 'میزها و حساب‌های باز',
    transactions: 'دفتر کل تراکنش‌ها',
    accounts: 'صندوق و حساب‌ها',
    buffet: 'کالاها، خدمات بازی و انبار',
    contacts: 'اشخاص و نسیه',
    staff: 'پرسنل و حقوق',
    reports: 'گزارشات مالی و سود/زیان',
    settings: 'تنظیمات و دسترسی‌ها',
  };

  // Dedicated Login Screen Gate: user must log in to access accounting system
  if (isLoading && !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-3 text-white">
        <Loader2 className="w-8 h-8 text-[#2596BE] animate-spin" />
        <span className="text-sm font-semibold text-slate-400">در حال بارگذاری سامانه...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        settings={settings}
        users={users}
        onLoginSubmit={async (creds) => {
          const res = await api.login(creds);
          return res.user;
        }}
        onLoginSuccess={(loggedUser) => {
          setUser(loggedUser);
          const savedTab = localStorage.getItem('nexus_active_tab') as ActiveTab | null;
          if (savedTab) {
            setActiveTabState(savedTab);
          } else {
            setActiveTab('tabs');
          }
          fetchData();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1325] text-slate-900 dark:text-slate-100 flex transition-colors selection:bg-[#2596BE]/20 selection:text-[#2596BE]">
      {/* 1. Collapsible Right Sidebar Navigation (in RTL, first flex child is on the right) */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSalesModal={() => setIsUnifiedSalesOpen(true)}
        user={user}
        settings={settings}
        onOpenUserSwitch={() => setIsUserLoginOpen(true)}
        onLogout={handleLogout}
        theme={theme}
        setTheme={setTheme}
        openTabsCount={openTabsCount}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={handleToggleSidebarCollapse}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#0B1325]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors h-16 flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile Hamburger Menu Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="باز کردن منو"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                {tabTitles[activeTab]}
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <Calendar className="w-3 h-3 text-[#2596BE]" />
                <span>{formatJalaliReadable(new Date(), false)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Quick Action CTA: Unified Sales */}
            <button
              type="button"
              onClick={() => setIsUnifiedSalesOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#2596BE] hover:bg-[#1E7E9E] active:scale-[0.98] text-white font-bold text-xs sm:text-sm shadow-sm transition-all cursor-pointer whitespace-nowrap"
              title="ثبت سریع فروش، درآمد و فاکتور"
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>ثبت سریع</span>
            </button>

            {/* Theme Toggle (Quick) */}
            <button
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title={theme === 'dark' ? 'حالت روشن' : 'حالت تیره'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* User Indicator / Switcher */}
            {user && (
              <button
                type="button"
                onClick={() => setIsUserLoginOpen(true)}
                className="hidden sm:flex items-center gap-2 pr-2.5 pl-1.5 py-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 hover:border-[#2596BE]/60 text-xs transition-colors cursor-pointer"
                title={`کاربر جاری: ${user.fullName} (${user.role}) - کلیک جهت تغییر کاربر`}
              >
                <span className="text-slate-700 dark:text-slate-300 font-bold max-w-[110px] truncate">
                  {user.fullName}
                </span>
                <div className="w-6 h-6 rounded-lg bg-[#2596BE]/20 text-[#2596BE] flex items-center justify-center font-bold text-xs">
                  {user.fullName.charAt(0)}
                </div>
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 max-w-[1600px] w-full mx-auto p-4 sm:p-6 lg:p-7">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                onClick={fetchData}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>تلاش مجدد</span>
              </button>
            </div>
          )}

          {isLoading && !stats ? (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#2596BE]" />
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                در حال فراخوانی پایگاه داده حسابداری {settings?.name || 'نکسوس'}...
              </p>
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <DashboardView
                  stats={stats}
                  accounts={accounts}
                  settings={settings}
                  onOpenTransfer={() => setActiveTab('accounts')}
                  onViewReceipt={(tx) => setReceiptModalTx(tx)}
                  onNavigateTab={(tab) => setActiveTab(tab)}
                  onRefresh={fetchData}
                  isLoading={isLoading}
                />
              )}

              {activeTab === 'tabs' && (
                <OpenTabsView
                  tabs={openTabs}
                  products={products}
                  persons={persons}
                  accounts={accounts}
                  reservations={reservations}
                  gamingServices={gamingServices}
                  onCreateTab={api.createTab}
                  onUpdateTab={api.updateTab}
                  onAddItem={api.addItemToTab}
                  onRemoveItem={api.removeItemFromTab}
                  onUpdateItemQuantity={api.updateTabItemQuantity}
                  onCheckoutTab={api.checkoutTab}
                  onDeleteTab={api.deleteTab}
                  onReopenTab={api.reopenTab}
                  onCreateReservation={api.createReservation}
                  onUpdateReservation={api.updateReservation}
                  onDeleteReservation={api.deleteReservation}
                  onConvertToTab={api.convertReservationToTab}
                  onViewReceipt={(tx) => setReceiptModalTx(tx)}
                  onRefresh={fetchData}
                />
              )}

              {activeTab === 'transactions' && (
                <TransactionsView
                  transactions={transactions}
                  accounts={accounts}
                  categories={categories}
                  persons={persons}
                  onOpenQuickEntry={() => setIsUnifiedSalesOpen(true)}
                  onViewReceipt={(tx) => setReceiptModalTx(tx)}
                  onUpdateTransaction={api.updateTransaction}
                  onDeleteTransaction={async (id) => {
                    await api.deleteTransaction(id);
                  }}
                  onRefresh={fetchData}
                />
              )}

              {activeTab === 'accounts' && (
                <AccountsView
                  accounts={accounts}
                  transactions={transactions}
                  onTransfer={api.transferFunds}
                  onCreateAccount={api.createAccount}
                  onUpdateAccount={api.updateAccount}
                  onDeleteAccount={api.deleteAccount}
                  onRefresh={fetchData}
                />
              )}

              {activeTab === 'buffet' && (
                <BuffetView
                  products={products}
                  inventoryLogs={inventoryLogs}
                  accounts={accounts}
                  persons={persons}
                  openTabs={openTabs}
                  buffetCategories={settings.buffetCategories}
                  gamingServices={gamingServices}
                  onUpdateBuffetCategories={async (newCats) => {
                    await api.updateSettings({ buffetCategories: newCats });
                  }}
                  onSellBuffet={api.sellBuffet}
                  onRestock={api.restockProduct}
                  onWaste={api.wasteProduct}
                  onCreateProduct={api.createProduct}
                  onUpdateProduct={api.updateProduct}
                  onDeleteProduct={api.deleteProduct}
                  onCreateGamingService={api.createGamingService}
                  onUpdateGamingService={api.updateGamingService}
                  onDeleteGamingService={api.deleteGamingService}
                  onAddItemToTab={api.addItemToTab}
                  onOpenUnifiedSales={() => setIsUnifiedSalesOpen(true)}
                  onViewReceipt={(tx) => setReceiptModalTx(tx)}
                  onRefresh={fetchData}
                />
              )}

              {activeTab === 'contacts' && (
                <ContactsView
                  persons={persons}
                  accounts={accounts}
                  transactions={transactions}
                  openTabs={openTabs}
                  settings={settings}
                  onSettle={api.settleContact}
                  onManageWallet={api.manageWallet}
                  onCreateContact={api.createContact}
                  onUpdateContact={api.updateContact}
                  onDeleteContact={api.deleteContact}
                  onRefresh={fetchData}
                />
              )}

              {activeTab === 'staff' && (
                <StaffView
                  staff={staff}
                  payrollRecords={payrollRecords}
                  accounts={accounts}
                  users={users}
                  onOpenUserSwitch={() => setIsUserLoginOpen(true)}
                  onPayStaff={api.payStaff}
                  onCreateStaff={api.createStaff}
                  onUpdateStaff={api.updateStaff}
                  onDeleteStaff={api.deleteStaff}
                  onRefresh={fetchData}
                />
              )}

              {activeTab === 'reports' && (
                <ReportsView
                  transactions={transactions}
                  settings={settings}
                />
              )}


              {activeTab === 'settings' && (
                <SettingsView
                  settings={settings}
                  categories={categories}
                  auditLogs={auditLogs}
                  currentUser={user}
                  users={users}
                  onCreateUser={api.createUser}
                  onUpdateUser={api.updateUser}
                  onDeleteUser={api.deleteUser}
                  onUpdateSettings={api.updateSettings}
                  onCreateCategory={api.createCategory}
                  onUpdateCategory={api.updateCategory}
                  onDeleteCategory={api.deleteCategory}
                  onRestoreBackup={api.restoreBackup}
                  onResetData={api.resetData}
                  onRefresh={fetchData}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Global Unified Income, Buffet/Gaming Sales & Expense Modal */}
      <UnifiedSalesModal
        isOpen={isUnifiedSalesOpen}
        onClose={() => setIsUnifiedSalesOpen(false)}
        products={products}
        accounts={accounts}
        categories={categories}
        persons={persons}
        openTabs={openTabs}
        settings={settings}
        gamingServices={gamingServices}
        onInstantCheckout={handleUnifiedInstantCheckout}
        onAddItemToTab={api.addItemToTab}
        onCreateTab={api.createTab}
        onViewReceipt={(tx) => setReceiptModalTx(tx)}
        onRefresh={fetchData}
        onNavigateToTabs={() => setActiveTabState('tabs')}
      />

      {/* Global Thermal Receipt Preview & Print Modal */}
      <ReceiptModal
        isOpen={!!receiptModalTx}
        onClose={() => setReceiptModalTx(null)}
        transaction={receiptModalTx}
        settings={settings}
      />


      {/* User Login & Switch Account Modal */}
      {isUserLoginOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overscroll-contain animate-in fade-in">

          <div className="w-full max-w-sm bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                تغییر یا ورود به حساب کاربر
              </h3>
              <button
                type="button"
                onClick={() => setIsUserLoginOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 text-xs font-semibold">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام کاربری (Username)
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="مثال: admin یا operator"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  رمز عبور (Password)
                </label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="رمز عبور"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                />
              </div>


              <div className="pt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsUserLoginOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={loginLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {loginLoading ? 'در حال ورود...' : 'ورود به حساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
