import React, { useState } from 'react';
import {
  Wallet,
  Building,
  CreditCard,
  ArrowRightLeft,
  PlusCircle,
  TrendingUp,
  TrendingDown,
  History,
  AlertCircle,
  X,
  Edit2,
  Trash2,
} from 'lucide-react';
import { Account, AccountType, Transaction } from '../types/index.ts';
import { formatJalaliReadable, formatToman, getJalaliDateString, normalizeDigits, parseTomanInput } from '../utils/jalali.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';




interface AccountsViewProps {
  accounts: Account[];
  transactions: Transaction[];
  onTransfer: (data: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description?: string;
    date: string;
    jalaliDate: string;
  }) => Promise<unknown>;
  onCreateAccount: (data: Partial<Account>) => Promise<unknown>;
  onUpdateAccount: (id: string, data: Partial<Account>) => Promise<unknown>;
  onDeleteAccount: (id: string) => Promise<unknown>;
  onRefresh: () => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  accounts,
  transactions,
  onTransfer,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onRefresh,
}) => {
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isNewAccountOpen, setIsNewAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [selectedAccountForStatement, setSelectedAccountForStatement] = useState<Account | null>(null);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Lock body scroll when any modal in AccountsView is open
  useLockBodyScroll(
    isTransferOpen ||
    isNewAccountOpen ||
    editingAccount !== null ||
    selectedAccountForStatement !== null ||
    accountToDelete !== null
  );


  // Transfer Form State
  const [fromAccId, setFromAccId] = useState(accounts[0]?.id || '');
  const [toAccId, setToAccId] = useState(accounts[1]?.id || '');
  const [transferAmountRaw, setTransferAmountRaw] = useState('');
  const [transferDesc, setTransferDesc] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // New & Edit Account Form State
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<AccountType>('pos');
  const [accBank, setAccBank] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accBalRaw, setAccBalRaw] = useState('');
  const [accDesc, setAccDesc] = useState('');
  const [accIsDefault, setAccIsDefault] = useState(false);
  const [accLoading, setAccLoading] = useState(false);
  const [accError, setAccError] = useState<string | null>(null);

  const totalCash = accounts
    .filter((a) => a.type === 'cash')
    .reduce((sum, a) => sum + a.balance, 0);

  const totalBankAndPos = accounts
    .filter((a) => a.type !== 'cash')
    .reduce((sum, a) => sum + a.balance, 0);

  const fromAccount = accounts.find((a) => a.id === fromAccId);
  const toAccount = accounts.find((a) => a.id === toAccId);

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseTomanInput(transferAmountRaw);
    if (amount <= 0) {
      setTransferError('مبلغ انتقال را وارد کنید.');
      return;
    }
    if (fromAccId === toAccId) {
      setTransferError('حساب مبدا و مقصد نمی‌توانند یکسان باشند.');
      return;
    }
    if (fromAccount && fromAccount.balance < amount) {
      setTransferError(`موجودی حساب مبدا (${formatToman(fromAccount.balance)} تومان) کافی نیست.`);
      return;
    }

    try {
      setTransferLoading(true);
      setTransferError(null);
      await onTransfer({
        fromAccountId: fromAccId,
        toAccountId: toAccId,
        amount,
        description: transferDesc.trim() || `انتقال داخلی از ${fromAccount?.name} به ${toAccount?.name}`,
        date: new Date().toISOString(),
        jalaliDate: getJalaliDateString(),
      });
      setIsTransferOpen(false);
      setTransferAmountRaw('');
      setTransferDesc('');
      onRefresh();
    } catch (err: unknown) {
      setTransferError(err instanceof Error ? err.message : 'خطا در ثبت انتقال');
    } finally {
      setTransferLoading(false);
    }
  };

  const handleOpenEdit = (acc: Account) => {
    setEditingAccount(acc);
    setAccName(acc.name);
    setAccType(acc.type);
    setAccBank(acc.bankName || '');
    setAccNumber(acc.accountNumber || '');
    setAccBalRaw(acc.balance.toString());
    setAccDesc(acc.description || '');
    setAccIsDefault(!!acc.isDefault);
    setAccError(null);
  };

  const handleOpenCreate = () => {
    setEditingAccount(null);
    setAccName('');
    setAccType('pos');
    setAccBank('');
    setAccNumber('');
    setAccBalRaw('');
    setAccDesc('');
    setAccIsDefault(false);
    setAccError(null);
    setIsNewAccountOpen(true);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) {
      setAccError('نام حساب الزامی است.');
      return;
    }
    try {
      setAccLoading(true);
      setAccError(null);
      const payload = {
        name: accName.trim(),
        type: accType,
        bankName: accBank.trim() || undefined,
        accountNumber: accNumber.trim() || undefined,
        balance: parseTomanInput(accBalRaw),
        description: accDesc.trim() || undefined,
        isDefault: accIsDefault,
      };

      if (editingAccount) {
        await onUpdateAccount(editingAccount.id, payload);
        setEditingAccount(null);
      } else {
        await onCreateAccount(payload);
        setIsNewAccountOpen(false);
      }
      onRefresh();
    } catch (err: unknown) {
      setAccError(err instanceof Error ? err.message : 'خطا در ذخیره حساب');
    } finally {
      setAccLoading(false);
    }
  };

  const handleDelete = (acc: Account) => {
    setAccountToDelete(acc);
  };

  const handleConfirmDelete = async () => {
    if (!accountToDelete) return;
    try {
      setDeleteLoading(true);
      await onDeleteAccount(accountToDelete.id);
      setAccountToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const statementTransactions = selectedAccountForStatement
    ? transactions.filter(
        (t) => t.fromAccountId === selectedAccountForStatement.id || t.toAccountId === selectedAccountForStatement.id
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            مدیریت حساب‌ها، صندوق دخل و کارتخوان‌ها
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            گردش و کنترل نقدینگی، کارتخوان‌های بانکی و انتقال بین حساب‌ها
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsTransferOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 bg-[#2596BE] text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#1E7E9E] transition-all cursor-pointer shadow-xs"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>انتقال وجه داخلی</span>
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-700"
          >
            <PlusCircle className="w-4 h-4" />
            <span>افتتاح حساب جدید</span>
          </button>
        </div>
      </div>

      {/* Aggregate Overview Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">مجموع موجودی نقد دخل</span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {formatToman(totalCash)} تومان
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">موجودی کارتخوان‌ها و بانک‌ها</span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {formatToman(totalBankAndPos)} تومان
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">کل دارایی نقد و بانک گیم‌نت</span>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatToman(totalCash + totalBankAndPos)} تومان
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {accounts.map((acc) => {
          return (
            <div
              key={acc.id}
              className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4 hover:border-[#2596BE]/50 transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {acc.type === 'cash' ? (
                        <Wallet className="w-4 h-4 text-amber-500" />
                      ) : acc.type === 'pos' ? (
                        <CreditCard className="w-4 h-4 text-[#2596BE]" />
                      ) : (
                        <Building className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                        {acc.name}
                      </h3>
                      <span className="text-[11px] text-slate-400">
                        {acc.type === 'cash'
                          ? 'صندوق نقدی دخل'
                          : acc.type === 'pos'
                          ? 'دستگاه کارتخوان (POS)'
                          : 'حساب جاری بانکی'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEdit(acc)}
                      className="p-1 rounded-lg text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="ویرایش حساب"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {accounts.length > 1 && (
                      <button
                        onClick={() => handleDelete(acc)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        title="حذف حساب"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {acc.accountNumber && (
                  <div className="text-xs text-slate-500 font-mono flex items-center justify-between pt-1">
                    <span>شماره کارت / حساب:</span>
                    <span className="font-bold">{acc.accountNumber}</span>
                  </div>
                )}
                {acc.bankName && (
                  <div className="text-xs text-slate-500 flex items-center justify-between">
                    <span>بانک عامل:</span>
                    <span>{acc.bankName}</span>
                  </div>
                )}
                {acc.description && (
                  <p className="text-xs text-slate-400 line-clamp-1 pt-0.5">{acc.description}</p>
                )}
              </div>

              {/* Balance Box */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-500">موجودی فعلی:</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                    {formatToman(acc.balance)}
                    <span className="text-xs font-normal text-slate-400 mr-1">تومان</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-3 pt-2">
                  <button
                    onClick={() => setSelectedAccountForStatement(acc)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#2596BE] hover:bg-[#2596BE]/10 transition-colors cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    <span>گردش حساب</span>
                  </button>
                  <button
                    onClick={() => {
                      setFromAccId(acc.id);
                      setIsTransferOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>انتقال</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Internal Transfer Modal */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-[#2596BE]" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  انتقال وجه بین حساب‌ها
                </h2>
              </div>
              <button
                onClick={() => setIsTransferOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="p-5 space-y-4">
              {transferError && (
                <div className="p-3 text-xs rounded-xl bg-red-50 text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{transferError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  از حساب (مبدا)
                </label>
                <select
                  value={fromAccId}
                  onChange={(e) => setFromAccId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
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
                  به حساب (مقصد)
                </label>
                <select
                  value={toAccId}
                  onChange={(e) => setToAccId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
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
                  مبلغ انتقال (تومان)
                </label>
                <input
                  type="text"
                  value={transferAmountRaw ? Number(transferAmountRaw).toLocaleString('en-US') : ''}
                  onChange={(e) => setTransferAmountRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  placeholder="مبلغ را وارد کنید"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  شرح و بابت انتقال
                </label>
                <input
                  type="text"
                  value={transferDesc}
                  onChange={(e) => setTransferDesc(e.target.value)}
                  placeholder="مثال: واریز نقدینگی دخل به حساب بانکی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTransferOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={transferLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {transferLoading ? 'در حال ثبت...' : 'ثبت انتقال وجه'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create or Edit Account */}
      {(isNewAccountOpen || editingAccount) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingAccount ? `ویرایش ${editingAccount.name}` : 'افزودن حساب جدید'}
              </h2>
              <button
                onClick={() => {
                  setIsNewAccountOpen(false);
                  setEditingAccount(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="p-5 space-y-3.5">
              {accError && (
                <div className="p-3 text-xs rounded-xl bg-red-50 text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>{accError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام حساب یا صندوق
                </label>
                <input
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="مثال: کارتخوان ملت یا صندوق بوفه"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نوع حساب
                </label>
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value as AccountType)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                >
                  <option value="pos">دستگاه کارتخوان (POS)</option>
                  <option value="cash">صندوق نقدی دخل</option>
                  <option value="bank">حساب بانکی</option>
                </select>
              </div>

              {accType !== 'cash' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      نام بانک
                    </label>
                    <input
                      type="text"
                      value={accBank}
                      onChange={(e) => setAccBank(e.target.value)}
                      placeholder="سامان، ملی..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      شماره حساب یا کارت
                    </label>
                    <input
                      type="text"
                      value={accNumber}
                      onChange={(e) => setAccNumber(e.target.value)}
                      placeholder="شماره کارت"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  موجودی (تومان)
                </label>
                <input
                  type="text"
                  value={accBalRaw ? Number(accBalRaw).toLocaleString('en-US') : ''}
                  onChange={(e) => setAccBalRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  توضیحات
                </label>
                <input
                  type="text"
                  value={accDesc}
                  onChange={(e) => setAccDesc(e.target.value)}
                  placeholder="توضیحات اختیاری"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="accDefaultCheck"
                  checked={accIsDefault}
                  onChange={(e) => setAccIsDefault(e.target.checked)}
                  className="rounded text-[#2596BE]"
                />
                <label htmlFor="accDefaultCheck" className="text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  حساب پیش‌فرض این نوع
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewAccountOpen(false);
                    setEditingAccount(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={accLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {accLoading ? 'در حال ثبت...' : 'ذخیره حساب'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Statement Drawer / Modal */}
      {selectedAccountForStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  ریز گردش {selectedAccountForStatement.name}
                </h3>
                <span className="text-xs text-slate-500">
                  موجودی فعلی: {formatToman(selectedAccountForStatement.balance)} تومان
                </span>
              </div>
              <button
                onClick={() => setSelectedAccountForStatement(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1">
              {statementTransactions.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-10">
                  گردش و تراکنشی برای این حساب ثبت نشده است.
                </p>
              ) : (
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2 px-3">تاریخ</th>
                      <th className="py-2 px-3">نوع</th>
                      <th className="py-2 px-3">شرح</th>
                      <th className="py-2 px-3">مبلغ (تومان)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {statementTransactions.map((tx) => {
                      const isIncoming = tx.toAccountId === selectedAccountForStatement.id;
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="py-2 px-3 font-mono text-[11px] text-slate-500">
                            {formatJalaliReadable(tx.date, true)}
                          </td>
                          <td className="py-2 px-3 font-medium">
                            {isIncoming ? (
                              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <TrendingUp className="w-3.5 h-3.5" />
                                واریز / درآمد
                              </span>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                                <TrendingDown className="w-3.5 h-3.5" />
                                برداشت / هزینه
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-800 dark:text-slate-200 truncate max-w-xs">
                            {tx.description}
                          </td>
                          <td className="py-2 px-3 font-bold tabular-nums">
                            <span className={isIncoming ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {isIncoming ? '+' : '-'}{formatToman(tx.amount)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedAccountForStatement(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Account Deletion */}
      <ConfirmModal
        isOpen={!!accountToDelete}
        title="حذف حساب بانکی یا صندوق"
        message={`آیا مطمئن هستید که می‌خواهید حساب "${accountToDelete?.name}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onClose={() => setAccountToDelete(null)}
      />
    </div>
  );
};
