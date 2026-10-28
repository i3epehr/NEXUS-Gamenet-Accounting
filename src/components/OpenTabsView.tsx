import React, { useState, useEffect } from 'react';
import {
  Gamepad2,
  Clock,
  User,
  CheckCircle2,
  Trash2,
  Edit2,
  Printer,
  CreditCard,
  Wallet,
  AlertTriangle,
  X,
  Plus,
  Minus,
  ShoppingBag,
  RotateCcw,
  History,
  Calendar,
  Phone,
  BookmarkCheck,
  ArrowRightLeft,
  CalendarDays,
  Sparkles,
  Search,
  Coffee,
  Tag,
  ShoppingCart,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  Account,
  GamingServiceItem,
  OpenTab,
  OpenTabItem,
  Person,
  Product,
  Reservation,
  Transaction,
} from '../types/index.ts';
import { formatJalaliReadable, formatToman, getJalaliDateString } from '../utils/jalali.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';
import { api } from '../services/api.ts';
import { SearchablePersonSelect } from './SearchablePersonSelect.tsx';

interface OpenTabsViewProps {
  tabs: OpenTab[];
  products: Product[];
  persons: Person[];
  accounts: Account[];
  reservations?: Reservation[];
  gamingServices?: GamingServiceItem[];
  onCreateTab: (data: { title: string; personId?: string; customerName?: string; customerPhone?: string; notes?: string }) => Promise<unknown>;
  onUpdateTab: (id: string, data: Partial<OpenTab> & { customerName?: string; customerPhone?: string }) => Promise<unknown>;
  onAddItem: (
    tabId: string,
    data: { productId?: string; productName?: string; quantity: number; unitPrice?: number }
  ) => Promise<unknown>;
  onRemoveItem: (tabId: string, itemId: string) => Promise<unknown>;
  onUpdateItemQuantity?: (
    tabId: string,
    itemId: string,
    data: { delta?: number; quantity?: number }
  ) => Promise<unknown>;
  onCheckoutTab: (
    id: string,
    data: {
      paymentMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
      accountId?: string;
      personId?: string;
      customerName?: string;
      customerPhone?: string;
      walletAmount?: number;
      cashOrPosAmount?: number;
      date: string;
      jalaliDate: string;
    }
  ) => Promise<{ success: boolean; transaction: Transaction; persons?: Person[] }>;
  onDeleteTab: (id: string) => Promise<unknown>;
  onReopenTab?: (id: string) => Promise<unknown>;
  onCreateReservation?: (data: Partial<Reservation>) => Promise<unknown>;
  onUpdateReservation?: (id: string, data: Partial<Reservation>) => Promise<unknown>;
  onDeleteReservation?: (id: string) => Promise<unknown>;
  onConvertToTab?: (id: string) => Promise<unknown>;
  onViewReceipt: (tx: Transaction) => void;
  onRefresh: () => void;
}

export const OpenTabsView: React.FC<OpenTabsViewProps> = ({
  tabs,
  products,
  persons,
  accounts,
  reservations = [],
  gamingServices = [],
  onUpdateTab,
  onAddItem,
  onRemoveItem,
  onUpdateItemQuantity,
  onCheckoutTab,
  onDeleteTab,
  onReopenTab,
  onCreateReservation,
  onUpdateReservation,
  onDeleteReservation,
  onConvertToTab,
  onViewReceipt,
  onRefresh,
}) => {
  // Main view sub-tab: Active Tables vs Reservations
  const [activeSubTab, setActiveSubTab] = useState<'tables' | 'reservations'>('tables');

  // Modal states for Tables
  const [selectedTabForAdd, setSelectedTabForAdd] = useState<OpenTab | null>(null);
  const [selectedTabForCheckout, setSelectedTabForCheckout] = useState<OpenTab | null>(null);
  const [selectedTabForEdit, setSelectedTabForEdit] = useState<OpenTab | null>(null);
  const [tabToDelete, setTabToDelete] = useState<OpenTab | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [reopenLoadingId, setReopenLoadingId] = useState<string | null>(null);

  // Add Item to Tab Form (Rapid visual buffet & manual services)
  const [addItemType, setAddItemType] = useState<'buffet' | 'custom'>('buffet');
  const [addItemSearch, setAddItemSearch] = useState('');
  const [addItemCategory, setAddItemCategory] = useState<string>('all');
  const [stagingItems, setStagingItems] = useState<
    { productId: string; productName: string; quantity: number; unitPrice: number }[]
  >([]);
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [customItemName, setCustomItemName] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);

  // Edit Tab Form
  const [editTitle, setEditTitle] = useState('');
  const [editPersonId, setEditPersonId] = useState('');
  const [editCustomerSource, setEditCustomerSource] = useState<'existing' | 'new'>('existing');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Checkout Form State
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<'pos' | 'cash' | 'credit' | 'wallet'>('pos');
  const [checkoutAccountId, setCheckoutAccountId] = useState(accounts[0]?.id || '');
  const [checkoutPersonId, setCheckoutPersonId] = useState('');
  const [checkoutCustomerSource, setCheckoutCustomerSource] = useState<'existing' | 'new'>('existing');
  const [checkoutCustomerName, setCheckoutCustomerName] = useState('');
  const [checkoutCustomerPhone, setCheckoutCustomerPhone] = useState('');
  const [checkoutWalletAmount, setCheckoutWalletAmount] = useState<number>(0);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutWithReceipt, setCheckoutWithReceipt] = useState(false);
  const [creditLimitWarning, setCreditLimitWarning] = useState<string | null>(null);

  // Micro-loading button feedback states
  const [isStartingTab, setIsStartingTab] = useState(false);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  // Reservation Filter & Modal State
  const [resvFilterTab, setResvFilterTab] = useState<'today' | 'future' | 'all'>('today');
  const [isNewReservationOpen, setIsNewReservationOpen] = useState(false);
  const [editingReservation, setEditingReservation] = useState<Reservation | null>(null);
  const [reservationToDelete, setReservationToDelete] = useState<Reservation | null>(null);
  const [resvCustomerSource, setResvCustomerSource] = useState<'existing' | 'new'>('existing');
  const [resvSelectedPersonId, setResvSelectedPersonId] = useState('');
  const [resvTitle, setResvTitle] = useState('');
  const [resvCustomerName, setResvCustomerName] = useState('');
  const [resvCustomerPhone, setResvCustomerPhone] = useState('');
  const [resvDate, setResvDate] = useState(() => getJalaliDateString());
  const [resvStartTime, setResvStartTime] = useState('18:00');
  const [resvEndTime, setResvEndTime] = useState('20:00');
  const [resvDepositAmount, setResvDepositAmount] = useState('');
  const [resvDepositAccountId, setResvDepositAccountId] = useState(accounts[0]?.id || '');
  const [resvNotes, setResvNotes] = useState('');
  const [resvTableCount, setResvTableCount] = useState<number>(1);
  const [resvLoading, setResvLoading] = useState(false);
  const [convertingResvId, setConvertingResvId] = useState<string | null>(null);

  // Background check for auto-opening due reservations in real-time
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const now = new Date();
        const clientJalaliDate = getJalaliDateString(now);
        const hh = now.getHours().toString().padStart(2, '0');
        const mm = now.getMinutes().toString().padStart(2, '0');
        const res = await api.checkAutoOpenReservations(clientJalaliDate, `${hh}:${mm}`);
        if (res && res.openedCount > 0) {
          onRefresh();
        }
      } catch {
        // ignore background poll errors
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [onRefresh]);

  const isAnyModalOpen = !!(
    selectedTabForAdd ||
    selectedTabForCheckout ||
    selectedTabForEdit ||
    tabToDelete ||
    isNewReservationOpen ||
    editingReservation ||
    reservationToDelete
  );
  useLockBodyScroll(isAnyModalOpen);

  const calculateDuration = (startedAt: string) => {
    const diff = Math.max(0, Date.now() - new Date(startedAt).getTime());
    const totalMinutes = Math.floor(diff / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const remMin = totalMinutes % 60;
    if (hours === 0) return `${remMin} دقیقه`;
    return `${hours} ساعت و ${remMin} دقیقه`;
  };

  // Quick Staging Helpers for adding multiple items to open tab
  const handleAddStagingItem = (product: Product) => {
    setStagingItems((prev) => {
      const idx = prev.findIndex((p) => p.productId === product.id);
      if (idx !== -1) {
        return prev.map((item, i) =>
          i === idx ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.sellPrice,
        },
      ];
    });
  };

  const handleRemoveStagingItem = (productId: string) => {
    setStagingItems((prev) => {
      const existing = prev.find((p) => p.productId === productId);
      if (!existing) return prev;
      if (existing.quantity > 1) {
        return prev.map((p) =>
          p.productId === productId ? { ...p, quantity: p.quantity - 1 } : p
        );
      }
      return prev.filter((p) => p.productId !== productId);
    });
  };

  const handleAddItemSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedTabForAdd) return;

    try {
      setIsAddingItem(true);
      if (addItemType === 'buffet') {
        if (stagingItems.length > 0) {
          for (const item of stagingItems) {
            await onAddItem(selectedTabForAdd.id, {
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            });
          }
        } else {
          const prod = products.find((p) => p.id === selectedProductId);
          if (!prod) return;
          await onAddItem(selectedTabForAdd.id, {
            productId: prod.id,
            productName: prod.name,
            quantity: itemQuantity,
            unitPrice: prod.sellPrice,
          });
        }
      } else {
        if (!customItemName.trim()) return;
        await onAddItem(selectedTabForAdd.id, {
          productName: customItemName.trim(),
          quantity: itemQuantity,
          unitPrice: Number(customItemPrice) || 0,
        });
      }

      setSelectedTabForAdd(null);
      setStagingItems([]);
      setItemQuantity(1);
      setCustomItemName('');
      setCustomItemPrice('');
      setAddItemSearch('');
      setAddItemCategory('all');
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطا در افزودن اقلام');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleQuantityChange = async (tabId: string, item: OpenTabItem, delta: number) => {
    try {
      setUpdatingItemId(item.id);
      if (onUpdateItemQuantity) {
        await onUpdateItemQuantity(tabId, item.id, { delta });
        onRefresh();
      } else {
        if (item.quantity + delta <= 0) {
          await onRemoveItem(tabId, item.id);
        } else {
          // Fallback: update tab items array directly
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) {
            const newItems = tab.items
              .map((it) => {
                if (it.id === item.id) {
                  const newQty = it.quantity + delta;
                  return {
                    ...it,
                    quantity: newQty,
                    totalPrice: it.unitPrice * newQty,
                  };
                }
                return it;
              })
              .filter((it) => it.quantity > 0);
            await onUpdateTab(tabId, { items: newItems });
          }
        }
        onRefresh();
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطا در تغییر تعداد');
    } finally {
      setUpdatingItemId(null);
    }
  };

  // Bidirectional auto-sync payment method & account
  const handleSelectPaymentMethod = (method: 'pos' | 'cash' | 'credit') => {
    setCheckoutPaymentMethod(method);
    if (method === 'cash') {
      const cashAcc =
        accounts.find((a) => a.type === 'cash') ||
        accounts.find((a) => a.name.includes('نقد') || a.name.includes('دخل')) ||
        accounts[0];
      if (cashAcc) setCheckoutAccountId(cashAcc.id);
    } else if (method === 'pos') {
      const posAcc =
        accounts.find((a) => a.isDefault && (a.type === 'pos' || a.type === 'bank')) ||
        accounts.find((a) => a.type === 'pos' || a.type === 'bank') ||
        accounts.find((a) => a.name.includes('پوز') || a.name.includes('کارتخوان')) ||
        accounts[0];
      if (posAcc) setCheckoutAccountId(posAcc.id);
    }
  };

  const handleSelectAccount = (accId: string) => {
    setCheckoutAccountId(accId);
    const acc = accounts.find((a) => a.id === accId);
    if (acc) {
      if (acc.type === 'cash') setCheckoutPaymentMethod('cash');
      else if (acc.type === 'bank' || acc.type === 'pos') setCheckoutPaymentMethod('pos');
    }
  };

  const handleConfirmDeleteTab = async () => {
    if (!tabToDelete) return;
    try {
      setDeleteLoading(true);
      await onDeleteTab(tabToDelete.id);
      setTabToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleReopenClosedTab = async (tabId: string) => {
    if (!onReopenTab) return;
    try {
      setReopenLoadingId(tabId);
      await onReopenTab(tabId);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setReopenLoadingId(null);
    }
  };

  const handleOpenCheckout = (tab: OpenTab) => {
    setSelectedTabForCheckout(tab);
    setCheckoutPersonId(tab.personId || '');
    setCheckoutCustomerSource('existing');
    setCheckoutCustomerName(tab.personName || '');
    setCheckoutCustomerPhone('');
    setCheckoutWithReceipt(false);
    const finalPayable = Math.max(0, tab.totalAmount - (tab.depositAmount || 0));

    const person = tab.personId ? persons.find((p) => p.id === tab.personId) : undefined;
    if (person && person.currentBalance < 0) {
      setCheckoutPaymentMethod('wallet');
      setCheckoutWalletAmount(Math.min(finalPayable, Math.abs(person.currentBalance)));
    } else {
      setCheckoutPaymentMethod('pos');
      setCheckoutWalletAmount(0);
    }

    const defaultPosAcc =
      accounts.find((a) => a.isDefault && (a.type === 'bank' || a.type === 'pos')) ||
      accounts.find((a) => a.type === 'pos' || a.type === 'bank') ||
      accounts[0];
    setCheckoutAccountId(defaultPosAcc?.id || '');
    setCreditLimitWarning(null);

    // Check customer credit limit
    if (person && person.maxCreditLimit) {
      const potentialBalance = person.currentBalance + tab.totalAmount;
      if (potentialBalance > person.maxCreditLimit) {
        setCreditLimitWarning(
          `این مشتری با تسویه نسیه سقف اعتبار مجاز (${formatToman(person.maxCreditLimit)} تومان) را رد خواهد کرد.`
        );
      }
    }
  };

  const handleCheckoutPersonChange = (pId: string) => {
    setCheckoutPersonId(pId);
    if (!selectedTabForCheckout) return;
    const finalPayable = Math.max(0, selectedTabForCheckout.totalAmount - (selectedTabForCheckout.depositAmount || 0));
    const person = persons.find((p) => p.id === pId);
    if (person && person.currentBalance < 0) {
      setCheckoutPaymentMethod('wallet');
      setCheckoutWalletAmount(Math.min(finalPayable, Math.abs(person.currentBalance)));
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTabForCheckout) return;
    const finalPayable = Math.max(0, selectedTabForCheckout.totalAmount - (selectedTabForCheckout.depositAmount || 0));

    const hasCustomer = checkoutPersonId || (checkoutCustomerSource === 'new' && checkoutCustomerName.trim());
    if (checkoutPaymentMethod === 'credit' && !hasCustomer) {
      alert('لطفا شخص یا مشتری را برای تسویه نسیه انتخاب کنید.');
      return;
    }
    if (checkoutPaymentMethod === 'wallet' && !checkoutPersonId) {
      alert('لطفا مشتری دارای موجودی کیف پول را انتخاب کنید.');
      return;
    }

    try {
      setCheckoutLoading(true);
      const isWallet = checkoutPaymentMethod === 'wallet';
      const effWallet = isWallet ? (checkoutWalletAmount > 0 ? checkoutWalletAmount : finalPayable) : 0;
      const isSplit = isWallet && effWallet < finalPayable;
      const finalMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split' = isSplit ? 'split' : checkoutPaymentMethod;
      const finalWalletAmt = isWallet ? effWallet : undefined;
      const finalCashOrPosAmt = isSplit ? finalPayable - effWallet : (isWallet ? 0 : finalPayable);
      const accToUse = (checkoutPaymentMethod === 'credit' || (isWallet && !isSplit)) ? undefined : checkoutAccountId;

      const res = await onCheckoutTab(selectedTabForCheckout.id, {
        paymentMethod: finalMethod,
        walletAmount: finalWalletAmt,
        cashOrPosAmount: finalCashOrPosAmt,
        accountId: accToUse,
        personId: checkoutPersonId || undefined,
        customerName: checkoutCustomerSource === 'new' && checkoutCustomerName.trim() ? checkoutCustomerName.trim() : undefined,
        customerPhone: checkoutCustomerSource === 'new' && checkoutCustomerPhone.trim() ? checkoutCustomerPhone.trim() : undefined,
        date: new Date().toISOString(),
        jalaliDate: getJalaliDateString(),
      });
      setSelectedTabForCheckout(null);
      onRefresh();
      if (checkoutWithReceipt && res && res.transaction) {
        onViewReceipt(res.transaction);
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطا در تسویه حساب میز');
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleOpenEdit = (tab: OpenTab) => {
    setSelectedTabForEdit(tab);
    setEditTitle(tab.title);
    setEditPersonId(tab.personId || '');
    setEditCustomerSource('existing');
    setEditCustomerName(tab.personName || '');
    setEditCustomerPhone('');
    setEditNotes(tab.notes || '');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTabForEdit || !editTitle.trim()) return;

    try {
      setIsSavingEdit(true);
      await onUpdateTab(selectedTabForEdit.id, {
        title: editTitle.trim(),
        personId: editPersonId || undefined,
        customerName: editCustomerSource === 'new' && editCustomerName.trim() ? editCustomerName.trim() : undefined,
        customerPhone: editCustomerSource === 'new' && editCustomerPhone.trim() ? editCustomerPhone.trim() : undefined,
        notes: editNotes.trim() || undefined,
      });
      setSelectedTabForEdit(null);
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطا در ویرایش اطلاعات میز');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Reservation Handlers
  const handleOpenNewReservation = () => {
    setResvTitle('');
    setResvCustomerName('');
    setResvCustomerPhone('');
    setResvSelectedPersonId('');
    setResvCustomerSource('existing');
    setResvTableCount(1);
    setResvDate(getJalaliDateString());
    setResvStartTime('18:00');
    setResvEndTime('20:00');
    setResvDepositAmount('');
    setResvNotes('');
    setIsNewReservationOpen(true);
  };

  const handleReservationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resvTitle.trim() || !resvCustomerName.trim() || !resvStartTime.trim()) {
      alert('لطفا عنوان میز/دستگاه، نام مشتری و ساعت شروع را وارد نمایید.');
      return;
    }
    try {
      setResvLoading(true);
      const data: Partial<Reservation> = {
        title: resvTitle.trim(),
        customerName: resvCustomerName.trim(),
        customerPhone: resvCustomerPhone.trim() || undefined,
        personId: resvSelectedPersonId || undefined,
        tableCount: editingReservation ? 1 : resvTableCount,
        date: resvDate.trim(),
        startTime: resvStartTime.trim(),
        endTime: resvEndTime.trim() || undefined,
        depositAmount: Number(resvDepositAmount) || 0,
        depositAccountId: resvDepositAccountId || undefined,
        notes: resvNotes.trim() || undefined,
      };

      if (editingReservation && onUpdateReservation) {
        await onUpdateReservation(editingReservation.id, data);
        setEditingReservation(null);
      } else if (onCreateReservation) {
        await onCreateReservation(data);
        setIsNewReservationOpen(false);
      }
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطا در ثبت رزرو');
    } finally {
      setResvLoading(false);
    }
  };

  const handleConvertToOpenTab = async (resv: Reservation) => {
    if (!onConvertToTab) return;
    try {
      setConvertingResvId(resv.id);
      await onConvertToTab(resv.id);
      setActiveSubTab('tables');
      onRefresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'خطا در تبدیل رزرو به میز باز');
    } finally {
      setConvertingResvId(null);
    }
  };

  const openTabsList = tabs.filter((t) => t.status === 'open');
  const closedTabsList = tabs.filter((t) => t.status === 'closed');
  const activeReservations = reservations.filter((r) => r.status !== 'cancelled');

  const todayJalali = getJalaliDateString();
  const todayReservations = reservations.filter((r) => !r.date || r.date === todayJalali);
  const futureReservations = reservations.filter((r) => r.date && r.date > todayJalali);
  const displayedReservations =
    resvFilterTab === 'today'
      ? todayReservations
      : resvFilterTab === 'future'
      ? futureReservations
      : reservations;

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-Tab Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              میزها، حساب‌های باز و رزرو جا
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            سفارشات زنده کنسول‌ها، پی‌سی‌ها، اتاق VIP و مدیریت رزرو نوبت گیمرها
          </p>
        </div>

        {/* View Switcher: Active Tables vs Reservations */}
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('tables')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'tables'
                ? 'bg-[#2596BE] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Gamepad2 className="w-4 h-4" />
            <span>میزهای فعال ({openTabsList.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('reservations')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === 'reservations'
                ? 'bg-[#2596BE] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CalendarDays className="w-4 h-4" />
            <span>رزرو نوبت و جا ({activeReservations.length})</span>
          </button>
        </div>
      </div>

      {/* ===================== VIEW 1: ACTIVE & CLOSED TABLES ===================== */}
      {activeSubTab === 'tables' && (
        <div className="space-y-6">
          {/* Active Tabs Grid */}
          {openTabsList.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#111C33] border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <Gamepad2 className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                در حال حاضر هیچ میز یا حساب بازی وجود ندارد
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                برای شروع فاکتور یا باز کردن میز جدید، از دکمه «ثبت سریع» ناوبار استفاده کنید و گزینه «ارسال به میز» را بزنید، یا یک رزرو را تبدیل به میز کنید.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {openTabsList.map((tab) => (
                <div
                  key={tab.id}
                  className="rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col justify-between hover:border-[#2596BE]/60 transition-all"
                >
                  {/* Table Card Header */}
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {tab.title}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                          <Clock className="w-3 h-3 text-[#2596BE]" />
                          <span>شروع: {formatJalaliReadable(tab.startedAt, false)}</span>
                          <span className="text-slate-500 font-sans">
                            ({calculateDuration(tab.startedAt)})
                          </span>
                        </div>
                        {tab.personName && (
                          <div className="flex items-center gap-1.5 text-xs text-[#2596BE] font-semibold pt-0.5">
                            <User className="w-3.5 h-3.5" />
                            <span>مشتری: {tab.personName}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEdit(tab)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="ویرایش عنوان یا مشتری میز"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setTabToDelete(tab)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          title="حذف یا بستن اضطراری میز"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Items List with Increment / Decrement (+ / -) */}
                  <div className="p-4 flex-1 space-y-2 max-h-56 overflow-y-auto">
                    {tab.items.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400 italic">
                        هنوز هیچ کالایی یا تایمی به این میز اضافه نشده است.
                      </div>
                    ) : (
                      tab.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800/60"
                        >
                          <div className="flex items-center gap-2 max-w-[50%] min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                              {item.productName}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {/* Quantity Controls (+ / -) */}
                            <div className="flex items-center gap-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-1 py-0.5">
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(tab.id, item, -1)}
                                className="p-0.5 hover:text-rose-600 text-slate-500 cursor-pointer"
                                title="کاهش تعداد"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="text-[11px] font-bold tabular-nums px-1 text-slate-800 dark:text-slate-200">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleQuantityChange(tab.id, item, 1)}
                                className="p-0.5 hover:text-emerald-600 text-slate-500 cursor-pointer"
                                title="افزایش تعداد"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <span className="font-bold tabular-nums text-slate-900 dark:text-white shrink-0 min-w-[65px] text-left">
                              {formatToman(item.totalPrice)}
                            </span>

                            <button
                              type="button"
                              onClick={async () => {
                                await onRemoveItem(tab.id, item.id);
                                onRefresh();
                              }}
                              className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                              title="حذف این آیتم"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Action Toolbar & Checkout */}
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-900/20 space-y-3">
                    {tab.notes && (
                      <p className="text-[11px] text-slate-400 truncate">
                        یادداشت: {tab.notes}
                      </p>
                    )}
                    {tab.depositAmount && tab.depositAmount > 0 ? (
                      <div className="space-y-1.5 p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>جمع سفارشات:</span>
                          <span className="tabular-nums font-semibold">{formatToman(tab.totalAmount)} تومان</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                          <span>بیعانه قبلی (کسر شده):</span>
                          <span className="tabular-nums font-mono">- {formatToman(tab.depositAmount)} تومان</span>
                        </div>
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-800">
                          <span className="font-bold text-[#2596BE]">مانده قابل تسویه:</span>
                          <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                            {formatToman(Math.max(0, tab.totalAmount - tab.depositAmount))} تومان
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-500 font-medium">مجموع فاکتور میز:</span>
                        <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
                          {formatToman(tab.totalAmount)}
                          <span className="text-xs font-normal text-slate-400 mr-1">تومان</span>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => setSelectedTabForAdd(tab)}
                        className="py-2 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                      >
                        <Plus className="w-3.5 h-3.5 text-[#2596BE]" />
                        <span>افزودن آیتم</span>
                      </button>
                      <button
                        onClick={() => handleOpenCheckout(tab)}
                        disabled={tab.items.length === 0}
                        className="py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>تسویه و بستن</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Closed / Previous Desks Section */}
          {closedTabsList.length > 0 && (
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-[#2596BE]" />
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    میزها و فاکتورهای تسویه شده قبلی ({closedTabsList.length})
                  </h2>
                </div>
                <p className="text-xs text-slate-400">
                  جهت اصلاح، حذف یا بازگشایی مجدد میزهایی که قبلا تسویه شده‌اند
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {closedTabsList.map((ct) => (
                  <div
                    key={ct.id}
                    className="rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                  >
                    <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                          <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200">{ct.title}</h3>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 font-mono">
                          <Clock className="w-3 h-3" />
                          <span>{formatJalaliReadable(ct.startedAt, false)}</span>
                          {ct.personName && (
                            <span className="text-[#2596BE] font-sans font-medium">مشتری: {ct.personName}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">
                        تسویه شده
                      </span>
                    </div>

                    {/* Itemized List */}
                    <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto">
                      <span className="text-[11px] text-slate-400 font-medium block">ریز اقلام ثبت‌شده:</span>
                      {ct.items.map((it) => (
                        <div key={it.id} className="flex items-center justify-between py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300">
                          <span className="truncate">{it.productName} ({it.quantity} عدد)</span>
                          <span className="font-bold tabular-nums text-slate-900 dark:text-white shrink-0">
                            {formatToman(it.totalPrice)}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-400 block">جمع کل:</span>
                        <span className="text-sm font-black text-slate-900 dark:text-white tabular-nums">
                          {formatToman(ct.totalAmount)} تومان
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setTabToDelete(ct)}
                          className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          title="حذف سابقه میز"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        {onReopenTab && (
                          <button
                            type="button"
                            onClick={() => handleReopenClosedTab(ct.id)}
                            disabled={reopenLoadingId === ct.id}
                            className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            title="بازگشایی مجدد میز برای ادیت و اصلاح اقلام و موجودی"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{reopenLoadingId === ct.id ? 'در حال بازگشایی...' : 'بازگشایی و ادیت میز'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== VIEW 2: RESERVATIONS / BOOKINGS ===================== */}
      {activeSubTab === 'reservations' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-[#2596BE]" />
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                لیست نوبت‌ها و رزرو جا
              </h2>
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              {/* Period Switcher Tabs */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => setResvFilterTab('today')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    resvFilterTab === 'today'
                      ? 'bg-[#2596BE] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>نوبت‌های امروز</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    resvFilterTab === 'today' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {todayReservations.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setResvFilterTab('future')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    resvFilterTab === 'future'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>نوبت‌های روزهای آینده</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    resvFilterTab === 'future' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {futureReservations.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setResvFilterTab('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    resvFilterTab === 'all'
                      ? 'bg-slate-800 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span>همه</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    resvFilterTab === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {reservations.length}
                  </span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleOpenNewReservation}
                className="px-4 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت رزرو جدید</span>
              </button>
            </div>
          </div>

          {displayedReservations.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-[#111C33] border border-dashed border-slate-200 dark:border-slate-800 space-y-3">
              <CalendarDays className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {resvFilterTab === 'today'
                  ? 'هیچ نوبتی برای امروز ثبت نشده است'
                  : resvFilterTab === 'future'
                  ? 'هیچ نوبتی برای روزهای آینده ثبت نشده است'
                  : 'در حال حاضر هیچ رزروی ثبت نشده است'}
              </h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                می‌توانید برای مشتریان و گیمرها نوبت کنسول، پی‌سی یا اتاق VIP را با ثبت ساعت و بیعانه رزرو کنید.
              </p>
              <button
                type="button"
                onClick={handleOpenNewReservation}
                className="px-4 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>ثبت رزرو جدید</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayedReservations.map((resv) => (
                <div
                  key={resv.id}
                  className={`rounded-2xl bg-white dark:bg-[#111C33] border p-4 space-y-3 shadow-xs transition-all ${
                    resv.status === 'completed'
                      ? 'border-emerald-500/30 opacity-75'
                      : resv.status === 'cancelled'
                      ? 'border-rose-500/30 opacity-60'
                      : 'border-slate-200 dark:border-slate-800 hover:border-[#2596BE]/60'
                  }`}
                >
                  <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                    <div>
                      <div className="flex items-center flex-wrap gap-1.5">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            resv.status === 'completed'
                              ? 'bg-emerald-500'
                              : resv.status === 'cancelled'
                              ? 'bg-rose-500'
                              : 'bg-amber-500'
                          }`}
                        ></span>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                          {resv.title}
                        </h3>
                        {(resv.groupId || (resv.tableCount && resv.tableCount > 1)) && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20">
                            رزرو گروهی ({resv.tableCount || 'چند'} میز)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 font-semibold mt-1">
                        <User className="w-3.5 h-3.5 text-[#2596BE]" />
                        <span>{resv.customerName}</span>
                      </div>
                      {resv.customerPhone && (
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-0.5">
                          <Phone className="w-3 h-3" />
                          <span>{resv.customerPhone}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          resv.status === 'completed'
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : resv.status === 'cancelled'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {resv.status === 'completed'
                          ? 'تبدیل شده به میز'
                          : resv.status === 'cancelled'
                          ? 'لغو شده'
                          : 'در انتظار نوبت'}
                      </span>
                      {resv.status === 'confirmed' && (
                        <span className="text-[9px] text-teal-600 dark:text-teal-400 flex items-center gap-1 font-semibold">
                          <Sparkles className="w-2.5 h-2.5" />
                          <span>بازگشایی خودکار در موعد</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60">
                    <div>
                      <span className="text-[10px] text-slate-400 block">تاریخ رزرو:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">
                        {resv.date || 'امروز'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">ساعت نوبت:</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                        {resv.startTime} {resv.endTime ? `تا ${resv.endTime}` : ''}
                      </span>
                    </div>
                  </div>

                  {resv.depositAmount > 0 && (
                    <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold">
                      <span>بیعانه پرداختی:</span>
                      <span className="tabular-nums font-mono">{formatToman(resv.depositAmount)} تومان</span>
                    </div>
                  )}

                  {resv.notes && (
                    <p className="text-[11px] text-slate-400 truncate">
                      یادداشت: {resv.notes}
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingReservation(resv);
                          setResvTitle(resv.title);
                          setResvCustomerName(resv.customerName);
                          setResvCustomerPhone(resv.customerPhone || '');
                          setResvDate(resv.date);
                          setResvStartTime(resv.startTime);
                          setResvEndTime(resv.endTime || '');
                          setResvDepositAmount(resv.depositAmount ? String(resv.depositAmount) : '');
                          setResvNotes(resv.notes || '');
                          setIsNewReservationOpen(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        title="ویرایش رزرو"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setReservationToDelete(resv)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="حذف رزرو"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {resv.status !== 'completed' && resv.status !== 'cancelled' && (
                      <button
                        type="button"
                        onClick={() => handleConvertToOpenTab(resv)}
                        disabled={convertingResvId === resv.id}
                        className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                      >
                        {convertingResvId === resv.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>در حال باز کردن میز...</span>
                          </>
                        ) : (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5" />
                            <span>تبدیل به میز فعال</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================== MODALS ===================== */}

      {/* Modal: Rapid Visual Add Item to Tab (مانند ثبت سریع و بوفه) */}
      {selectedTabForAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/65 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#2596BE]/15 text-[#2596BE] flex items-center justify-center font-bold">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    افزودن آیتم و سفارش به {selectedTabForAdd.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    انتخاب آسان و کلیکی از بوفه یا ثبت دستی تایم بازی و خدمات
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTabForAdd(null);
                  setStagingItems([]);
                }}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="px-6 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAddItemType('buffet')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  addItemType === 'buffet'
                    ? 'bg-[#2596BE] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Coffee className="w-4 h-4" />
                <span>کالاهای بوفه و کافه</span>
                {stagingItems.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-white font-mono text-[10px]">
                    {stagingItems.reduce((s, it) => s + it.quantity, 0)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setAddItemType('custom')}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  addItemType === 'custom'
                    ? 'bg-[#2596BE] text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>خدمات / تایم دستی بازی</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              {addItemType === 'buffet' ? (
                <div className="space-y-4">
                  {/* Search and Category Filter Bar */}
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute right-3 top-3 text-slate-400" />
                      <input
                        type="text"
                        value={addItemSearch}
                        onChange={(e) => setAddItemSearch(e.target.value)}
                        placeholder="جستجوی سریع کالا (مثلا هایپ، چیپس، ردمگ، اسنک...)"
                        className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs placeholder:text-slate-400 focus:border-[#2596BE] outline-none"
                      />
                    </div>
                  </div>

                  {/* Category Filter Chips */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setAddItemCategory('all')}
                      className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                        addItemCategory === 'all'
                          ? 'bg-[#2596BE] text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      همه کالاها ({products.length})
                    </button>
                    {Array.from(new Set(products.map((p) => p.category).filter(Boolean))).map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setAddItemCategory(cat)}
                        className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                          addItemCategory === cat
                            ? 'bg-[#2596BE] text-white shadow-2xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Products Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1">
                    {products
                      .filter(
                        (p) =>
                          (addItemCategory === 'all' || p.category === addItemCategory) &&
                          (!addItemSearch.trim() ||
                            p.name.toLowerCase().includes(addItemSearch.toLowerCase()) ||
                            (p.category && p.category.toLowerCase().includes(addItemSearch.toLowerCase())))
                      )
                      .map((p) => {
                        const inStage = stagingItems.find((it) => it.productId === p.id);
                        const stagedQty = inStage ? inStage.quantity : 0;
                        return (
                          <div
                            key={p.id}
                            className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                              stagedQty > 0
                                ? 'border-[#2596BE] bg-[#2596BE]/5 shadow-xs'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-slate-300'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-start justify-between gap-1.5">
                                <h4 className="text-xs font-bold text-slate-900 dark:text-white line-clamp-1">
                                  {p.name}
                                </h4>
                                {p.category && (
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0 font-medium">
                                    {p.category}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-xs pt-1">
                                <span className="font-black text-[#2596BE] tabular-nums">
                                  {formatToman(p.sellPrice)} <span className="text-[10px] font-normal text-slate-400">تومان</span>
                                </span>
                                <span
                                  className={`text-[10px] font-mono ${
                                    p.stock <= 0
                                      ? 'text-rose-500 font-bold'
                                      : p.stock <= 5
                                      ? 'text-amber-500'
                                      : 'text-slate-400'
                                  }`}
                                >
                                  موجودی: {p.stock}
                                </span>
                              </div>
                            </div>

                            {/* Stepper / Add button */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                              {stagedQty > 0 ? (
                                <div className="flex items-center justify-between w-full bg-white dark:bg-slate-800 rounded-xl border border-[#2596BE]/40 px-2 py-1">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveStagingItem(p.id)}
                                    className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <span className="text-xs font-black text-slate-900 dark:text-white tabular-nums">
                                    {stagedQty} عدد
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleAddStagingItem(p)}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded-lg cursor-pointer"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleAddStagingItem(p)}
                                  className="w-full py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#2596BE] hover:text-white text-slate-700 dark:text-slate-300 text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>افزودن</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                /* Custom / Manual Services Tab */
                <div className="space-y-4 max-w-lg mx-auto">
                  {/* Preset quick buttons */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      انتخاب سریع از الگوها:
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-0.5">
                      {(gamingServices.length > 0
                        ? gamingServices.map((s) => ({ title: s.name, price: s.price.toString(), category: s.category }))
                        : [
                            { title: '۱ ساعت PS5', price: '80000', category: 'کرایه کنسول' },
                            { title: '۲ ساعت PS5', price: '150000', category: 'کرایه کنسول' },
                            { title: 'کرایه دسته اضافی', price: '30000', category: 'کرایه کنسول' },
                            { title: '۱ ساعت PC گیمینگ', price: '50000', category: 'PC گیمینگ' },
                          ]
                      ).map((preset) => (
                        <button
                          key={preset.title}
                          type="button"
                          onClick={() => {
                            setCustomItemName(preset.title);
                            setCustomItemPrice(preset.price);
                          }}
                          className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-[#2596BE] text-right text-xs transition-all cursor-pointer"
                        >
                          <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{preset.title}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-[11px] text-[#2596BE] font-mono font-bold">{formatToman(Number(preset.price))} تومان</span>
                            {preset.category && (
                              <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded truncate max-w-[70px]">
                                {preset.category}
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      عنوان خدمت یا بازی *
                    </label>
                    <input
                      type="text"
                      value={customItemName}
                      onChange={(e) => setCustomItemName(e.target.value)}
                      placeholder="مثال: ۲ ساعت تایم بازی یا کرایه دسته"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        مبلغ واحد (تومان) *
                      </label>
                      <input
                        type="number"
                        value={customItemPrice}
                        onChange={(e) => setCustomItemPrice(e.target.value)}
                        placeholder="مبلغ به تومان"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        تعداد
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min="1"
                          value={itemQuantity}
                          onChange={(e) => setItemQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full text-center py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setItemQuantity((q) => q + 1)}
                          className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 px-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                {addItemType === 'buffet' && stagingItems.length > 0 ? (
                  <div className="text-xs">
                    <span className="text-slate-500">مجموع اقلام انتخابی:</span>{' '}
                    <strong className="text-slate-900 dark:text-white font-black tabular-nums">
                      {formatToman(stagingItems.reduce((s, it) => s + it.unitPrice * it.quantity, 0))} تومان
                    </strong>{' '}
                    <span className="text-slate-400">
                      ({stagingItems.reduce((s, it) => s + it.quantity, 0)} قلم کالا)
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">
                    {addItemType === 'buffet'
                      ? 'روی هر کالا علامت + را بزنید تا به میز اضافه شود'
                      : 'مشخصات خدمت را تکمیل کنید و دکمه افزودن را بزنید'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTabForAdd(null);
                    setStagingItems([]);
                  }}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={() => handleAddItemSubmit()}
                  disabled={
                    isAddingItem ||
                    (addItemType === 'buffet'
                      ? stagingItems.length === 0
                      : !customItemName.trim())
                  }
                  className="px-6 py-2.5 bg-[#2596BE] hover:bg-[#1E7E9E] active:scale-[0.98] text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md shadow-[#2596BE]/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  {isAddingItem ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال ثبت اقلام...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {addItemType === 'buffet'
                          ? stagingItems.length > 0
                            ? `ثبت اقلام روی میز (${stagingItems.reduce((s, it) => s + it.quantity, 0)} عدد)`
                            : 'یک کالا انتخاب کنید'
                          : 'افزودن خدمت به میز'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit Tab Details */}
      {selectedTabForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                ویرایش مشخصات میز
              </h2>
              <button
                onClick={() => setSelectedTabForEdit(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام و شناسه میز
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                />
              </div>

              <div>
                <SearchablePersonSelect
                  persons={persons}
                  selectedPersonId={editPersonId}
                  onSelectPerson={(person) => {
                    setEditPersonId(person ? person.id : '');
                    if (person) {
                      setEditCustomerSource('existing');
                      setEditCustomerName(person.name);
                      setEditCustomerPhone(person.phone || '');
                    }
                  }}
                  allowManualNew={true}
                  isManualNew={editCustomerSource === 'new'}
                  manualCustomerName={editCustomerName}
                  manualCustomerPhone={editCustomerPhone}
                  onManualToggle={(isManual) => {
                    setEditCustomerSource(isManual ? 'new' : 'existing');
                    if (isManual) {
                      setEditPersonId('');
                    } else if (persons.length > 0) {
                      setEditPersonId(persons[0].id);
                      setEditCustomerName(persons[0].name);
                      setEditCustomerPhone(persons[0].phone || '');
                    }
                  }}
                  onManualNameChange={(name) => setEditCustomerName(name)}
                  onManualPhoneChange={(phone) => setEditCustomerPhone(phone)}
                  label="مشتری میز"
                  placeholder="جستجوی نام یا شماره تماس..."
                  emptyLabel="میز آزاد"
                  filterType="customer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  یادداشت
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedTabForEdit(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
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

      {/* Modal: Final Checkout of Tab (با سوییچ خودکار صندوق نقد/کارتخوان) */}
      {selectedTabForCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                تسویه حساب نهایی {selectedTabForCheckout.title}
              </h2>
              <button
                onClick={() => setSelectedTabForCheckout(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="p-6 space-y-5">
              {/* Credit Limit Warning Alert */}
              {creditLimitWarning && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{creditLimitWarning}</p>
                </div>
              )}

              {/* Total & Deposit Deduction Breakdown */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">جمع کل سفارشات میز:</span>
                  <span className="font-bold tabular-nums text-slate-800 dark:text-slate-200">
                    {formatToman(selectedTabForCheckout.totalAmount)} تومان
                  </span>
                </div>
                {selectedTabForCheckout.depositAmount && selectedTabForCheckout.depositAmount > 0 ? (
                  <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1.5 rounded-xl border border-emerald-500/20">
                    <span>بیعانه پرداختی در رزرو (کسر از فاکتور):</span>
                    <span className="tabular-nums font-mono">
                      - {formatToman(selectedTabForCheckout.depositAmount)} تومان
                    </span>
                  </div>
                ) : null}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2596BE]">مبلغ خالص قابل دریافت در تسویه:</span>
                  <div className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                    {formatToman(Math.max(0, selectedTabForCheckout.totalAmount - (selectedTabForCheckout.depositAmount || 0)))}
                    <span className="text-xs font-normal text-slate-400 mr-1">تومان</span>
                  </div>
                </div>
              </div>

              {/* Customer Selector & Status Bar */}
              <div>
                <SearchablePersonSelect
                  persons={persons}
                  selectedPersonId={checkoutPersonId}
                  onSelectPerson={(person) => {
                    handleCheckoutPersonChange(person ? person.id : '');
                    if (person) {
                      setCheckoutCustomerSource('existing');
                      setCheckoutCustomerName(person.name);
                      setCheckoutCustomerPhone(person.phone || '');
                    } else {
                      setCheckoutCustomerName('');
                      setCheckoutCustomerPhone('');
                    }
                  }}
                  allowManualNew={true}
                  isManualNew={checkoutCustomerSource === 'new'}
                  manualCustomerName={checkoutCustomerName}
                  manualCustomerPhone={checkoutCustomerPhone}
                  onManualToggle={(isManual) => {
                    setCheckoutCustomerSource(isManual ? 'new' : 'existing');
                    if (isManual) {
                      setCheckoutPersonId('');
                    } else if (persons.length > 0) {
                      setCheckoutPersonId(persons[0].id);
                      setCheckoutCustomerName(persons[0].name);
                      setCheckoutCustomerPhone(persons[0].phone || '');
                    }
                  }}
                  onManualNameChange={(name) => setCheckoutCustomerName(name)}
                  onManualPhoneChange={(phone) => setCheckoutCustomerPhone(phone)}
                  label="مشتری"
                  placeholder="جستجوی نام یا شماره تماس..."
                  emptyLabel="مشتری آزاد"
                  filterType="customer"
                />
              </div>

              {/* Payment Method Switcher - Spacious & Elegant */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5">
                  روش تسویه میز:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'pos', label: 'کارتخوان (POS)', icon: CreditCard },
                    { id: 'cash', label: 'صندوق نقد', icon: Wallet },
                    { id: 'wallet', label: 'کیف پول', icon: Wallet },
                    { id: 'credit', label: 'نسیه', icon: AlertCircle },
                  ].map((m) => {
                    const isSelected = checkoutPaymentMethod === m.id;
                    const checkoutCustomer = persons.find((p) => p.id === checkoutPersonId);
                    const hasWalletCredit = m.id === 'wallet' && checkoutCustomer && checkoutCustomer.currentBalance < 0;

                    const activeClasses =
                      m.id === 'pos'
                        ? 'border-[#2596BE] bg-[#2596BE] text-white shadow-md shadow-[#2596BE]/25 ring-2 ring-[#2596BE]/30'
                        : m.id === 'cash'
                        ? 'border-emerald-600 bg-emerald-600 text-white shadow-md shadow-emerald-600/25 ring-2 ring-emerald-600/30'
                        : m.id === 'wallet'
                        ? 'border-purple-600 bg-purple-600 text-white shadow-md shadow-purple-600/25 ring-2 ring-purple-600/30'
                        : 'border-amber-600 bg-amber-600 text-white shadow-md shadow-amber-600/25 ring-2 ring-amber-600/30';

                    const inactiveClasses = hasWalletCredit
                      ? 'border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 hover:bg-purple-100/70 animate-pulse'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-750';

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectPaymentMethod(m.id as any)}
                        className={`h-11 px-3.5 rounded-2xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 text-center shadow-xs active:scale-[0.98] ${
                          isSelected ? activeClasses : inactiveClasses
                        }`}
                      >
                        <m.icon className="w-4 h-4 shrink-0" />
                        <span className="whitespace-nowrap">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* WALLET PAYMENT CONTROLS */}
              {checkoutPaymentMethod === 'wallet' && (
                <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-2.5 animate-in fade-in">
                  {(() => {
                    const finalPayable = Math.max(0, selectedTabForCheckout.totalAmount - (selectedTabForCheckout.depositAmount || 0));
                    const checkoutCustomer = persons.find(p => p.id === checkoutPersonId);
                    const availableWallet = checkoutCustomer && checkoutCustomer.currentBalance < 0
                      ? Math.abs(checkoutCustomer.currentBalance)
                      : 0;

                    return (
                      <>
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                            <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                              کسر از شارژ کیف پول مشتری
                            </span>
                          </div>
                          {availableWallet > 0 ? (
                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-mono font-bold">
                              (موجودی قابل کسر: {formatToman(availableWallet)} تومان)
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              (موجودی کیف پول این مشتری صفر است)
                            </span>
                          )}
                        </div>

                        {/* Quick action buttons */}
                        <div className="flex items-center gap-1.5 text-xs flex-wrap">
                          <button
                            type="button"
                            onClick={() => setCheckoutWalletAmount(finalPayable)}
                            className="px-2.5 py-1 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 cursor-pointer"
                          >
                            کسر کل مبلغ میز ({formatToman(finalPayable)} ت)
                          </button>
                          {availableWallet > 0 && (
                            <button
                              type="button"
                              onClick={() => setCheckoutWalletAmount(Math.min(finalPayable, availableWallet))}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-bold hover:bg-purple-50 cursor-pointer"
                            >
                              حداکثر موجودی شارژ ({formatToman(Math.min(finalPayable, availableWallet))} ت)
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                              مبلغ کسر از کیف پول (تومان):
                            </label>
                            <input
                              type="number"
                              value={checkoutWalletAmount || ''}
                              onChange={(e) => setCheckoutWalletAmount(Math.max(0, Number(e.target.value) || 0))}
                              placeholder={String(finalPayable)}
                              className="w-full px-3 py-1.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                            />
                          </div>

                          {checkoutWalletAmount < finalPayable && (
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                                واریز مابقی ({formatToman(finalPayable - checkoutWalletAmount)} ت) به:
                              </label>
                              <select
                                value={checkoutAccountId}
                                onChange={(e) => handleSelectAccount(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                              >
                                {accounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Deposit Account Choice (For POS / Cash) */}
              {(checkoutPaymentMethod === 'pos' || checkoutPaymentMethod === 'cash') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    حساب دریافت
                  </label>
                  <select
                    value={checkoutAccountId}
                    onChange={(e) => handleSelectAccount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Debt Notice for Credit */}
              {checkoutPaymentMethod === 'credit' && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    مبلغ خالص این میز به صورت نسیه در پرونده مشتری ثبت خواهد شد.
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setCheckoutWithReceipt(!checkoutWithReceipt)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer shrink-0 flex items-center justify-center ${
                    checkoutWithReceipt
                      ? 'bg-[#2596BE] text-white border-[#2596BE] shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                  title={checkoutWithReceipt ? 'چاپ فیش فعال است' : 'چاپ فیش غیرفعال است (برای فعال‌سازی کلیک کنید)'}
                >
                  <Printer className="w-4 h-4" />
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedTabForCheckout(null)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    انصراف
                  </button>
                  <button
                    type="submit"
                    disabled={checkoutLoading}
                    className={`px-5 py-2.5 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shadow-md disabled:opacity-50 ${
                      checkoutPaymentMethod === 'wallet'
                        ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                        : checkoutPaymentMethod === 'credit'
                        ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                    }`}
                  >
                    {checkoutLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>در حال ثبت تسویه...</span>
                      </>
                    ) : (
                      <>
                        {checkoutPaymentMethod === 'wallet' ? (
                          <Wallet className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )}
                        <span>
                          {checkoutPaymentMethod === 'wallet'
                            ? `کسر از کیف پول (${formatToman(checkoutWalletAmount > 0 ? checkoutWalletAmount : Math.max(0, selectedTabForCheckout.totalAmount - (selectedTabForCheckout.depositAmount || 0)))} ت)`
                            : checkoutWithReceipt
                            ? 'تسویه و چاپ فیش'
                            : 'تسویه نهایی میز'}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Reservation */}
      {isNewReservationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#2596BE]" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editingReservation ? 'ویرایش اطلاعات رزرو' : 'ثبت رزرو نوبت و جا جدید'}
                </h2>
              </div>
              <button
                onClick={() => {
                  setIsNewReservationOpen(false);
                  setEditingReservation(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReservationSubmit} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  عنوان میز / کنسول / اتاق VIP *
                </label>
                <input
                  type="text"
                  value={resvTitle}
                  onChange={(e) => setResvTitle(e.target.value)}
                  placeholder="مثال: میز ۲ (PS5) یا اتاق VIP"
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                />
              </div>

              {/* Station / Table Count Picker (Max 10) */}
              {!editingReservation && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5 text-[#2596BE]" />
                      <span>تعداد میزهای رزرو (حداکثر ۱۰)</span>
                    </label>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-[#2596BE]/10 text-[#2596BE] font-mono">
                      {resvTableCount} میز
                    </span>
                  </div>

                  {/* Buttons 1 through 10 */}
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setResvTableCount(num)}
                        className={`h-8 rounded-lg font-bold text-xs font-mono transition-all cursor-pointer flex items-center justify-center ${
                          resvTableCount === num
                            ? 'bg-[#2596BE] text-white shadow-xs ring-2 ring-[#2596BE]/30'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-[#2596BE]'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  {/* Helper description */}
                  {resvTableCount > 1 ? (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 pt-1.5 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold leading-relaxed">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>
                          {resvTableCount} میز مجزا برای مشتری «{resvCustomerName || 'مشتری اصلی'}» ایجاد می‌شود و همگی در ساعت {resvStartTime || 'شروع'} خودکار باز می‌شوند.
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        عنوان میزها: {resvTitle ? `${resvTitle} (میز ۱ از ${resvTableCount}) تا (میز ${resvTableCount} از ${resvTableCount})` : `میز ۱ از ${resvTableCount} ...`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] text-slate-400">
                      یک میز مستقل ثبت شده و در زمان مقرر اتوماتیک به میز فعال تبدیل می‌شود.
                    </p>
                  )}
                </div>
              )}

              {/* Customer selection / quick pick */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <SearchablePersonSelect
                  persons={persons}
                  selectedPersonId={resvSelectedPersonId}
                  onSelectPerson={(person) => {
                    if (person) {
                      setResvCustomerSource('existing');
                      setResvSelectedPersonId(person.id);
                      setResvCustomerName(person.name);
                      setResvCustomerPhone(person.phone || '');
                    } else {
                      setResvSelectedPersonId('');
                      setResvCustomerName('');
                      setResvCustomerPhone('');
                    }
                  }}
                  allowManualNew={true}
                  isManualNew={resvCustomerSource === 'new'}
                  manualCustomerName={resvCustomerName}
                  manualCustomerPhone={resvCustomerPhone}
                  onManualToggle={(isManual) => {
                    setResvCustomerSource(isManual ? 'new' : 'existing');
                    if (isManual) {
                      setResvSelectedPersonId('');
                    } else if (persons.length > 0) {
                      setResvSelectedPersonId(persons[0].id);
                      setResvCustomerName(persons[0].name);
                      setResvCustomerPhone(persons[0].phone || '');
                    }
                  }}
                  onManualNameChange={(name) => setResvCustomerName(name)}
                  onManualPhoneChange={(phone) => setResvCustomerPhone(phone)}
                  label="مشتری *"
                  placeholder="جستجوی نام یا شماره تماس..."
                  emptyLabel="بدون انتخاب مشتری"
                  filterType="customer"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    تاریخ شمسی
                  </label>
                  <input
                    type="text"
                    value={resvDate}
                    onChange={(e) => setResvDate(e.target.value)}
                    placeholder="1404/07/22"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ساعت شروع *
                  </label>
                  <input
                    type="text"
                    value={resvStartTime}
                    onChange={(e) => setResvStartTime(e.target.value)}
                    placeholder="18:00"
                    required
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    ساعت پایان
                  </label>
                  <input
                    type="text"
                    value={resvEndTime}
                    onChange={(e) => setResvEndTime(e.target.value)}
                    placeholder="20:00"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono text-center"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مبلغ بیعانه (تومان)
                  </label>
                  <input
                    type="number"
                    value={resvDepositAmount}
                    onChange={(e) => setResvDepositAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    واریز بیعانه به
                  </label>
                  <select
                    value={resvDepositAccountId}
                    onChange={(e) => setResvDepositAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  یادداشت و جزئیات بازی
                </label>
                <input
                  type="text"
                  value={resvNotes}
                  onChange={(e) => setResvNotes(e.target.value)}
                  placeholder="مثال: مسابقه دونفره فیفا با ۲ دسته اضافه"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewReservationOpen(false);
                    setEditingReservation(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={resvLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  {resvLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>در حال ثبت...</span>
                    </>
                  ) : (
                    <span>{editingReservation ? 'ذخیره تغییرات' : 'ثبت قطعی رزرو'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Delete Tab */}
      <ConfirmModal
        isOpen={!!tabToDelete}
        title="حذف سابقه میز"
        message={`آیا مطمئن هستید که می‌خواهید "${tabToDelete?.title}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDeleteTab}
        onClose={() => setTabToDelete(null)}
      />

      {/* Confirmation Modal: Delete Reservation */}
      <ConfirmModal
        isOpen={!!reservationToDelete}
        title="حذف نوبت رزرو"
        message={`آیا مطمئن هستید که می‌خواهید رزرو "${reservationToDelete?.title}" برای "${reservationToDelete?.customerName}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        onConfirm={async () => {
          if (reservationToDelete && onDeleteReservation) {
            await onDeleteReservation(reservationToDelete.id);
            setReservationToDelete(null);
            onRefresh();
          }
        }}
        onClose={() => setReservationToDelete(null)}
      />
    </div>
  );
};
