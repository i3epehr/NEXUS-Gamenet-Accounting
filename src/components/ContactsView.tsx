import React, { useState } from 'react';
import {
  Users2,
  PlusCircle,
  Search,
  CheckCircle2,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Phone,
  AlertCircle,
  Edit2,
  Trash2,
  Eye,
  Calendar,
  ShieldAlert,
  Clock,
  IdCard,
  Wallet,
  ArrowUpDown,
  LayoutGrid,
  List,
  Sparkles,
  RefreshCw,
  Coins,
  CreditCard,
  Loader2,
  Landmark,
  UserCheck,
  Receipt,
  Gamepad2,
  Check,
} from 'lucide-react';
import { Account, GameNetSettings, OpenTab, Person, PersonType, Transaction } from '../types/index.ts';
import { formatJalaliReadable, formatToman, getJalaliDateString, normalizeDigits, parseTomanInput, normalizeForSearch, cleanPhoneForSearch } from '../utils/jalali.ts';
import { getTransactionMeta, getPaymentMethodBadge } from '../utils/transactions.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';



interface ContactsViewProps {
  persons: Person[];
  accounts: Account[];
  transactions: Transaction[];
  openTabs: OpenTab[];
  settings?: GameNetSettings;
  onSettle: (
    id: string,
    data: {
      amount: number;
      actionType: 'collect' | 'pay';
      accountId: string;
      date: string;
      jalaliDate: string;
      description?: string;
    }
  ) => Promise<unknown>;
  onManageWallet?: (
    id: string,
    data: {
      action: 'charge' | 'deduct' | 'adjust';
      amount?: number;
      targetBalance?: number;
      accountId?: string;
      date?: string;
      jalaliDate?: string;
      description?: string;
    }
  ) => Promise<unknown>;
  onCreateContact: (data: Partial<Person>) => Promise<unknown>;
  onUpdateContact: (id: string, data: Partial<Person>) => Promise<unknown>;
  onDeleteContact: (id: string) => Promise<unknown>;
  onRefresh: () => void;
}

export const ContactsView: React.FC<ContactsViewProps> = ({
  persons,
  accounts,
  transactions,
  openTabs,
  settings,
  onSettle,
  onManageWallet,
  onCreateContact,
  onUpdateContact,
  onDeleteContact,
  onRefresh,
}) => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [financialFilter, setFinancialFilter] = useState<'all' | 'debtors' | 'creditors' | 'settled' | 'overdue'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const personTypesList = settings?.customPersonTypes && settings.customPersonTypes.length > 0
    ? settings.customPersonTypes
    : [
        { id: 'customer', label: 'مشتری و گیمر' },
        { id: 'supplier', label: 'تامین‌کننده بوفه' },
        { id: 'technician', label: 'تعمیرکار تجهیزات' },
        { id: 'partner', label: 'همکار / شریک' },
        { id: 'other', label: 'متفرقه' },
      ];

  // Modals
  const [walletModalPerson, setWalletModalPerson] = useState<Person | null>(null);
  const [walletTab, setWalletTab] = useState<'charge' | 'deduct' | 'adjust'>('charge');
  const [walletAmountRaw, setWalletAmountRaw] = useState('');
  const [walletTargetBalanceRaw, setWalletTargetBalanceRaw] = useState('');
  const [walletTargetType, setWalletTargetType] = useState<'credit' | 'debt' | 'zero'>('credit');
  const [walletAccountId, setWalletAccountId] = useState(accounts[0]?.id || '');
  const [walletDesc, setWalletDesc] = useState('');
  const [walletSyncAccount, setWalletSyncAccount] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [detailPerson, setDetailPerson] = useState<Person | null>(null);
  const [customerHistorySearch, setCustomerHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'income' | 'credit' | 'wallet' | 'collection'>('all');
  const [selectedHistoryTx, setSelectedHistoryTx] = useState<Transaction | null>(null);
  const [selectedHistoryTab, setSelectedHistoryTab] = useState<OpenTab | null>(null);
  const [editingPerson, setEditingPerson] = useState<Person | null>(null);
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);

  // Lock background scroll when any contact modal is open
  useLockBodyScroll(
    walletModalPerson !== null ||
    detailPerson !== null ||
    editingPerson !== null ||
    isNewContactOpen ||
    personToDelete !== null ||
    selectedHistoryTx !== null ||
    selectedHistoryTab !== null
  );


  // Helper: check if debt is overdue
  const todayJalali = getJalaliDateString();
  const isOverdue = (dueDate?: string) => {
    if (!dueDate) return false;
    return dueDate < todayJalali;
  };

  // Calculate total paid so far by this customer/contact
  const getPersonTotalPaid = (personId: string) => {
    return transactions
      .filter((t) => t.personId === personId && (t.type === 'income' || t.type === 'receivable_collection'))
      .reduce((sum, t) => sum + t.amount, 0);
  };

  // Create / Edit Contact Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [type, setType] = useState<PersonType>('customer');
  const [smartLaunchId, setSmartLaunchId] = useState('');
  const [balanceRaw, setBalanceRaw] = useState('');
  const [maxCreditLimitRaw, setMaxCreditLimitRaw] = useState('500000');
  const [debtDueDate, setDebtDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Filter persons
  const filteredPersons = persons.filter((p) => {
    if (filterType !== 'all' && p.type !== filterType) return false;
    if (financialFilter === 'debtors' && p.currentBalance <= 0) return false;
    if (financialFilter === 'creditors' && p.currentBalance >= 0) return false;
    if (financialFilter === 'settled' && p.currentBalance !== 0) return false;
    if (financialFilter === 'overdue' && !(p.currentBalance > 0 && isOverdue(p.debtDueDate))) return false;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const normQ = normalizeForSearch(search);
      const phoneQ = cleanPhoneForSearch(search);

      const matchName = p.name.toLowerCase().includes(q) || (normQ && normalizeForSearch(p.name).includes(normQ));
      const matchPhone =
        (p.phone && p.phone.includes(q)) ||
        (phoneQ.length >= 3 && cleanPhoneForSearch(p.phone).includes(phoneQ));
      const matchSmart =
        p.smartLaunchId &&
        (p.smartLaunchId.toLowerCase().includes(q) ||
          (normQ && normalizeForSearch(p.smartLaunchId).includes(normQ)));
      const matchNational =
        p.nationalId &&
        (p.nationalId.includes(q) ||
          (normQ && normalizeForSearch(p.nationalId).includes(normQ)));

      return matchName || matchPhone || matchSmart || matchNational;
    }
    return true;
  });

  const totalReceivables = persons
    .filter((p) => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);

  const totalPayables = persons
    .filter((p) => p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  // Filter counts
  const debtorsCount = persons.filter((p) => p.currentBalance > 0).length;
  const creditorsCount = persons.filter((p) => p.currentBalance < 0).length;
  const settledCount = persons.filter((p) => p.currentBalance === 0).length;
  const overdueCount = persons.filter((p) => p.currentBalance > 0 && isOverdue(p.debtDueDate)).length;

  const handleOpenWalletModal = (p: Person, initialTab: 'charge' | 'deduct' | 'adjust' = 'charge') => {
    setWalletModalPerson(p);
    setWalletTab(initialTab);
    setWalletAmountRaw('');
    setWalletTargetBalanceRaw('');
    setWalletTargetType(p.currentBalance < 0 ? 'credit' : p.currentBalance > 0 ? 'debt' : 'zero');
    setWalletAccountId(accounts[0]?.id || '');
    setWalletDesc('');
    setWalletSyncAccount(true);
    setWalletError(null);
  };

  const handleWalletSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walletModalPerson) return;

    try {
      setWalletLoading(true);
      setWalletError(null);

      const date = new Date().toISOString();
      const jalaliDate = getJalaliDateString();

      if (walletTab === 'charge') {
        const amount = parseTomanInput(walletAmountRaw);
        if (amount <= 0) {
          setWalletError('مبلغ شارژ کیف پول باید بزرگتر از صفر باشد.');
          return;
        }
        if (onManageWallet) {
          await onManageWallet(walletModalPerson.id, {
            action: 'charge',
            amount,
            accountId: walletAccountId,
            date,
            jalaliDate,
            description: walletDesc.trim() || `شارژ کیف پول ${walletModalPerson.name} ${walletModalPerson.smartLaunchId ? `[آیدی: ${walletModalPerson.smartLaunchId}]` : ''}`,
          });
        } else {
          // Fallback to onSettle
          await onSettle(walletModalPerson.id, {
            amount,
            actionType: 'collect',
            accountId: walletAccountId,
            date,
            jalaliDate,
            description: walletDesc.trim() || `شارژ کیف پول ${walletModalPerson.name}`,
          });
        }
      } else if (walletTab === 'deduct') {
        const amount = parseTomanInput(walletAmountRaw);
        if (amount <= 0) {
          setWalletError('مبلغ کسر از کیف پول باید بزرگتر از صفر باشد.');
          return;
        }
        if (onManageWallet) {
          await onManageWallet(walletModalPerson.id, {
            action: 'deduct',
            amount,
            accountId: walletAccountId || undefined,
            date,
            jalaliDate,
            description: walletDesc.trim() || `کسر از حساب / برداشت از کیف پول ${walletModalPerson.name}`,
          });
        } else {
          await onSettle(walletModalPerson.id, {
            amount,
            actionType: 'pay',
            accountId: walletAccountId,
            date,
            jalaliDate,
            description: walletDesc.trim() || `کسر از حساب / عودت وجه ${walletModalPerson.name}`,
          });
        }
      } else if (walletTab === 'adjust') {
        let finalTargetBal = 0;
        if (walletTargetType === 'zero') {
          finalTargetBal = 0;
        } else {
          const val = parseTomanInput(walletTargetBalanceRaw);
          finalTargetBal = walletTargetType === 'credit' ? -Math.abs(val) : Math.abs(val);
        }

        if (onManageWallet) {
          await onManageWallet(walletModalPerson.id, {
            action: 'adjust',
            targetBalance: finalTargetBal,
            accountId: walletSyncAccount ? walletAccountId : undefined,
            date,
            jalaliDate,
            description: walletDesc.trim() || `تعدیل مستقیم مانده حساب ${walletModalPerson.name} (تراز اسمارت‌لانچ)`,
          });
        } else {
          await onUpdateContact(walletModalPerson.id, {
            currentBalance: finalTargetBal,
          });
        }
      }

      setWalletModalPerson(null);
      onRefresh();
    } catch (err: unknown) {
      setWalletError(err instanceof Error ? err.message : 'خطا در عملیات کیف پول');
    } finally {
      setWalletLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setName('');
    setPhone('');
    setType('customer');
    setSmartLaunchId('');
    setBalanceRaw('');
    setMaxCreditLimitRaw('500000');
    setDebtDueDate('');
    setNotes('');
    setFormError(null);
    setIsNewContactOpen(true);
  };

  const handleOpenEdit = (p: Person) => {
    setEditingPerson(p);
    setName(p.name);
    setPhone(p.phone || '');
    setType(p.type);
    setSmartLaunchId(p.smartLaunchId || '');
    setBalanceRaw(p.currentBalance.toString());
    setMaxCreditLimitRaw(p.maxCreditLimit ? p.maxCreditLimit.toString() : '500000');
    setDebtDueDate(p.debtDueDate || '');
    setNotes(p.notes || '');
    setFormError(null);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('نام شخص الزامی است.');
      return;
    }
    try {
      setFormLoading(true);
      setFormError(null);
      const payload: Partial<Person> = {
        name: name.trim(),
        phone: phone.trim() || undefined,
        type,
        smartLaunchId: smartLaunchId.trim() || undefined,
        currentBalance: parseTomanInput(balanceRaw),
        maxCreditLimit: parseTomanInput(maxCreditLimitRaw) || undefined,
        debtDueDate: debtDueDate.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      if (editingPerson) {
        await onUpdateContact(editingPerson.id, payload);
        setEditingPerson(null);
      } else {
        await onCreateContact(payload);
        setIsNewContactOpen(false);
      }
      onRefresh();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'خطا در ذخیره مشخصات شخص');
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = (p: Person) => {
    setPersonToDelete(p);
  };

  const handleConfirmDelete = async () => {
    if (!personToDelete) return;
    try {
      setDeleteLoading(true);
      await onDeleteContact(personToDelete.id);
      setPersonToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Users2 className="w-6 h-6 text-[#2596BE]" />
            <span>مدیریت مشتریان، کیف پول و طرف‌های حساب</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            شارژ و کسر کیف پول، تراز با آیدی SmartLaunch، پیگیری نسیه و سوابق بازی‌ها
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handleOpenCreate}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-[#2596BE] text-white rounded-xl text-xs sm:text-sm font-bold hover:bg-[#1E7E9E] transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <PlusCircle className="w-4 h-4" />
            <span>ثبت مشتری جدید</span>
          </button>
        </div>
      </div>

      {/* Aggregate Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-medium">کل طلب ما از مشتریان (نسیه)</span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {formatToman(totalReceivables)} <span className="text-xs font-normal text-slate-400">تومان</span>
              </span>
            </div>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
            {debtorsCount} نفر
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-medium">موجودی کیف پول و بستانکاری</span>
              <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatToman(totalPayables)} <span className="text-xs font-normal text-slate-400">تومان</span>
              </span>
            </div>
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
            {creditorsCount} نفر
          </span>
        </div>

        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block font-medium">مشتریان تسویه شده (بی‌حساب)</span>
              <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                {settledCount} <span className="text-xs font-normal text-slate-400">نفر</span>
              </span>
            </div>
          </div>
          <span className="text-xs font-bold text-slate-400">
            مجموع کل: {persons.length} نفر
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5 items-center justify-between">
          {/* Search Box */}
          <div className="w-full sm:w-80 relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجوی نام، تلفن یا آیدی SmartLaunch..."
              className="w-full pl-4 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#2596BE]/40 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
            {/* Person Type Selector */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-[#2596BE] text-white font-bold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                همه
              </button>
              {personTypesList.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterType(tab.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                    filterType === tab.id
                      ? 'bg-[#2596BE] text-white font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md text-xs cursor-pointer transition-all ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-slate-900 text-[#2596BE] shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="نمای کارتی جمع‌وجور"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-md text-xs cursor-pointer transition-all ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-[#2596BE] shadow-xs font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
                title="نمای جدولی فشرده"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Financial Status Filters */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap shrink-0 ml-1">
            وضعیت مالی:
          </span>
          {[
            { id: 'all', label: 'همه', count: persons.length },
            { id: 'creditors', label: 'شارژ کیف پول (بستانکار)', count: creditorsCount, color: 'text-emerald-600' },
            { id: 'debtors', label: 'بدهکاران نسیه', count: debtorsCount, color: 'text-amber-600' },
            { id: 'settled', label: 'تسویه شده', count: settledCount, color: 'text-slate-500' },
            { id: 'overdue', label: 'سررسید گذشته', count: overdueCount, color: 'text-rose-600' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFinancialFilter(item.id as any)}
              className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                financialFilter === item.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <span>{item.label}</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                {item.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Empty State */}
      {filteredPersons.length === 0 && (
        <div className="py-12 text-center bg-white dark:bg-[#111C33] rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          <Users2 className="w-10 h-10 mx-auto text-slate-400 mb-2 opacity-50" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">مشتری با این مشخصات یافت نشد.</p>
          <p className="text-xs text-slate-400 mt-1">می‌توانید عبارت جستجو را پاک کنید یا شخص جدیدی ثبت نمایید.</p>
        </div>
      )}

      {/* COMPACT CARDS VIEW (دیزاین جمع‌وجور و بدون جزئیات اضافه) */}
      {viewMode === 'grid' && filteredPersons.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredPersons.map((p) => {
            const owesUs = p.currentBalance > 0;
            const weOwe = p.currentBalance < 0; // Credit / Wallet balance
            const isZero = p.currentBalance === 0;
            const hasExceededLimit = p.maxCreditLimit && p.currentBalance > p.maxCreditLimit;
            const hasOverdueDebt = owesUs && isOverdue(p.debtDueDate);

            return (
              <div
                key={p.id}
                className={`p-3.5 rounded-2xl bg-white dark:bg-[#111C33] border shadow-xs flex flex-col justify-between space-y-2.5 transition-all hover:shadow-md ${
                  hasOverdueDebt || hasExceededLimit
                    ? 'border-amber-400/80 dark:border-amber-600/70 bg-amber-50/20 dark:bg-amber-950/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-[#2596BE]/50'
                }`}
              >
                {/* Row 1: Avatar, Name, SmartLaunch ID Badge, Action Icons */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-200 dark:border-slate-700">
                      {p.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-bold text-xs text-slate-900 dark:text-white truncate" title={p.name}>
                          {p.name}
                        </h3>
                        {p.smartLaunchId && (
                          <span
                            className="px-1.5 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-mono font-bold text-[10px] border border-indigo-200 dark:border-indigo-800/80 shrink-0"
                            title="شناسه اسمارت‌لانچ"
                          >
                            {p.smartLaunchId}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {p.phone ? (
                          <a
                            href={`tel:${p.phone}`}
                            className="text-[11px] text-slate-500 hover:text-[#2596BE] font-mono flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{p.phone}</span>
                          </a>
                        ) : (
                          <span className="text-[10px] text-slate-400">بدون تلفن</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => handleOpenEdit(p)}
                      className="p-1 rounded-lg text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                      title="ویرایش مشخصات"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer transition-colors"
                      title="حذف شخص"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Row 2: Compact Wallet / Balance Status Badge */}
                <div>
                  {isZero && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-[11px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                        حساب کاربری:
                      </span>
                      <span className="font-bold text-[11px] text-slate-600 dark:text-slate-400">تسویه کامل (۰ تومان)</span>
                    </div>
                  )}

                  {weOwe && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-xs text-emerald-800 dark:text-emerald-300">
                      <span className="flex items-center gap-1 text-[11px] font-bold">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        کیف پول (اعتبار):
                      </span>
                      <span className="font-black font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                        +{formatToman(Math.abs(p.currentBalance))} <span className="text-[10px] font-normal">تومان</span>
                      </span>
                    </div>
                  )}

                  {owesUs && (
                    <div className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-800 dark:text-amber-300">
                      <span className="flex items-center gap-1 text-[11px] font-bold">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                        بدهی نسیه:
                      </span>
                      <span className="font-black font-mono tabular-nums text-amber-700 dark:text-amber-400">
                        {formatToman(p.currentBalance)} <span className="text-[10px] font-normal">تومان</span>
                      </span>
                    </div>
                  )}

                  {/* Overdue Alert Small Pip if any */}
                  {hasOverdueDebt && (
                    <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1 mt-1 px-1">
                      <Clock className="w-3 h-3" />
                      <span>موعد سررسید گذشته ({p.debtDueDate})</span>
                    </div>
                  )}
                </div>

                {/* Row 3: Action Buttons (کیف پول / تسویه + پرونده و سوابق) */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOpenWalletModal(p, owesUs ? 'charge' : 'charge')}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-[#2596BE]/10 hover:bg-[#2596BE] text-[#2596BE] hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    title="شارژ یا کسر از کیف پول و تسویه حساب"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    <span>کیف پول / تسویه</span>
                  </button>

                  <button
                    onClick={() => setDetailPerson(p)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    title="مشاهده پرونده کامل، سوابق بازی‌ها، یادداشت و ریز تراکنش‌ها"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>پرونده و سوابق</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DENSE TABLE VIEW (نمای جدولی فشرده برای مدیریت سریع) */}
      {viewMode === 'table' && filteredPersons.length > 0 && (
        <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">نام شخص</th>
                  <th className="py-2.5 px-3">آیدی SmartLaunch</th>
                  <th className="py-2.5 px-3">شماره تماس</th>
                  <th className="py-2.5 px-3">نوع</th>
                  <th className="py-2.5 px-3">مانده حساب</th>
                  <th className="py-2.5 px-3">سقف اعتبار</th>
                  <th className="py-2.5 px-3 text-center">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredPersons.map((p) => {
                  const owesUs = p.currentBalance > 0;
                  const weOwe = p.currentBalance < 0;
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                        {p.name}
                      </td>
                      <td className="py-2.5 px-3 font-mono">
                        {p.smartLaunchId ? (
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold text-[11px] border border-indigo-200 dark:border-indigo-800">
                            {p.smartLaunchId}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                        {p.phone || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {p.type === 'customer'
                          ? 'مشتری'
                          : p.type === 'supplier'
                          ? 'تامین‌کننده'
                          : p.type === 'technician'
                          ? 'تعمیرکار'
                          : 'همکار'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {p.currentBalance === 0 && <span className="text-slate-400">تسویه کامل</span>}
                        {weOwe && (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            +{formatToman(Math.abs(p.currentBalance))} ت (کیف پول)
                          </span>
                        )}
                        {owesUs && (
                          <span className="text-amber-600 dark:text-amber-400">
                            {formatToman(p.currentBalance)} ت (بدهکار)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {p.maxCreditLimit ? `${formatToman(p.maxCreditLimit)} ت` : 'نامحدود'}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenWalletModal(p, 'charge')}
                            className="p-1.5 rounded-lg text-[#2596BE] hover:bg-[#2596BE]/10 cursor-pointer"
                            title="کیف پول / تسویه"
                          >
                            <Wallet className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDetailPerson(p)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="سوابق و پرونده"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="ویرایش"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            title="حذف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* WALLET & BALANCE MANAGEMENT MODAL (شارژ، کسر موجودی، تراز مستقیم با اسمارت‌لانچ) */}
      {walletModalPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#2596BE]/15 text-[#2596BE] flex items-center justify-center">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>مدیریت کیف پول و حساب: {walletModalPerson.name}</span>
                    {walletModalPerson.smartLaunchId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-bold border border-indigo-200 dark:border-indigo-800">
                        {walletModalPerson.smartLaunchId}
                      </span>
                    )}
                  </h3>
                  <div className="flex items-center gap-2 text-xs mt-0.5">
                    <span className="text-slate-400">مانده فعلی حساب:</span>
                    {walletModalPerson.currentBalance === 0 && (
                      <span className="font-bold text-slate-500">تسویه کامل (۰ تومان)</span>
                    )}
                    {walletModalPerson.currentBalance < 0 && (
                      <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatToman(Math.abs(walletModalPerson.currentBalance))} تومان (اعتبار کیف پول)
                      </span>
                    )}
                    {walletModalPerson.currentBalance > 0 && (
                      <span className="font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                        {formatToman(walletModalPerson.currentBalance)} تومان (بدهی نسیه)
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWalletModalPerson(null)}
                className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub Tabs: شارژ کیف پول (+) / کسر از کیف پول (-) / تراز و تنظیم مستقیم */}
            <div className="grid grid-cols-3 p-1.5 bg-slate-100 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => {
                  setWalletTab('charge');
                  setWalletError(null);
                }}
                className={`py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  walletTab === 'charge'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <span>➕ شارژ کیف پول</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setWalletTab('deduct');
                  setWalletError(null);
                }}
                className={`py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  walletTab === 'deduct'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <span>➖ کسر از حساب</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setWalletTab('adjust');
                  setWalletError(null);
                }}
                className={`py-2 rounded-xl font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  walletTab === 'adjust'
                    ? 'bg-[#2596BE] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800'
                }`}
              >
                <span>⚖️ تراز مستقیم</span>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleWalletSubmit} className="p-5 space-y-4 overflow-y-auto">
              {walletError && (
                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{walletError}</span>
                </div>
              )}

              {/* Mode Description Banner */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                {walletTab === 'charge' && (
                  <p>
                    <strong>شارژ کیف پول و دریافت وجه:</strong> دریافت وجه نقدی/کارتخوان از مشتری و افزایش اعتبار یا کاهش بدهی. این مبلغ مستقیماً به حساب/صندوق انتخابی واریز و ثبت می‌شود.
                  </p>
                )}
                {walletTab === 'deduct' && (
                  <p>
                    <strong>کسر از موجودی کیف پول:</strong> کسر از اعتبار مشتری (یا اعمال بدهی دستی / عودت وجه نقد). در صورت انتخاب حساب، مبلغ از صندوق/بانک پرداخت خواهد شد.
                  </p>
                )}
                {walletTab === 'adjust' && (
                  <p>
                    <strong>تراز و تنظیم مستقیم مانده حساب:</strong> مانده حساب مشتری را دقیقاً روی عدد دلخواه تنظیم کنید (مثبت برای شارژ کیف پول، منفی برای بدهکاری). مناسب برای همگام‌سازی دستی با نرم‌افزار اسمارت‌لانچ.
                  </p>
                )}
              </div>

              {/* Input for Charge or Deduct */}
              {(walletTab === 'charge' || walletTab === 'deduct') && (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    {walletTab === 'charge' ? 'مبلغ شارژ کیف پول (تومان):' : 'مبلغ کسر از کیف پول (تومان):'}
                  </label>
                  <input
                    type="text"
                    value={walletAmountRaw ? Number(walletAmountRaw).toLocaleString('en-US') : ''}
                    onChange={(e) => setWalletAmountRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                    placeholder="مثال: ۵۰,۰۰۰"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-base font-black tabular-nums focus:ring-2 focus:ring-[#2596BE]/40 outline-none"
                    autoFocus
                  />
                  {/* Quick Amount Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[20000, 50000, 100000, 200000, 500000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setWalletAmountRaw(amt.toString())}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer font-mono"
                      >
                        +{formatToman(amt)}
                      </button>
                    ))}
                    {walletModalPerson.currentBalance > 0 && walletTab === 'charge' && (
                      <button
                        type="button"
                        onClick={() => setWalletAmountRaw(walletModalPerson.currentBalance.toString())}
                        className="px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 hover:bg-amber-200 text-[11px] font-bold cursor-pointer"
                      >
                        تسویه کامل بدهی ({formatToman(walletModalPerson.currentBalance)} ت)
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Input for Adjust Balance */}
              {walletTab === 'adjust' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      نوع مانده جدید مورد نظر:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setWalletTargetType('credit')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          walletTargetType === 'credit'
                            ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        کیف پول مثبت (بستانکار)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWalletTargetType('debt')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          walletTargetType === 'debt'
                            ? 'bg-amber-50 dark:bg-amber-950 border-amber-500 text-amber-700 dark:text-amber-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        بدهکار (نسیه)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWalletTargetType('zero')}
                        className={`py-2 px-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                          walletTargetType === 'zero'
                            ? 'bg-slate-900 dark:bg-white border-slate-900 text-white dark:text-slate-900'
                            : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        صفر (تسویه بی‌حساب)
                      </button>
                    </div>
                  </div>

                  {walletTargetType !== 'zero' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        مبلغ مانده هدف (تومان):
                      </label>
                      <input
                        type="text"
                        value={walletTargetBalanceRaw ? Number(walletTargetBalanceRaw).toLocaleString('en-US') : ''}
                        onChange={(e) => setWalletTargetBalanceRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                        placeholder="مثال: ۱۰۰,۰۰۰"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-base font-black tabular-nums"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Account Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {walletTab === 'charge'
                    ? 'واریز وجه دریافتی به حساب / صندوق دخل:'
                    : walletTab === 'deduct'
                    ? 'پرداخت از حساب / صندوق دخل:'
                    : 'همگام‌سازی اختلاف مالی با حساب:'}
                </label>
                <select
                  value={walletAccountId}
                  onChange={(e) => setWalletAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  بابت و شرح تراکنش (اختیاری):
                </label>
                <input
                  type="text"
                  value={walletDesc}
                  onChange={(e) => setWalletDesc(e.target.value)}
                  placeholder={
                    walletTab === 'charge'
                      ? `شارژ کیف پول ${walletModalPerson.name}`
                      : walletTab === 'deduct'
                      ? `کسر از حساب ${walletModalPerson.name}`
                      : `تراز با نرم‌افزار اسمارت‌لانچ`
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              {/* Preview Box */}
              <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">پیش‌نمایش مانده پس از ثبت:</span>
                <span className="font-bold tabular-nums font-mono text-slate-900 dark:text-white">
                  {(() => {
                    const cur = walletModalPerson.currentBalance;
                    if (walletTab === 'charge') {
                      const amt = parseTomanInput(walletAmountRaw);
                      const next = cur - amt;
                      return next === 0 ? 'تسویه کامل (۰ تومان)' : next < 0 ? `+${formatToman(Math.abs(next))} ت (کیف پول)` : `${formatToman(next)} ت (بدهکار)`;
                    } else if (walletTab === 'deduct') {
                      const amt = parseTomanInput(walletAmountRaw);
                      const next = cur + amt;
                      return next === 0 ? 'تسویه کامل (۰ تومان)' : next < 0 ? `+${formatToman(Math.abs(next))} ت (کیف پول)` : `${formatToman(next)} ت (بدهکار)`;
                    } else {
                      if (walletTargetType === 'zero') return 'تسویه کامل (۰ تومان)';
                      const val = parseTomanInput(walletTargetBalanceRaw);
                      return walletTargetType === 'credit' ? `+${formatToman(val)} ت (کیف پول)` : `${formatToman(val)} ت (بدهکار)`;
                    }
                  })()}
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setWalletModalPerson(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={walletLoading}
                  className="px-5 py-2.5 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs active:scale-98 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {walletLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال اعمال...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ثبت تغییر در کیف پول و دفاتر حساب</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAILED DOSSIER & RECORDS MODAL (پرونده، سوابق بازی‌ها، یادداشت و ریز تراکنش‌ها) */}
      {detailPerson && (
        (() => {
          const personTx = transactions
            .filter((t) => t.personId === detailPerson.id)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          const totalPaid = getPersonTotalPaid(detailPerson.id);
          const relatedTabs = openTabs.filter((t) => t.personId === detailPerson.id);

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#2596BE]/15 text-[#2596BE] flex items-center justify-center">
                      <IdCard className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span>{detailPerson.name}</span>
                        {detailPerson.smartLaunchId && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-mono font-bold border border-indigo-200 dark:border-indigo-800">
                            SmartLaunch ID: {detailPerson.smartLaunchId}
                          </span>
                        )}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-bold">
                          {detailPerson.type === 'customer'
                            ? 'مشتری'
                            : detailPerson.type === 'supplier'
                            ? 'تامین‌کننده'
                            : 'همکار'}
                        </span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        پرونده جامع مالی، سوابق بازی‌ها، یادداشت‌ها و گردش حساب
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailPerson(null)}
                    className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto space-y-4 flex-1">
                  {/* Highlights Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Total Paid Highlight */}
                    <div className="p-3.5 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-center">
                      <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">
                        مجموع پرداخت‌های مشتری تا الان:
                      </span>
                      <span className="text-base font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                        {formatToman(totalPaid)} تومان
                      </span>
                    </div>

                    {/* Current Balance */}
                    <div
                      className={`p-3.5 rounded-2xl border text-center ${
                        detailPerson.currentBalance > 0
                          ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300'
                          : detailPerson.currentBalance < 0
                          ? 'border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30 text-purple-800 dark:text-purple-300'
                          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="text-[11px] font-semibold block">
                        {detailPerson.currentBalance > 0
                          ? 'مانده بدهی نسیه:'
                          : detailPerson.currentBalance < 0
                          ? 'اعتبار کیف پول (بستانکار):'
                          : 'وضعیت حساب:'}
                      </span>
                      <span className="text-base font-black tabular-nums">
                        {detailPerson.currentBalance === 0
                          ? 'تسویه کامل'
                          : `${formatToman(Math.abs(detailPerson.currentBalance))} تومان`}
                      </span>
                    </div>

                    {/* Credit Limit & Terms */}
                    <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 text-center">
                      <span className="text-[11px] font-semibold text-slate-500 block">سقف اعتبار نسیه:</span>
                      <span className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                        {detailPerson.maxCreditLimit ? `${formatToman(detailPerson.maxCreditLimit)} تومان` : 'نامحدود'}
                      </span>
                    </div>
                  </div>

                  {/* Contact Info Row */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">شماره تماس:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                        {detailPerson.phone || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">شناسه SmartLaunch:</span>
                      <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                        {detailPerson.smartLaunchId || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">موعد تسویه بدهی:</span>
                      <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
                        {detailPerson.debtDueDate || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">تعداد تراکنش‌ها:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                        {personTx.length} گردش
                      </span>
                    </div>
                  </div>

                  {/* Notes if available */}
                  {detailPerson.notes && (
                    <div className="p-3 rounded-xl bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 text-xs">
                      <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block mb-1">
                        یادداشت و توضیحات پرونده:
                      </span>
                      <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {detailPerson.notes}
                      </p>
                    </div>
                  )}

                  {/* Search and Filters in Customer History */}
                  <div className="pt-2 space-y-2.5">
                    <div className="relative">
                      <input
                        type="text"
                        value={customerHistorySearch}
                        onChange={(e) => setCustomerHistorySearch(e.target.value)}
                        placeholder="جستجو در سوابق، فاکتورها، شرح، مبالغ یا اقلام این مشتری..."
                        className="w-full pl-8 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-[#2596BE]/40 outline-none"
                      />
                      <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      {customerHistorySearch && (
                        <button
                          type="button"
                          onClick={() => setCustomerHistorySearch('')}
                          className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 absolute left-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Filter Pills for Date & Type */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Date Filter */}
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <select
                            value={historyDateFilter}
                            onChange={(e) => setHistoryDateFilter(e.target.value as any)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs focus:ring-2 focus:ring-[#2596BE]/40 outline-none"
                          >
                            <option value="all">همه تاریخ‌ها</option>
                            <option value="today">امروز</option>
                            <option value="week">۷ روز اخیر</option>
                            <option value="month">۳۰ روز اخیر</option>
                          </select>
                        </div>

                        {/* Type Filter */}
                        <div className="flex items-center gap-1">
                          <Receipt className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <select
                            value={historyTypeFilter}
                            onChange={(e) => setHistoryTypeFilter(e.target.value as any)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs focus:ring-2 focus:ring-[#2596BE]/40 outline-none"
                          >
                            <option value="all">همه انواع تراکنش‌ها</option>
                            <option value="income">درآمد و فاکتورها</option>
                            <option value="credit">نسیه و بدهی ثبت‌شده</option>
                            <option value="wallet">شارژ و کسر کیف پول</option>
                            <option value="collection">تسویه بدهی و وصول طلب</option>
                          </select>
                        </div>
                      </div>

                      {(customerHistorySearch || historyDateFilter !== 'all' || historyTypeFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomerHistorySearch('');
                            setHistoryDateFilter('all');
                            setHistoryTypeFilter('all');
                          }}
                          className="text-[#2596BE] hover:underline text-[11px] font-medium cursor-pointer"
                        >
                          پاک کردن فیلترها
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Unified Comprehensive History Records */}
                  {(() => {
                    const histQ = customerHistorySearch.trim().toLowerCase();
                    const histNormQ = normalizeForSearch(customerHistorySearch);

                    const filteredPersonTx = personTx.filter((tx) => {
                      // Text search
                      if (histQ) {
                        const matchDesc = tx.description?.toLowerCase().includes(histQ) || (histNormQ && normalizeForSearch(tx.description || '').includes(histNormQ));
                        const matchAmount = tx.amount.toString().includes(histQ);
                        const matchAccount = (tx.toAccountName && tx.toAccountName.toLowerCase().includes(histQ)) || (tx.fromAccountName && tx.fromAccountName.toLowerCase().includes(histQ));
                        const matchAdmin = tx.createdBy && (tx.createdBy.toLowerCase().includes(histQ) || (histNormQ && normalizeForSearch(tx.createdBy).includes(histNormQ)));
                        const matchMethod = tx.paymentMethod && tx.paymentMethod.toLowerCase().includes(histQ);
                        const matchItems = tx.receiptItems?.some((it) => it.productName.toLowerCase().includes(histQ) || (histNormQ && normalizeForSearch(it.productName).includes(histNormQ)));
                        if (!matchDesc && !matchAmount && !matchAccount && !matchAdmin && !matchMethod && !matchItems) return false;
                      }

                      // Date filter
                      if (historyDateFilter !== 'all') {
                        const txDate = new Date(tx.date);
                        if (historyDateFilter === 'today') {
                          const todayStr = getJalaliDateString();
                          const txDateStr = getJalaliDateString(txDate);
                          if (todayStr !== txDateStr) return false;
                        } else if (historyDateFilter === 'week') {
                          const weekAgo = new Date(Date.now() - 7 * 86400000);
                          if (txDate < weekAgo) return false;
                        } else if (historyDateFilter === 'month') {
                          const monthAgo = new Date(Date.now() - 30 * 86400000);
                          if (txDate < monthAgo) return false;
                        }
                      }

                      // Type filter
                      if (historyTypeFilter !== 'all') {
                        const meta = getTransactionMeta(tx);
                        if (historyTypeFilter === 'credit') {
                          if (meta.kind !== 'credit') return false;
                        } else if (historyTypeFilter === 'income') {
                          if (meta.kind !== 'income') return false;
                        } else if (historyTypeFilter === 'wallet') {
                          if (meta.kind !== 'wallet_charge' && meta.kind !== 'wallet_deduct') return false;
                        } else if (historyTypeFilter === 'collection') {
                          if (meta.kind !== 'receivable_collection' && meta.kind !== 'debt_settlement') return false;
                        }
                      }

                      return true;
                    });

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Receipt className="w-3.5 h-3.5 text-[#2596BE]" />
                            <span>ریز تراکنش‌ها و پرونده مالی ({filteredPersonTx.length}):</span>
                          </h4>
                          <span className="text-[10px] text-slate-400">کلیک روی هر مورد برای مشاهده جزئیات فاکتور و اقلام</span>
                        </div>

                        {filteredPersonTx.length === 0 ? (
                          <div className="py-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30">
                            {histQ || historyDateFilter !== 'all' || historyTypeFilter !== 'all'
                              ? 'موردی مطابق با فیلترهای انتخابی یافت نشد.'
                              : 'گردش مالی یا فاکتوری برای این شخص ثبت نشده است.'}
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-0.5">
                            {filteredPersonTx.map((tx) => {
                              const meta = getTransactionMeta(tx);
                              const methodBadge = getPaymentMethodBadge(tx.paymentMethod, tx.isCredit);

                              return (
                                <div
                                  key={tx.id}
                                  onClick={() => setSelectedHistoryTx(tx)}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 text-xs hover:border-[#2596BE] hover:bg-slate-100/80 dark:hover:bg-slate-800/60 cursor-pointer transition-all group shadow-2xs"
                                  title="کلیک برای مشاهده جزئیات کامل، اقلام و اطلاعات پرداخت"
                                >
                                  {/* Right side: Icon, Description, Tags, Operator */}
                                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                                    <div className="w-8 h-8 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0 text-[#2596BE] group-hover:scale-105 transition-transform mt-0.5 sm:mt-0">
                                      {tx.receiptItems && tx.receiptItems.length > 0 ? (
                                        <Gamepad2 className="w-4 h-4" />
                                      ) : meta.kind === 'wallet_charge' || meta.kind === 'wallet_deduct' ? (
                                        <Wallet className="w-4 h-4" />
                                      ) : (
                                        <Receipt className="w-4 h-4" />
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#2596BE] transition-colors truncate max-w-[260px] sm:max-w-md block">
                                          {tx.description}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${meta.badgeClass}`}>
                                          {meta.label}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 flex-wrap">
                                        <span className="font-mono">{formatJalaliReadable(tx.date, true)}</span>
                                        {tx.createdBy && (
                                          <>
                                            <span aria-hidden="true">•</span>
                                            <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-400">
                                              <UserCheck className="w-3 h-3 text-[#2596BE]" />
                                              <span>ادمین: {tx.createdBy}</span>
                                            </span>
                                          </>
                                        )}
                                        {tx.toAccountName && (
                                          <>
                                            <span aria-hidden="true">•</span>
                                            <span>حساب: {tx.toAccountName}</span>
                                          </>
                                        )}
                                        {tx.receiptItems && tx.receiptItems.length > 0 && (
                                          <>
                                            <span aria-hidden="true">•</span>
                                            <span className="text-slate-500">
                                              {tx.receiptItems.length} قلم کالا
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Left side: Method badge, Amount in Toman, Eye icon */}
                                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800">
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg border ${methodBadge.badgeClass}`}>
                                      {methodBadge.label}
                                    </span>
                                    <div className="text-left font-black tabular-nums text-sm">
                                      <span className={meta.amountClass}>
                                        {formatToman(tx.amount)}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-normal mr-1">تومان</span>
                                    </div>
                                    <Eye className="w-4 h-4 text-slate-400 group-hover:text-[#2596BE] transition-colors shrink-0" />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900/50">
                  <button
                    type="button"
                    onClick={() => setDetailPerson(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    بستن پرونده
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const p = detailPerson;
                      setDetailPerson(null);
                      handleOpenWalletModal(p, 'charge');
                    }}
                    className="px-4 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>شارژ یا کسر از کیف پول</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* POPUP MODAL: CUSTOMER HISTORY TRANSACTION DETAIL (جزئیات کامل فاکتور / تسویه / ادمین) */}
      {selectedHistoryTx && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-[#2596BE]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  جزئیات فاکتور و گردش حساب
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryTx(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Highlight Amount & Settlement Method */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">مبلغ سند / فاکتور:</span>
                  <span className="text-lg font-black font-mono text-slate-900 dark:text-white tabular-nums">
                    {formatToman(selectedHistoryTx.amount)} <span className="text-xs font-normal">تومان</span>
                  </span>
                </div>
                <div>
                  {selectedHistoryTx.isCredit || selectedHistoryTx.paymentMethod === 'credit' ? (
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>تسویه نسیه (بدهی ثبت شده)</span>
                    </span>
                  ) : selectedHistoryTx.paymentMethod === 'wallet' ? (
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5" />
                      <span>کسر از کیف پول</span>
                    </span>
                  ) : selectedHistoryTx.paymentMethod === 'split' ? (
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1.5">
                      <span>ترکیبی (کیف پول + نقد/پوز)</span>
                    </span>
                  ) : selectedHistoryTx.paymentMethod === 'pos' ? (
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>تسویه با کارتخوان (پوز)</span>
                    </span>
                  ) : selectedHistoryTx.paymentMethod === 'cash' ? (
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
                      <Coins className="w-3.5 h-3.5" />
                      <span>تسویه نقدی</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                      {selectedHistoryTx.type === 'income' ? 'درآمد' : selectedHistoryTx.type === 'receivable_collection' ? 'وصول مطالبات' : 'سند مالی'}
                    </span>
                  )}
                </div>
              </div>

              {/* Detailed Meta Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-[#2596BE]" />
                    <span>ثبت توسط ادمین / اپراتور:</span>
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    {selectedHistoryTx.createdBy || 'اپراتور سیستم'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#2596BE]" />
                    <span>تاریخ و ساعت ثبت:</span>
                  </span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 block text-[11px]">
                    {formatJalaliReadable(selectedHistoryTx.date, true)}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5 text-[#2596BE]" />
                    <span>صندوق / حساب دریافتی:</span>
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    {selectedHistoryTx.toAccountName || selectedHistoryTx.fromAccountName || (selectedHistoryTx.isCredit ? 'بدون واریز نقدی (نسیه)' : '-')}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <IdCard className="w-3.5 h-3.5 text-[#2596BE]" />
                    <span>شناسه سند:</span>
                  </span>
                  <span className="font-mono text-slate-600 dark:text-slate-400 block text-[11px]">
                    {selectedHistoryTx.id.replace('tx_', '#')}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 text-xs space-y-1">
                <span className="text-[11px] text-slate-400 block">شرح تراکنش:</span>
                <p className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                  {selectedHistoryTx.description}
                </p>
              </div>

              {/* Receipt Items Breakdown (if available) */}
              {selectedHistoryTx.receiptItems && selectedHistoryTx.receiptItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    ریز اقلام فاکتور ({selectedHistoryTx.receiptItems.length} قلم):
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                        <tr>
                          <th className="py-2 px-3">کالا / عنوان</th>
                          <th className="py-2 px-2 text-center">تعداد</th>
                          <th className="py-2 px-3">قیمت واحد</th>
                          <th className="py-2 px-3 text-left">مجموع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedHistoryTx.receiptItems.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                              {item.productName}
                            </td>
                            <td className="py-2 px-2 text-center font-mono font-bold text-slate-600 dark:text-slate-300">
                              {item.quantity}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-500">
                              {formatToman(item.unitPrice)} ت
                            </td>
                            <td className="py-2 px-3 text-left font-mono font-bold text-slate-900 dark:text-white">
                              {formatToman(item.totalPrice)} ت
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHistoryTx(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: CUSTOMER HISTORY TAB DETAIL (جزئیات کامل میز / کنسول / زمان بازی) */}
      {selectedHistoryTab && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-[#2596BE]" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  جزئیات میز و سفارشات: {selectedHistoryTab.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedHistoryTab(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Highlight Amount & Status */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block mb-1">جمع فاکتور میز:</span>
                  <span className="text-lg font-black font-mono text-slate-900 dark:text-white tabular-nums">
                    {formatToman(selectedHistoryTab.totalAmount)} <span className="text-xs font-normal">تومان</span>
                  </span>
                </div>
                <div>
                  <span className={`px-3 py-1 rounded-xl text-xs font-bold border ${
                    selectedHistoryTab.status === 'open'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                  }`}>
                    {selectedHistoryTab.status === 'open' ? 'درحال بازی' : 'تسویه شده'}
                  </span>
                </div>
              </div>

              {/* Meta Info */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-[#2596BE]" />
                    <span>ادمین بازکننده میز:</span>
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    {selectedHistoryTab.openedByName || 'اپراتور سیستم'}
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800 space-y-1">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#2596BE]" />
                    <span>زمان شروع میز:</span>
                  </span>
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 block text-[11px]">
                    {formatJalaliReadable(selectedHistoryTab.startedAt, true)}
                  </span>
                </div>
              </div>

              {/* SmartLaunch Info if available */}
              {selectedHistoryTab.smartLaunchSettled && (
                <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/50 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">مدت تایم بازی:</span>
                    <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                      {selectedHistoryTab.smartLaunchSettled.durationMinutes} دقیقه
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">مبلغ کسر شده در اسمارت‌لانچ:</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                      {formatToman(selectedHistoryTab.smartLaunchSettled.amount)} تومان
                    </span>
                  </div>
                </div>
              )}

              {/* Items Breakdown */}
              {selectedHistoryTab.items && selectedHistoryTab.items.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                    اقلام و خدمات ثبت شده روی این میز:
                  </h4>
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                        <tr>
                          <th className="py-2 px-3">کالا / عنوان</th>
                          <th className="py-2 px-2 text-center">تعداد</th>
                          <th className="py-2 px-3">قیمت واحد</th>
                          <th className="py-2 px-3 text-left">مجموع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {selectedHistoryTab.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                              {it.productName}
                            </td>
                            <td className="py-2 px-2 text-center font-mono font-bold text-slate-600 dark:text-slate-300">
                              {it.quantity}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-500">
                              {formatToman(it.unitPrice)} ت
                            </td>
                            <td className="py-2 px-3 text-left font-mono font-bold text-slate-900 dark:text-white">
                              {formatToman(it.totalPrice)} ت
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedHistoryTab(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT CONTACT MODAL */}
      {(isNewContactOpen || editingPerson) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users2 className="w-4 h-4 text-[#2596BE]" />
                <span>{editingPerson ? 'ویرایش مشخصات مشتری' : 'افزودن مشتری جدید'}</span>
              </h2>
              <button
                type="button"
                onClick={() => {
                  setIsNewContactOpen(false);
                  setEditingPerson(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="p-5 space-y-3.5">
              {formError && (
                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام و نام خانوادگی *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="مثال: آرمین کمالی"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* SMARTLAUNCH ID (جایگزین کد ملی جهت تفکیک افراد هم‌نام) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                    <span className="text-indigo-600 dark:text-indigo-400 font-bold">آیدی SmartLaunch</span>
                    <span className="text-[10px] text-slate-400">(شناسه سیستم)</span>
                  </label>
                  <input
                    type="text"
                    value={smartLaunchId}
                    onChange={(e) => setSmartLaunchId(normalizeDigits(e.target.value))}
                    placeholder="مثال: 1042"
                    className="w-full px-3 py-2 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/20 dark:bg-indigo-950/20 text-slate-900 dark:text-white text-xs font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    شماره تماس
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(normalizeDigits(e.target.value))}
                    placeholder="0912..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    نوع طرف حساب
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as PersonType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    {personTypesList.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    سقف مجاز نسیه (تومان)
                  </label>
                  <input
                    type="text"
                    value={maxCreditLimitRaw ? Number(maxCreditLimitRaw).toLocaleString('en-US') : ''}
                    onChange={(e) => setMaxCreditLimitRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                    placeholder="500,000"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مهلت تسویه بدهی (شمسی)
                  </label>
                  <input
                    type="text"
                    value={debtDueDate}
                    onChange={(e) => setDebtDueDate(e.target.value)}
                    placeholder="1404/08/01"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مانده اولیه حساب (تومان)
                  </label>
                  <input
                    type="text"
                    value={balanceRaw ? Number(balanceRaw).toLocaleString('en-US') : ''}
                    onChange={(e) => setBalanceRaw(normalizeDigits(e.target.value).replace(/[^0-9-]/g, ''))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  یادداشت / توضیحات
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="توضیحات اختیاری درباره مشتری یا سوابق..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewContactOpen(false);
                    setEditingPerson(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="px-5 py-2.5 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs active:scale-98 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {formLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال ثبت...</span>
                    </>
                  ) : (
                    <span>ذخیره مشخصات</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Contact Deletion */}
      <ConfirmModal
        isOpen={!!personToDelete}
        title="حذف شخص از دفتر حساب"
        message={`آیا مطمئن هستید که می‌خواهید شخص "${personToDelete?.name}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onClose={() => setPersonToDelete(null)}
      />
    </div>
  );
};
