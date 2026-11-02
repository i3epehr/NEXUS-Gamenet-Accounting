import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Coins,
  Wallet,
  Users2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Printer,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { Account, DashboardStats, GameNetSettings, Transaction } from '../types/index.ts';
import { formatJalaliReadable, formatToman } from '../utils/jalali.ts';

interface DashboardViewProps {
  stats: DashboardStats | null;
  accounts: Account[];
  settings: GameNetSettings;
  onOpenTransfer: () => void;
  onViewReceipt: (tx: Transaction) => void;
  onNavigateTab: (tab: 'transactions' | 'accounts' | 'buffet' | 'contacts' | 'reports') => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  accounts,
  settings,
  onOpenTransfer,
  onViewReceipt,
  onNavigateTab,
  onRefresh,
  isLoading,
}) => {
  if (!stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin text-[#2596BE]" />
          <span>در حال بارگذاری اطلاعات داشبورد...</span>
        </div>
      </div>
    );
  }

  // Find max value in trend for proportional SVG graph
  const maxTrendVal = Math.max(
    ...stats.trend.map((t) => Math.max(t.income, t.expense)),
    1000000
  );

  return (
    <div className="space-y-6">
      {/* Top Banner / Hero Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            داشبورد مدیریت {settings?.name || 'گیم‌نت نکسوس'}
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-1">
            <span>نمای زنده صندوق</span>
            <span aria-hidden="true">•</span>
            <span>گردش مالی دخل</span>
            <span aria-hidden="true">•</span>
            <span>{formatJalaliReadable(new Date())}</span>
          </div>
        </div>

        {/* Quick Action Strip */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onOpenTransfer}
            className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
          >
            <RefreshCw className="w-4 h-4 text-[#2596BE]" />
            <span>انتقال بین حساب‌ها</span>
          </button>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl text-xs hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="به‌روزرسانی داده‌ها"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#2596BE]' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Today's Income */}
        <div className="p-4.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>درآمد امروز</span>
            <span className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
            {formatToman(stats.todayIncome)}
            <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/50">
            <span>مجموع این ماه:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {formatToman(stats.monthIncome)} تومان
            </span>
          </div>
        </div>

        {/* Card 2: Today's Expense */}
        <div className="p-4.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>هزینه‌های امروز</span>
            <span className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
            {formatToman(stats.todayExpense)}
            <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/50">
            <span>مجموع این ماه:</span>
            <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
              {formatToman(stats.monthExpense)} تومان
            </span>
          </div>
        </div>

        {/* Card 3: Today's Operating Profit */}
        <div className="p-4.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>سود خالص امروز</span>
            <span className="p-1.5 rounded-lg bg-[#2596BE]/10 text-[#2596BE]">
              <Coins className="w-4 h-4" />
            </span>
          </div>
          <div className={`text-2xl font-black tabular-nums tracking-tight ${
            stats.todayProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
          }`}>
            {formatToman(stats.todayProfit)}
            <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/50">
            <span>سود ۳۰ روز اخیر:</span>
            <span className={`font-semibold tabular-nums ${
              stats.monthProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {formatToman(stats.monthProfit)} تومان
            </span>
          </div>
        </div>

        {/* Card 4: Liquid Balances (Cash + Bank) */}
        <div className="p-4.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800/80 shadow-xs space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>موجودی نقد و بانک‌ها</span>
            <span className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
            {formatToman(stats.cashBalance + stats.bankBalance)}
            <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/50">
            <span>صندوق دخل: {formatToman(stats.cashBalance)}</span>
            <span aria-hidden="true">•</span>
            <span>بانک و پوز: {formatToman(stats.bankBalance)}</span>
          </div>
        </div>
      </div>

      {/* Secondary Metric Bar: Debts & Receivables */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Receivables (Customer Credit Tabs) */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Users2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                مجموع مطالبات (نسیه و بدهی مشتریان)
              </span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {formatToman(stats.totalReceivables)} تومان
              </span>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('contacts')}
            className="flex items-center gap-1 text-xs font-semibold text-[#2596BE] hover:underline cursor-pointer"
          >
            <span>مشاهده اشخاص</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Payables (Debts to Suppliers) */}
        <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block">
                مجموع بدهی‌های ما (بستانکاری تامین‌کنندگان)
              </span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {formatToman(stats.totalPayables)} تومان
              </span>
            </div>
          </div>
          <button
            onClick={() => onNavigateTab('contacts')}
            className="flex items-center gap-1 text-xs font-semibold text-[#2596BE] hover:underline cursor-pointer"
          >
            <span>مشاهده اشخاص</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Split: Chart & Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Graph (2 Columns) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                روند گردش درآمد و هزینه (۷ روز اخیر)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مقایسه روزانه درآمدهای ورودی با هزینه‌ها
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>درآمد</span>
              </div>
              <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span>هزینه</span>
              </div>
            </div>
          </div>

          {/* SVG Bar Chart Visualization */}
          <div className="h-56 w-full flex items-end gap-3 sm:gap-6 pt-4 pb-2 border-b border-slate-100 dark:border-slate-800">
            {stats.trend.map((day, idx) => {
              const incomeHeight = maxTrendVal > 0 ? Math.min(Math.round((day.income / maxTrendVal) * 160), 160) : 4;
              const expenseHeight = maxTrendVal > 0 ? Math.min(Math.round((day.expense / maxTrendVal) * 160), 160) : 4;

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group relative">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-12 z-20 bg-slate-900 text-white text-[10px] rounded-lg p-2 pointer-events-none whitespace-nowrap shadow-lg">
                    <div>درآمد: {formatToman(day.income)} تومان</div>
                    <div>هزینه: {formatToman(day.expense)} تومان</div>
                    <div>سود: {formatToman(day.profit)} تومان</div>
                  </div>

                  {/* Dual Bars */}
                  <div className="w-full flex items-end justify-center gap-1.5">
                    <div
                      style={{ height: `${Math.max(incomeHeight, 6)}px` }}
                      className="w-3.5 sm:w-5 bg-emerald-500 hover:bg-emerald-400 rounded-t-sm transition-all"
                    ></div>
                    <div
                      style={{ height: `${Math.max(expenseHeight, 4)}px` }}
                      className="w-3.5 sm:w-5 bg-rose-500/80 hover:bg-rose-400 rounded-t-sm transition-all"
                    ></div>
                  </div>

                  <span className="text-[10px] text-slate-500 font-mono mt-2">
                    {day.jalaliDate}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Bottom Insights */}
          <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
            <span>تعداد میزهای فعال در حال حاضر: {stats.openTabsCount} میز</span>
            <button
              onClick={() => onNavigateTab('reports')}
              className="text-[#2596BE] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>مشاهده گزارش تفصیلی سود و زیان</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Category Breakdown (1 Column) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              سهم منابع درآمد این ماه
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تفکیک درآمدها بر اساس دسته‌بندی
            </p>
          </div>

          <div className="space-y-3">
            {stats.incomeByCategory.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">تراکنشی در این ماه ثبت نشده است.</p>
            ) : (
              stats.incomeByCategory.slice(0, 5).map((cat, idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{cat.name}</span>
                    <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                      {formatToman(cat.amount)} تومان ({cat.percentage}٪)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-[#2596BE] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Account Balances List */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60">
            <h3 className="text-xs font-semibold text-slate-500 mb-2">موجودی صندوق‌ها:</h3>
            <div className="space-y-2">
              {accounts.slice(0, 3).map((acc) => (
                <div key={acc.id} className="flex justify-between items-center text-xs">
                  <span className="text-slate-600 dark:text-slate-400 truncate max-w-[130px]">{acc.name}</span>
                  <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                    {formatToman(acc.balance)} تومان
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Transactions Table Preview */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              آخرین تراکنش‌های ثبت‌شده در دفتر
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ۱۰ گردش اخیر صندوق‌ها و کارتخوان‌ها
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('transactions')}
            className="flex items-center gap-1 text-xs font-semibold text-[#2596BE] hover:underline cursor-pointer"
          >
            <span>دفتر کل تراکنش‌ها</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <th className="py-2.5 px-3">نوع</th>
                <th className="py-2.5 px-3">شرح تراکنش</th>
                <th className="py-2.5 px-3">صندوق / حساب</th>
                <th className="py-2.5 px-3">مبلغ (تومان)</th>
                <th className="py-2.5 px-3">تاریخ و ساعت</th>
                <th className="py-2.5 px-3 text-left">فیش</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {stats.recentTransactions.slice(0, 6).map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3">
                    {tx.type === 'income' && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold">
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                        درآمد
                      </span>
                    )}
                    {tx.type === 'expense' && (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        هزینه
                      </span>
                    )}
                    {tx.type === 'transfer' && (
                      <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold">
                        <RefreshCw className="w-3.5 h-3.5" />
                        انتقال
                      </span>
                    )}
                    {tx.type === 'receivable_collection' && (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                        وصول طلب
                      </span>
                    )}
                    {tx.type === 'debt_settlement' && (
                      <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold">
                        پرداخت بدهی
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="font-medium text-slate-800 dark:text-slate-200 block truncate max-w-[220px]">
                      {tx.description}
                    </span>
                    {tx.categoryName && (
                      <span className="text-[10px] text-slate-400 block">{tx.categoryName}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                    {tx.type === 'transfer' ? (
                      <span className="text-[11px]">
                        از {tx.fromAccountName} به {tx.toAccountName}
                      </span>
                    ) : (
                      tx.toAccountName || tx.fromAccountName || '-'
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-bold tabular-nums">
                    <span className={
                      tx.type === 'income' || tx.type === 'receivable_collection'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : tx.type === 'expense' || tx.type === 'debt_settlement'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-700 dark:text-slate-300'
                    }>
                      {formatToman(tx.amount)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                    {formatJalaliReadable(tx.date, true)}
                  </td>
                  <td className="py-2.5 px-3 text-left">
                    <button
                      onClick={() => onViewReceipt(tx)}
                      className="p-1 rounded-md text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="چاپ فیش"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
