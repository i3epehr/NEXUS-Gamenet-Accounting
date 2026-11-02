import React, { useState, useMemo } from 'react';
import {
  Search,
  Printer,
  Trash2,
  Edit2,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react';
import { Account, Category, Person, Transaction, TransactionType } from '../types/index.ts';
import { formatJalaliReadable, formatToman, normalizeDigits, parseTomanInput } from '../utils/jalali.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';
import { SearchablePersonSelect } from './SearchablePersonSelect.tsx';

interface TransactionsViewProps {
  transactions: Transaction[];
  accounts: Account[];
  categories: Category[];
  persons: Person[];
  onOpenQuickEntry: () => void;
  onViewReceipt: (tx: Transaction) => void;
  onUpdateTransaction: (id: string, data: Partial<Transaction> & { accountId?: string }) => Promise<unknown>;
  onDeleteTransaction: (id: string) => Promise<void>;
  onRefresh: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  accounts,
  categories,
  persons,
  onViewReceipt,
  onUpdateTransaction,
  onDeleteTransaction,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Edit Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmountRaw, setEditAmountRaw] = useState('');
  const [editType, setEditType] = useState<TransactionType>('income');
  const [editAccountId, setEditAccountId] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editPersonId, setEditPersonId] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editJalaliDate, setEditJalaliDate] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete Modal State
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Lock body scroll when editing or deleting modal is open
  useLockBodyScroll(editingTx !== null || txToDelete !== null);


  // Filtered and sorted transactions
  const filteredTransactions = useMemo(() => {
    return transactions
      .filter((tx) => {
        if (selectedType !== 'all' && tx.type !== selectedType) return false;
        if (selectedAccountId !== 'all') {
          if (tx.fromAccountId !== selectedAccountId && tx.toAccountId !== selectedAccountId) {
            return false;
          }
        }
        if (selectedCategoryId !== 'all' && tx.categoryId !== selectedCategoryId) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase().trim();
          const matchesDesc = tx.description?.toLowerCase().includes(q);
          const matchesCat = tx.categoryName?.toLowerCase().includes(q);
          const matchesPerson = tx.personName?.toLowerCase().includes(q);
          const matchesFrom = tx.fromAccountName?.toLowerCase().includes(q);
          const matchesTo = tx.toAccountName?.toLowerCase().includes(q);
          if (!matchesDesc && !matchesCat && !matchesPerson && !matchesFrom && !matchesTo) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date-desc') return new Date(b.date).getTime() - new Date(a.date).getTime();
        if (sortBy === 'date-asc') return new Date(a.date).getTime() - new Date(b.date).getTime();
        if (sortBy === 'amount-desc') return b.amount - a.amount;
        if (sortBy === 'amount-asc') return a.amount - b.amount;
        return 0;
      });
  }, [transactions, selectedType, selectedAccountId, selectedCategoryId, search, sortBy]);

  // Aggregate sums of filtered view
  const totals = useMemo(() => {
    let inc = 0;
    let exp = 0;
    filteredTransactions.forEach((tx) => {
      if (tx.type === 'income' || tx.type === 'receivable_collection') inc += tx.amount;
      if (tx.type === 'expense' || tx.type === 'debt_settlement') exp += tx.amount;
    });
    return { income: inc, expense: exp, net: inc - exp };
  }, [filteredTransactions]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleDelete = (tx: Transaction) => {
    setTxToDelete(tx);
  };

  const handleConfirmDelete = async () => {
    if (!txToDelete) return;
    try {
      setDeleteLoading(true);
      await onDeleteTransaction(txToDelete.id);
      setTxToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditAmountRaw(tx.amount.toString());
    setEditType(tx.type);
    setEditAccountId(tx.toAccountId || tx.fromAccountId || accounts[0]?.id || '');
    setEditCategoryId(tx.categoryId || '');
    setEditPersonId(tx.personId || '');
    setEditDescription(tx.description || '');
    setEditJalaliDate(tx.jalaliDate || '');
    setEditError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    const amount = parseTomanInput(editAmountRaw);
    if (amount <= 0) {
      setEditError('مبلغ نامعتبر است.');
      return;
    }
    try {
      setEditLoading(true);
      setEditError(null);
      await onUpdateTransaction(editingTx.id, {
        amount,
        type: editType,
        accountId: editAccountId,
        categoryId: editCategoryId || undefined,
        personId: editPersonId || undefined,
        description: editDescription.trim(),
        jalaliDate: editJalaliDate.trim(),
      });
      setEditingTx(null);
      onRefresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'خطا در ویرایش تراکنش');
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header - Note: Redundant 'ثبت تراکنش جدید' button removed as requested */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            دفتر کل و ریز گردش تراکنش‌ها
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            ثبت، ویرایش، حذف و گزارش‌گیری تراکنش‌های مالی گیم‌نت (ثبت سریع از دکمه ناوبار انجام می‌شود)
          </p>
        </div>
      </div>

      {/* Filter Toolbar Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search box */}
          <div className="lg:col-span-2 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="جستجو در شرح، شخص، دسته‌بندی..."
              className="w-full pl-4 pr-9 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>

          {/* Type filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
            >
              <option value="all">همه انواع تراکنش‌ها</option>
              <option value="income">درآمدها (ورودی)</option>
              <option value="expense">هزینه‌ها (خروجی)</option>
              <option value="transfer">انتقالات داخلی</option>
              <option value="receivable_collection">وصول مطالبات</option>
              <option value="debt_settlement">تسویه بدهی</option>
            </select>
          </div>

          {/* Account filter */}
          <div>
            <select
              value={selectedAccountId}
              onChange={(e) => {
                setSelectedAccountId(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
            >
              <option value="all">همه صندوق‌ها و حساب‌ها</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort selector */}
          <div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-[#2596BE]"
            >
              <option value="date-desc">جدیدترین تاریخ</option>
              <option value="date-asc">قدیمی‌ترین تاریخ</option>
              <option value="amount-desc">بیشترین مبلغ</option>
              <option value="amount-asc">کمترین مبلغ</option>
            </select>
          </div>
        </div>

        {/* Filter Summary Strip */}
        <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs">
          <div className="flex items-center gap-4 text-slate-500">
            <span>
              تعداد نمایش: <strong className="text-slate-800 dark:text-slate-200 tabular-nums">{filteredTransactions.length}</strong>
            </span>
            <span aria-hidden="true">•</span>
            <span>
              مجموع ورودی: <strong className="text-emerald-600 dark:text-emerald-400 tabular-nums">{formatToman(totals.income)}</strong>
            </span>
            <span aria-hidden="true">•</span>
            <span>
              مجموع خروجی: <strong className="text-rose-600 dark:text-rose-400 tabular-nums">{formatToman(totals.expense)}</strong>
            </span>
          </div>
          {(search || selectedType !== 'all' || selectedAccountId !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedType('all');
                setSelectedAccountId('all');
                setSelectedCategoryId('all');
              }}
              className="text-[#2596BE] hover:underline cursor-pointer font-medium"
            >
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                <th className="py-3 px-4">کد</th>
                <th className="py-3 px-4">نوع</th>
                <th className="py-3 px-4">دسته‌بندی</th>
                <th className="py-3 px-4">شرح تراکنش</th>
                <th className="py-3 px-4">صندوق / حساب</th>
                <th className="py-3 px-4">طرف حساب</th>
                <th className="py-3 px-4">مبلغ (تومان)</th>
                <th className="py-3 px-4">تاریخ</th>
                <th className="py-3 px-4 text-left">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <span>تراکنشی با مشخصات فیلتر شده یافت نشد.</span>
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                      {tx.id.replace('tx_', '#')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {tx.type === 'income' && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                          <ArrowDownLeft className="w-3.5 h-3.5" />
                          درآمد
                        </span>
                      )}
                      {tx.type === 'expense' && (
                        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          هزینه
                        </span>
                      )}
                      {tx.type === 'transfer' && (
                        <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold">
                          <RefreshCw className="w-3.5 h-3.5" />
                          انتقال
                        </span>
                      )}
                      {tx.type === 'receivable_collection' && (
                        <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                          وصول طلب
                        </span>
                      )}
                      {tx.type === 'debt_settlement' && (
                        <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-bold">
                          پرداخت بدهی
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tx.categoryName || '-'}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200 block truncate" title={tx.description}>
                        {tx.description}
                      </span>
                      {tx.receiptItems && tx.receiptItems.length > 0 && (
                        <span className="text-[10px] text-slate-400 block truncate">
                          اقلام: {tx.receiptItems.map((i) => `${i.productName} (${i.quantity})`).join(' + ')}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tx.type === 'transfer' ? (
                        <span className="text-[11px] block">
                          از {tx.fromAccountName} به {tx.toAccountName}
                        </span>
                      ) : (
                        tx.toAccountName || tx.fromAccountName || '-'
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {tx.personName || '-'}
                    </td>
                    <td className="py-3 px-4 font-black tabular-nums whitespace-nowrap text-sm">
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
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                      {formatJalaliReadable(tx.date, true)}
                    </td>
                    <td className="py-3 px-4 text-left whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEdit(tx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="ویرایش تراکنش"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onViewReceipt(tx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          title="چاپ فیش"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(tx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                          title="حذف تراکنش"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-xs">
            <span className="text-slate-500">
              صفحه {currentPage} از {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Edit Transaction */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-[#2596BE]" />
                <span>ویرایش تراکنش {editingTx.id.replace('tx_', '#')}</span>
              </h2>
              <button
                onClick={() => setEditingTx(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              {/* Type and Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    نوع تراکنش
                  </label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as TransactionType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold"
                  >
                    <option value="income">درآمد (ورودی)</option>
                    <option value="expense">هزینه (خروجی)</option>
                    <option value="receivable_collection">وصول طلب</option>
                    <option value="debt_settlement">پرداخت بدهی</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مبلغ (تومان)
                  </label>
                  <input
                    type="text"
                    value={editAmountRaw ? Number(editAmountRaw).toLocaleString('en-US') : ''}
                    onChange={(e) => setEditAmountRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold tabular-nums"
                  />
                </div>
              </div>

              {/* Account and Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    صندوق یا حساب
                  </label>
                  <select
                    value={editAccountId}
                    onChange={(e) => setEditAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    دسته‌بندی
                  </label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    <option value="">بدون دسته‌بندی</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({cat.type === 'income' ? 'درآمد' : 'هزینه'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Person and Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <SearchablePersonSelect
                    persons={persons}
                    selectedPersonId={editPersonId}
                    onSelectPerson={(person) => setEditPersonId(person ? person.id : '')}
                    label="مشتری"
                    placeholder="جستجوی نام یا شماره تماس..."
                    emptyLabel="بدون مشتری"
                    showBalanceBadge={true}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    تاریخ شمسی
                  </label>
                  <input
                    type="text"
                    value={editJalaliDate}
                    onChange={(e) => setEditJalaliDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  شرح و بابت
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {editLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال ذخیره...</span>
                    </>
                  ) : (
                    <span>ذخیره تغییرات</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Transaction Deletion */}
      <ConfirmModal
        isOpen={!!txToDelete}
        title="حذف تراکنش از دفتر مالی"
        message={`آیا مطمئن هستید که می‌خواهید تراکنش "${txToDelete?.description}" به مبلغ ${formatToman(txToDelete?.amount || 0)} تومان را حذف کنید؟ با حذف این تراکنش، موجودی صندوق و طرف حساب به حالت قبل بازگردانده می‌شود.`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onClose={() => setTxToDelete(null)}
      />
    </div>
  );
};
