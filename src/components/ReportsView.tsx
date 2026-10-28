import React, { useState, useMemo } from 'react';
import {
  FileSpreadsheet,
  Calendar,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Printer,
  X,
  FileCheck,
  Search,
} from 'lucide-react';
import { GameNetSettings, Transaction } from '../types/index.ts';
import {
  formatJalaliReadable,
  formatToman,
  getDateRangeBounds,
  getJalaliDateString,
  getJalaliDayBounds,
  parseJalaliDate,
  addJalaliDays,
} from '../utils/jalali.ts';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';

interface ReportsViewProps {
  transactions: Transaction[];
  settings: GameNetSettings;
}

export type RangePresetType =
  | 'today'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

export const ReportsView: React.FC<ReportsViewProps> = ({ transactions, settings }) => {

  const [rangePreset, setRangePreset] = useState<RangePresetType>('month');
  const [customMode, setCustomMode] = useState<'day' | 'range'>('day');
  const [selectedDayStr, setSelectedDayStr] = useState<string>(() => getJalaliDateString());
  const [customFromStr, setCustomFromStr] = useState<string>(() => getJalaliDateString(new Date(Date.now() - 7 * 86400000)));
  const [customToStr, setCustomToStr] = useState<string>(() => getJalaliDateString());
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [tablePage, setTablePage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(12);

  useLockBodyScroll(isReportModalOpen);

  // Compute active bounds
  const { from, to, periodLabel } = useMemo(() => {
    const now = new Date();
    if (rangePreset === 'custom') {
      if (customMode === 'day') {
        const bounds = getJalaliDayBounds(selectedDayStr);
        const parsed = parseJalaliDate(selectedDayStr);
        const label = parsed ? `روز ${formatJalaliReadable(parsed)}` : `روز ${selectedDayStr}`;
        if (bounds) {
          return { from: bounds.from, to: bounds.to, periodLabel: label };
        }
        return { from: new Date(0), to: now, periodLabel: label };
      } else {
        const fromD = parseJalaliDate(customFromStr) || new Date(0);
        const toD = parseJalaliDate(customToStr) || now;
        fromD.setHours(0, 0, 0, 0);
        toD.setHours(23, 59, 59, 999);
        return {
          from: fromD,
          to: toD,
          periodLabel: `از ${customFromStr} تا ${customToStr}`,
        };
      }
    }

    const { from, to } = getDateRangeBounds(rangePreset);
    const labels: Record<string, string> = {
      today: 'امروز',
      week: 'هفته جاری',
      month: 'ماه جاری',
      year: 'سال جاری',
    };
    return { from, to, periodLabel: labels[rangePreset] || rangePreset };
  }, [rangePreset, customMode, selectedDayStr, customFromStr, customToStr]);

  // Filter transactions within range
  const filteredTx = useMemo(() => {
    return transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= from && d <= to;
    });
  }, [transactions, from, to]);

  // Filter searched transactions within range
  const searchedTx = useMemo(() => {
    if (!searchTerm.trim()) return filteredTx;
    const q = searchTerm.trim().toLowerCase();
    return filteredTx.filter((t) => {
      return (
        t.id.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        (t.categoryName && t.categoryName.toLowerCase().includes(q)) ||
        (t.toAccountName && t.toAccountName.toLowerCase().includes(q)) ||
        (t.fromAccountName && t.fromAccountName.toLowerCase().includes(q)) ||
        String(t.amount).includes(q)
      );
    });
  }, [filteredTx, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(searchedTx.length / pageSize));
  const paginatedTx = useMemo(() => {
    const start = (tablePage - 1) * pageSize;
    return searchedTx.slice(start, start + pageSize);
  }, [searchedTx, tablePage, pageSize]);

  // Financial aggregates
  const { totalIncome, totalExpense, netProfit, incomeByCat, expenseByCat } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    const incMap: Record<string, number> = {};
    const expMap: Record<string, number> = {};

    filteredTx.forEach((t) => {
      if (t.type === 'income') {
        inc += t.amount;
        const name = t.categoryName || 'درآمد متفرقه';
        incMap[name] = (incMap[name] || 0) + t.amount;
      } else if (t.type === 'expense') {
        exp += t.amount;
        const name = t.categoryName || 'هزینه متفرقه';
        expMap[name] = (expMap[name] || 0) + t.amount;
      }
    });

    return {
      totalIncome: inc,
      totalExpense: exp,
      netProfit: inc - exp,
      incomeByCat: Object.entries(incMap).map(([name, amount]) => ({
        name,
        amount,
        percentage: inc > 0 ? Math.round((amount / inc) * 100) : 0,
      })),
      expenseByCat: Object.entries(expMap).map(([name, amount]) => ({
        name,
        amount,
        percentage: exp > 0 ? Math.round((amount / exp) * 100) : 0,
      })),
    };
  }, [filteredTx]);

  // Export to Excel / CSV with Persian UTF-8 BOM
  const handleExportCSV = () => {
    const headers = ['کد تراکنش', 'نوع', 'دسته‌بندی', 'شرح', 'مبلغ (تومان)', 'صندوق/حساب', 'تاریخ'];
    const rows = filteredTx.map((t) => [
      t.id.replace('tx_', ''),
      t.type === 'income' ? 'درآمد' : t.type === 'expense' ? 'هزینه' : 'سایر',
      t.categoryName || '-',
      `"${(t.description || '').replace(/"/g, '""')}"`,
      t.amount,
      t.toAccountName || t.fromAccountName || '-',
      formatJalaliReadable(t.date, true),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const sanitizedName = (settings.name || 'GameNet').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
    link.setAttribute('download', `${sanitizedName}_Report_${rangePreset}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            گزارشات مالی، تراز آزمایشی و سود/زیان
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تجزیه و تحلیل درآمدها و هزینه‌ها در دوره‌های زمانی مشخص
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>خروجی اکسل (CSV)</span>
          </button>

          <button
            onClick={() => setIsReportModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>پیش‌نمایش و چاپ گزارش رسمی</span>
          </button>
        </div>
      </div>

      {/* Date Range Selector Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 no-print">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-[#2596BE]" />
            <span>بازه زمانی گزارش:</span>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
            {[
              { id: 'today', label: 'امروز' },
              { id: 'week', label: 'هفته جاری' },
              { id: 'month', label: 'ماه جاری' },
              { id: 'year', label: 'سال جاری' },
              { id: 'custom', label: 'انتخاب دلخواه تاریخ' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setRangePreset(tab.id as RangePresetType)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  rangePreset === tab.id
                    ? 'bg-[#2596BE] text-white font-bold shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Day / Custom Range Toolbar */}
        {rangePreset === 'custom' && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/40 p-3.5 rounded-xl">
            {/* Toggle between Single Day and Date Range */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-[#2596BE] flex items-center gap-1.5 whitespace-nowrap">
                <Clock className="w-4 h-4" />
                <span>حالت انتخابی:</span>
              </span>
              <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setCustomMode('day')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                    customMode === 'day'
                      ? 'bg-[#2596BE] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  یک روز خاص
                </button>
                <button
                  type="button"
                  onClick={() => setCustomMode('range')}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer transition-colors ${
                    customMode === 'range'
                      ? 'bg-[#2596BE] text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  بازه تاریخ (از - تا)
                </button>
              </div>
            </div>

            {/* Custom Day Picker */}
            {customMode === 'day' ? (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedDayStr((prev) => addJalaliDays(prev, -1))}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:border-[#2596BE] transition-colors cursor-pointer flex items-center gap-1"
                  title="روز قبل"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>روز قبل</span>
                </button>
                <input
                  type="text"
                  value={selectedDayStr}
                  onChange={(e) => setSelectedDayStr(e.target.value)}
                  placeholder="1404/07/21"
                  className="w-28 text-center px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
                />
                <button
                  type="button"
                  onClick={() => setSelectedDayStr((prev) => addJalaliDays(prev, 1))}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:border-[#2596BE] transition-colors cursor-pointer flex items-center gap-1"
                  title="روز بعد"
                >
                  <span>روز بعد</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDayStr(getJalaliDateString())}
                  className="px-2.5 py-1.5 rounded-lg bg-[#2596BE]/15 text-[#2596BE] text-xs font-bold hover:bg-[#2596BE]/25 transition-colors cursor-pointer"
                >
                  امروز
                </button>
              </div>
            ) : (
              /* Custom Range Picker */
              <div className="flex items-center gap-2 text-xs flex-wrap sm:flex-nowrap justify-end">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">از:</span>
                  <input
                    type="text"
                    value={customFromStr}
                    onChange={(e) => setCustomFromStr(e.target.value)}
                    placeholder="1404/07/01"
                    className="w-24 text-center px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">تا:</span>
                  <input
                    type="text"
                    value={customToStr}
                    onChange={(e) => setCustomToStr(e.target.value)}
                    placeholder="1404/07/30"
                    className="w-24 text-center px-2 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Screen Report Overview Cards */}
      <div className="space-y-6 no-print">
        {/* Key Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">مجموع درآمد دوره</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums block">
              {formatToman(totalIncome)}
              <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
            </span>
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">مجموع هزینه‌های دوره</span>
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums block">
              {formatToman(totalExpense)}
              <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
            </span>
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
            <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">سود خالص عملیاتی</span>
            <span className={`text-2xl font-black tabular-nums block ${
              netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {formatToman(netProfit)}
              <span className="text-xs font-normal text-slate-400 mr-1.5">تومان</span>
            </span>
          </div>
        </div>

        {/* Breakdown Columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Income Breakdown */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                <span>تفکیک درآمدهای دوره</span>
              </h3>
              <span className="text-xs font-bold tabular-nums text-emerald-600">
                مجموع: {formatToman(totalIncome)} تومان
              </span>
            </div>
            {incomeByCat.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">درآمدی در این بازه ثبت نشده است.</p>
            ) : (
              <div className="space-y-3">
                {incomeByCat.map((cat, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{cat.name}</span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatToman(cat.amount)} تومان ({cat.percentage}٪)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expense Breakdown */}
          <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-rose-600" />
                <span>تفکیک هزینه‌های دوره</span>
              </h3>
              <span className="text-xs font-bold tabular-nums text-rose-600">
                مجموع: {formatToman(totalExpense)} تومان
              </span>
            </div>
            {expenseByCat.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">هزینه‌ای در این بازه ثبت نشده است.</p>
            ) : (
              <div className="space-y-3">
                {expenseByCat.map((cat, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{cat.name}</span>
                      <span className="font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatToman(cat.amount)} تومان ({cat.percentage}٪)
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(cat.percentage, 100)}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detailed Transactions in Period Table (Ledger-style Pagination, No Up/Down Inner Scroll) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                دفتر گردش تراکنش‌ها
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[#2596BE]/10 text-[#2596BE] text-xs font-bold">
                {searchedTx.length} سند
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {/* Quick search input */}
              <div className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setTablePage(1);
                  }}
                  placeholder="جستجو در شرح، حساب، کد..."
                  className="w-full pl-3 pr-8 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>

              {/* Page size selector */}
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setTablePage(1);
                }}
                className="px-2 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 cursor-pointer font-medium"
              >
                <option value={10}>۱۰ در صفحه</option>
                <option value={12}>۱۲ در صفحه</option>
                <option value={20}>۲۰ در صفحه</option>
                <option value={50}>۵۰ در صفحه</option>
              </select>
            </div>
          </div>

          {/* Clean Ledger Table without any vertical scrollbar */}
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/90 text-slate-500 font-bold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-3">کد</th>
                  <th className="py-3 px-3">نوع</th>
                  <th className="py-3 px-3">سرفصل</th>
                  <th className="py-3 px-3">شرح سند</th>
                  <th className="py-3 px-3">مبلغ (تومان)</th>
                  <th className="py-3 px-3">حساب</th>
                  <th className="py-3 px-3">تاریخ و ساعت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedTx.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-xs text-slate-400">
                      هیچ تراکنشی مطابق با فیلتر یافت نشد.
                    </td>
                  </tr>
                ) : (
                  paginatedTx.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                        {t.id.replace('tx_', '#')}
                      </td>
                      <td className="py-3 px-3 font-semibold">
                        {t.type === 'income' ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">درآمد</span>
                        ) : t.type === 'expense' ? (
                          <span className="text-rose-600 dark:text-rose-400 font-bold">هزینه</span>
                        ) : (
                          <span className="text-blue-600 dark:text-blue-400 font-bold">انتقال</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-medium">{t.categoryName || '-'}</td>
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200 max-w-sm truncate">{t.description}</td>
                      <td className="py-3 px-3 font-bold tabular-nums text-slate-900 dark:text-white">
                        {formatToman(t.amount)}
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300">{t.toAccountName || t.fromAccountName || '-'}</td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                        {formatJalaliReadable(t.date, false)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Ledger Pagination - Notebook Style like TransactionsView */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400 font-medium">
              صفحه {tablePage} از {totalPages} (نمایش ردیف {(tablePage - 1) * pageSize + 1} تا {Math.min(tablePage * pageSize, searchedTx.length)} از {searchedTx.length} سند)
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                disabled={tablePage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors font-medium shadow-xs"
              >
                <ChevronRight className="w-4 h-4" />
                <span>صفحه قبل</span>
              </button>

              <div className="flex items-center gap-1 px-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (totalPages > 5 && tablePage > 3) {
                    pageNum = tablePage - 3 + i;
                    if (pageNum > totalPages) pageNum = totalPages - (4 - i);
                  }
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setTablePage(pageNum)}
                      className={`w-8 h-8 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center ${
                        tablePage === pageNum
                          ? 'bg-[#2596BE] text-white shadow-xs'
                          : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                disabled={tablePage >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors font-medium shadow-xs"
              >
                <span>صفحه بعد</span>
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Official Report Modal with Direct Print Capability */}
      {isReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-xs no-print">
          <div className="w-full max-w-4xl bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2596BE]/15 text-[#2596BE] flex items-center justify-center">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    پیش‌نمایش سند رسمی گزارش مالی و سود و زیان
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    دوره انتخابی: {periodLabel} | {settings.name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="px-4 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>چاپ فیزیکی یا PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: A4 Paper Preview */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-200 dark:bg-slate-950 flex justify-center">
              <div
                id="official-report-printable"
                className="w-full max-w-2xl bg-white text-slate-900 p-8 sm:p-10 rounded-xl shadow-lg border border-slate-300 font-sans space-y-6"
              >
                {/* Official Letterhead */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">
                      {settings.name || 'مجموعه بازی‌های نکسوس'}
                    </h2>
                    <p className="text-xs text-slate-700 mt-1 font-bold">
                      گزارش رسمی عملکرد مالی، گردش وجوه و سود و زیان
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {settings.address} — تلفن: {settings.phone}
                    </p>
                  </div>
                  <div className="text-left text-xs space-y-1 font-mono text-slate-600">
                    <div>تاریخ صدور: {getJalaliDateString()}</div>
                    <div>دوره گزارش: {periodLabel}</div>
                    <div className="text-[10px] text-slate-400">سیستم نکسوس آرنا</div>
                  </div>
                </div>

                {/* Key Balances Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl border border-emerald-300 bg-emerald-50 text-center">
                    <span className="text-[11px] text-emerald-800 font-bold block">مجموع درآمد دوره:</span>
                    <span className="text-base font-black text-emerald-700 tabular-nums">
                      {formatToman(totalIncome)} تومان
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-rose-300 bg-rose-50 text-center">
                    <span className="text-[11px] text-rose-800 font-bold block">مجموع هزینه‌های دوره:</span>
                    <span className="text-base font-black text-rose-700 tabular-nums">
                      {formatToman(totalExpense)} تومان
                    </span>
                  </div>
                  <div className="p-3.5 rounded-xl border border-blue-300 bg-blue-50 text-center">
                    <span className="text-[11px] text-blue-800 font-bold block">سود خالص عملیاتی:</span>
                    <span className="text-base font-black text-blue-800 tabular-nums">
                      {formatToman(netProfit)} تومان
                    </span>
                  </div>
                </div>

                {/* Category Summaries */}
                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <h4 className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2">
                      تفکیک سرفصل‌های درآمدی
                    </h4>
                    <div className="space-y-1.5 text-slate-700">
                      {incomeByCat.length === 0 ? (
                        <div className="text-slate-400 text-[11px]">بدون ثبت درآمد</div>
                      ) : (
                        incomeByCat.map((cat, i) => (
                          <div key={i} className="flex justify-between py-0.5 border-b border-slate-100">
                            <span>{cat.name}:</span>
                            <span className="font-bold tabular-nums font-mono">{formatToman(cat.amount)} تومان</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 border-b border-slate-300 pb-1 mb-2">
                      تفکیک سرفصل‌های هزینه
                    </h4>
                    <div className="space-y-1.5 text-slate-700">
                      {expenseByCat.length === 0 ? (
                        <div className="text-slate-400 text-[11px]">بدون ثبت هزینه</div>
                      ) : (
                        expenseByCat.map((cat, i) => (
                          <div key={i} className="flex justify-between py-0.5 border-b border-slate-100">
                            <span>{cat.name}:</span>
                            <span className="font-bold tabular-nums font-mono">{formatToman(cat.amount)} تومان</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Transactions Table Snippet */}
                <div>
                  <h4 className="font-bold text-xs text-slate-800 border-b border-slate-300 pb-1 mb-2">
                    ریز گردش تراکنش‌های دوره ({filteredTx.length} گردش ثبت‌شده)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b-2 border-slate-300 bg-slate-100 text-slate-700 font-bold">
                          <th className="py-1.5 px-2">نوع</th>
                          <th className="py-1.5 px-2">شرح تراکنش</th>
                          <th className="py-1.5 px-2">مبلغ (تومان)</th>
                          <th className="py-1.5 px-2">تاریخ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredTx.slice(0, 25).map((t) => (
                          <tr key={t.id}>
                            <td className="py-1 px-2 font-bold">
                              {t.type === 'income' ? (
                                <span className="text-emerald-700">درآمد</span>
                              ) : (
                                <span className="text-rose-700">هزینه</span>
                              )}
                            </td>
                            <td className="py-1 px-2 truncate max-w-xs">{t.description}</td>
                            <td className="py-1 px-2 font-bold tabular-nums font-mono">
                              {formatToman(t.amount)}
                            </td>
                            <td className="py-1 px-2 font-mono text-slate-600">
                              {formatJalaliReadable(t.date, false)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Official Signatures & Seal */}
                <div className="pt-8 border-t-2 border-slate-400 grid grid-cols-2 text-center text-xs text-slate-700">
                  <div className="space-y-10">
                    <span className="font-bold">امضا و تایید امور مالی و حسابداری</span>
                    <div className="text-slate-400">محل امضا و مهر: .........................</div>
                  </div>
                  <div className="space-y-10">
                    <span className="font-bold">امضا و تایید مدیریت مجموعه</span>
                    <div className="text-slate-400">محل امضا و مهر: .........................</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
