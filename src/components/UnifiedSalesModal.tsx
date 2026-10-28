import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ShoppingCart,
  Coins,
  Search,
  Plus,
  Minus,
  Trash2,
  CheckCircle2,
  Gamepad2,
  Coffee,
  AlertCircle,
  Loader2,
  Sparkles,
  ChevronDown,
  ArrowDownLeft,
  Wallet,
  Phone,
  CreditCard,
  Printer,
  Layers,
} from 'lucide-react';
import { Account, Category, GameNetSettings, GamingServiceItem, OpenTab, Person, Product, Transaction } from '../types/index.ts';
import {
  formatToman,
  getJalaliDateString,
  normalizeDigits,
  parseTomanInput,
} from '../utils/jalali.ts';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';
import { SearchablePersonSelect } from './SearchablePersonSelect.tsx';

interface UnifiedSalesModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  accounts: Account[];
  categories: Category[];
  persons: Person[];
  openTabs: OpenTab[];
  settings?: GameNetSettings;
  gamingServices?: GamingServiceItem[];
  onInstantCheckout: (data: {
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
    customerName?: string;
    customerPhone?: string;
    description?: string;
    categoryId?: string;
    date: string;
    jalaliDate: string;
    paymentMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
    walletAmount?: number;
    cashOrPosAmount?: number;
    tableOption?: 'none' | 'new' | 'existing';
    tableTitle?: string;
    existingTabId?: string;
  }) => Promise<{ transaction: Transaction; tab?: OpenTab }>;
  onAddItemToTab: (
    tabId: string,
    data: { productId?: string; productName?: string; quantity: number; unitPrice?: number }
  ) => Promise<unknown>;
  onCreateTab: (data: {
    title: string;
    personId?: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
  }) => Promise<OpenTab>;
  onViewReceipt: (tx: Transaction) => void;
  onRefresh: () => void;
  onNavigateToTabs?: () => void;
}

interface CartItem {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isBuffet: boolean;
}

export const UnifiedSalesModal: React.FC<UnifiedSalesModalProps> = ({
  isOpen,
  onClose,
  products,
  accounts,
  categories,
  persons,
  openTabs,
  settings,
  gamingServices = [],
  onInstantCheckout,
  onAddItemToTab,
  onCreateTab,
  onViewReceipt,
  onRefresh,
  onNavigateToTabs,
}) => {
  const [activeMode, setActiveMode] = useState<'items' | 'manual' | 'expense'>('items');

  // Items / Buffet / Gaming Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>('all');
  const [selectedGamingCategory, setSelectedGamingCategory] = useState<string>('all');
  const [itemsCategoryId, setItemsCategoryId] = useState<string>('auto');
  const [showDeskAndCategory, setShowDeskAndCategory] = useState<boolean>(false);

  const hasGamingItems = useMemo(
    () => cart.some((it) => !it.productId || it.isBuffet === false),
    [cart]
  );
  const hasBuffetItems = useMemo(
    () => cart.some((it) => !!it.productId || it.isBuffet === true),
    [cart]
  );
  const isMixedItems = hasGamingItems && hasBuffetItems;

  useLockBodyScroll(isOpen);

  // Manual Income Entry (کاملاً تفکیک شده از هزینه)
  const [manualAmountRaw, setManualAmountRaw] = useState('');
  const [manualCategoryId, setManualCategoryId] = useState('');
  const [manualDescription, setManualDescription] = useState('');

  // Expense Entry (کاملاً مستقل و تفکیک شده از درآمد دستی و فاکتور)
  const [expenseAmountRaw, setExpenseAmountRaw] = useState('');
  const [expenseCategoryId, setExpenseCategoryId] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAccountId, setExpenseAccountId] = useState(
    () => accounts.find((a) => a.type === 'cash')?.id || accounts[0]?.id || ''
  );
  const [expensePersonId, setExpensePersonId] = useState('');

  // Active open tabs only (exclude closed tables like former tabs)
  const activeTabs = useMemo(() => openTabs.filter((t) => t.status === 'open'), [openTabs]);

  // Helper: Find lowest available desk number: میز ۱, میز ۲, میز ۳...
  const getNextTableTitle = (tabs: OpenTab[]) => {
    const openNumSet = new Set<number>();
    tabs.forEach((t) => {
      const m = t.title.match(/میز\s*(\d+|[۰-۹]+)/);
      if (m) {
        const num = parseInt(m[1].replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))), 10);
        if (!isNaN(num) && num > 0) openNumSet.add(num);
      }
    });
    let i = 1;
    while (openNumSet.has(i)) i++;
    return `میز ${i}`;
  };

  // Payment & Customer Setup
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [customerSource, setCustomerSource] = useState<'existing' | 'new'>('existing');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'pos' | 'cash' | 'credit' | 'wallet'>('pos');
  const [walletAmount, setWalletAmount] = useState<number>(0);
  const [customJalaliDate, setCustomJalaliDate] = useState(() => getJalaliDateString());
  const [expenseJalaliDate, setExpenseJalaliDate] = useState(() => getJalaliDateString());
  const [shouldPrintReceipt, setShouldPrintReceipt] = useState(false);


  // "Send to Open Tab" state
  const [showSendToTabChoice, setShowSendToTabChoice] = useState(false);
  const [targetTabOption, setTargetTabOption] = useState<'existing' | 'new'>('new');
  const [selectedTabId, setSelectedTabId] = useState<string>('');
  const [newTabTitle, setNewTabTitle] = useState('');
  const [tabNotes, setTabNotes] = useState('');

  // Loading & Feedback
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-detect open desk or suggest new sequential desk when person is selected
  const handlePersonChange = (personId: string) => {
    setSelectedPersonId(personId);
    if (!personId) {
      setTargetTabOption('new');
      setNewTabTitle(getNextTableTitle(activeTabs));
      return;
    }
    const person = persons.find((p) => p.id === personId);
    // If person has wallet balance (< 0), auto select wallet method!
    if (person && person.currentBalance < 0) {
      setPaymentMethod('wallet');
      setWalletAmount(Math.abs(person.currentBalance));
    }
    const existingPersonTab = activeTabs.find(
      (t) => t.personId === personId
    );
    if (existingPersonTab) {
      setTargetTabOption('existing');
      setSelectedTabId(existingPersonTab.id);
    } else {
      setTargetTabOption('new');
      setNewTabTitle(`${getNextTableTitle(activeTabs)} (${person ? person.name : ''})`);
    }
  };

  // Bidirectional auto-sync: when payment method changes, automatically select the corresponding account!
  const handleSelectPaymentMethod = (m: 'pos' | 'cash' | 'credit' | 'wallet') => {
    setPaymentMethod(m);
    if (m === 'cash') {
      const cashAcc =
        accounts.find((a) => a.type === 'cash') ||
        accounts.find((a) => a.name.includes('نقد') || a.name.includes('دخل')) ||
        accounts[0];
      if (cashAcc) setSelectedAccountId(cashAcc.id);
    } else if (m === 'pos') {
      const posAcc =
        accounts.find((a) => a.isDefault && (a.type === 'pos' || a.type === 'bank')) ||
        accounts.find((a) => a.type === 'pos' || a.type === 'bank') ||
        accounts.find((a) => a.name.includes('پوز') || a.name.includes('کارتخوان')) ||
        accounts[0];
      if (posAcc) setSelectedAccountId(posAcc.id);
    }
  };

  // Bidirectional auto-sync: when account changes, automatically update payment method!
  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    const acc = accounts.find((a) => a.id === accId);
    if (acc) {
      if (acc.type === 'cash') setPaymentMethod('cash');
      else if (acc.type === 'pos' || acc.type === 'bank') setPaymentMethod('pos');
    }
  };

  // Initialize defaults on open
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setCart([]);
      setProductSearch('');
      setManualAmountRaw('');
      setManualDescription('');
      setShowSendToTabChoice(false);
      setSelectedPersonId('');
      setCustomerSource('existing');
      setManualCustomerName('');
      setManualCustomerPhone('');
      setWalletAmount(0);
      setShowDeskAndCategory(false);

      // Default to opening next sequential available desk: میز ۱, میز ۲...
      const nextDesk = getNextTableTitle(activeTabs);
      setTargetTabOption('new');
      setNewTabTitle(nextDesk);
      if (activeTabs.length > 0) setSelectedTabId(activeTabs[0].id);

      // Default to default POS account
      const defAcc =
        accounts.find((a) => a.isDefault && a.type === 'pos') ||
        accounts.find((a) => a.type === 'pos') ||
        accounts[0];
      if (defAcc) {
        setSelectedAccountId(defAcc.id);
        setPaymentMethod(defAcc.type === 'cash' ? 'cash' : 'pos');
      }

      const incomeCats = categories.filter((c) => c.type === 'income');
      if (incomeCats.length > 0) setManualCategoryId(incomeCats[0].id);

      // Initialize expense defaults
      setExpenseAmountRaw('');
      setExpenseDescription('');
      setExpensePersonId('');
      setExpenseJalaliDate(getJalaliDateString());
      setCustomJalaliDate(getJalaliDateString());
      const expCats = categories.filter((c) => c.type === 'expense');
      if (expCats.length > 0) setExpenseCategoryId(expCats[0].id);
      const cashAcc = accounts.find((a) => a.type === 'cash') || accounts[0];
      if (cashAcc) setExpenseAccountId(cashAcc.id);
    }
  }, [isOpen, accounts, categories, activeTabs]);


  // Keyboard shortcut Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Product Categories
  const productCats = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category)));
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedProductCategory !== 'all' && p.category !== selectedProductCategory) return false;
      if (productSearch.trim()) {
        const q = productSearch.toLowerCase().trim();
        return p.name.toLowerCase().includes(q) || (p.barcode && p.barcode.includes(q));
      }
      return true;
    });
  }, [products, selectedProductCategory, productSearch]);

  // Dynamic gaming services & presets (editable in Buffet/Inventory tab)
  const effectiveGamingServices: GamingServiceItem[] = useMemo(() => {
    if (gamingServices && gamingServices.length > 0) {
      return gamingServices;
    }
    return [
      { id: 'srv_ps5_1h', name: '۱ ساعت PS5', price: 80000, category: 'کرایه کنسول', createdAt: '' },
      { id: 'srv_ps5_2h', name: '۲ ساعت PS5', price: 150000, category: 'کرایه کنسول', createdAt: '' },
      { id: 'srv_ps5_extra', name: 'کرایه دسته اضافی', price: 30000, category: 'کرایه کنسول', createdAt: '' },
      { id: 'srv_pc_1h', name: '۱ ساعت PC گیمینگ', price: 50000, category: 'PC گیمینگ', createdAt: '' },
      { id: 'srv_pc_2h', name: '۲ ساعت PC گیمینگ', price: 95000, category: 'PC گیمینگ', createdAt: '' },
      { id: 'srv_vip_1h', name: '۱ ساعت اتاق VIP', price: 250000, category: 'اتاق VIP', createdAt: '' },
      { id: 'srv_id_50', name: 'شارژ آیدی (۵۰ هزار ت)', price: 50000, category: 'آیدی و اکانت', createdAt: '' },
      { id: 'srv_id_100', name: 'شارژ آیدی (۱۰۰ هزار ت)', price: 100000, category: 'آیدی و اکانت', createdAt: '' },
    ];
  }, [gamingServices]);

  const gamingCategories = useMemo(() => {
    return Array.from(new Set(effectiveGamingServices.map((s) => s.category).filter(Boolean)));
  }, [effectiveGamingServices]);

  const filteredGamingServices = useMemo(() => {
    if (selectedGamingCategory === 'all') return effectiveGamingServices;
    return effectiveGamingServices.filter((s) => s.category === selectedGamingCategory);
  }, [effectiveGamingServices, selectedGamingCategory]);

  // Cart operations
  const addToCartProduct = (p: Product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === p.id);
      if (existing) {
        if (existing.quantity >= p.stock) {
          setError(`موجودی کالا (${p.stock} عدد) کافی نیست.`);
          return prev;
        }
        return prev.map((item) =>
          item.productId === p.id
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice,
              }
            : item
        );
      }
      if (p.stock <= 0) {
        setError('موجودی این کالا به اتمام رسیده است.');
        return prev;
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          quantity: 1,
          unitPrice: p.sellPrice,
          totalPrice: p.sellPrice,
          isBuffet: true,
        },
      ];
    });
  };

  const addGamingPresetToCart = (preset: { name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((item) => !item.productId && item.name === preset.name);
      if (existing) {
        return prev.map((item) =>
          !item.productId && item.name === preset.name
            ? {
                ...item,
                quantity: item.quantity + 1,
                totalPrice: (item.quantity + 1) * item.unitPrice,
              }
            : item
        );
      }
      return [
        ...prev,
        {
          name: preset.name,
          quantity: 1,
          unitPrice: preset.price,
          totalPrice: preset.price,
          isBuffet: false,
        },
      ];
    });
  };

  const updateCartQty = (idx: number, delta: number) => {
    setCart((prev) => {
      const item = prev[idx];
      if (!item) return prev;
      const newQty = item.quantity + delta;
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      if (item.productId) {
        const prod = products.find((p) => p.id === item.productId);
        if (prod && newQty > prod.stock) {
          alert(`موجودی کالا (${prod.stock} عدد) کافی نیست.`);
          return prev;
        }
      }
      return prev.map((it, i) =>
        i === idx
          ? {
              ...it,
              quantity: newQty,
              totalPrice: newQty * it.unitPrice,
            }
          : it
      );
    });
  };

  const removeCartItem = (idx: number) => {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  };

  // Grand totals
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0);
  }, [cart]);

  const parsedManualAmount = parseTomanInput(manualAmountRaw);
  const parsedExpenseAmount = parseTomanInput(expenseAmountRaw);
  const grandAmount =
    activeMode === 'items'
      ? cartTotal
      : activeMode === 'expense'
      ? parsedExpenseAmount
      : parsedManualAmount;

  // Selected Person details
  const selectedPerson = persons.find((p) => p.id === selectedPersonId);
  const creditLimit = selectedPerson?.maxCreditLimit || 500000;
  const isCreditExceeded =
    activeMode !== 'expense' &&
    paymentMethod === 'credit' &&
    selectedPerson &&
    selectedPerson.currentBalance + grandAmount > creditLimit;

  // ================= 1. INSTANT CHECKOUT (تسویه فوری) =================
  const handleInstantCheckout = async () => {
    if (grandAmount <= 0) {
      setError('مبلغ یا آیتمی جهت ثبت انتخاب نشده است.');
      return;
    }

    if (activeMode === 'expense') {
      if (!expenseAccountId) {
        setError('لطفا حساب یا صندوق پرداخت هزینه را انتخاب کنید.');
        return;
      }
    } else {
      if (paymentMethod === 'wallet') {
        if (customerSource === 'new' || !selectedPersonId) {
          setError('برای پرداخت از طریق کیف پول، انتخاب مشتری ثبت‌شده دارای شارژ الزامی است.');
          return;
        }
        const effWallet = walletAmount > 0 ? walletAmount : grandAmount;
        if (effWallet < grandAmount && !selectedAccountId) {
          setError('لطفا حساب یا صندوق را جهت دریافت مابقی مبلغ فاکتور انتخاب کنید.');
          return;
        }
      } else if (paymentMethod !== 'credit' && !selectedAccountId) {
        setError('لطفا حساب یا صندوق واریز را انتخاب کنید.');
        return;
      }
      if (paymentMethod === 'credit') {
        if (customerSource === 'existing' && !selectedPersonId) {
          setError('برای پرداخت نسیه، انتخاب شخص بدهکار الزامی است.');
          return;
        }
        if (customerSource === 'new' && !manualCustomerName.trim()) {
          setError('برای پرداخت نسیه، وارد کردن نام مشتری الزامی است.');
          return;
        }
      }
    }

    try {
      setLoading(true);
      setError(null);
      const nowIso = new Date().toISOString();
      const jalaliDate = getJalaliDateString();
      let res;

      const isWallet = paymentMethod === 'wallet';
      const effWallet = isWallet ? (walletAmount > 0 ? walletAmount : grandAmount) : 0;
      const isSplit = isWallet && effWallet < grandAmount;
      const finalMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split' = isSplit ? 'split' : paymentMethod;
      const finalWalletAmt = isWallet ? effWallet : undefined;
      const finalCashOrPosAmt = isSplit ? grandAmount - effWallet : (isWallet ? 0 : grandAmount);
      const accToUse = (paymentMethod === 'credit' || (isWallet && !isSplit)) ? undefined : selectedAccountId;

      const customerNameVal = customerSource === 'new' ? manualCustomerName.trim() : selectedPerson?.name;
      const personIdVal = customerSource === 'existing' ? (selectedPersonId || undefined) : undefined;
      const newCustomerNameVal = customerSource === 'new' ? (manualCustomerName.trim() || undefined) : undefined;
      const newCustomerPhoneVal = customerSource === 'new' ? (manualCustomerPhone.trim() || undefined) : undefined;

      if (activeMode === 'expense') {
        const cat = categories.find((c) => c.id === expenseCategoryId);
        const payee = persons.find((p) => p.id === expensePersonId);
        res = await onInstantCheckout({
          type: 'expense',
          amount: grandAmount,
          accountId: expenseAccountId || undefined,
          personId: expensePersonId || undefined,
          paymentMethod: 'cash',
          description:
            expenseDescription.trim() ||
            `هزینه ${cat?.name || 'متفرقه'}${payee ? ` (${payee.name})` : ''}`,
          categoryId: expenseCategoryId || undefined,
          date: nowIso,
          jalaliDate: expenseJalaliDate || jalaliDate,
        });

      } else if (activeMode === 'items') {
        const allCartItems = cart.map((it) => ({
          productId: it.productId,
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          isBuffet: it.isBuffet,
        }));
        const itemsDesc = cart.map((it) => `${it.name} × ${it.quantity}`).join(' + ');
        const deskTitleToUse =
          targetTabOption === 'new'
            ? newTabTitle.trim() || getNextTableTitle(activeTabs)
            : activeTabs.find((t) => t.id === selectedTabId)?.title || 'میز تسویه درجا';

        res = await onInstantCheckout({
          type: 'income',
          items: allCartItems,
          amount: grandAmount,
          accountId: accToUse,
          personId: personIdVal,
          customerName: newCustomerNameVal,
          customerPhone: newCustomerPhoneVal,
          paymentMethod: finalMethod,
          walletAmount: finalWalletAmt,
          cashOrPosAmount: finalCashOrPosAmt,
          description: `فروش: ${itemsDesc}${customerNameVal ? ` (${customerNameVal})` : ''}`,
          categoryId: itemsCategoryId === 'auto' ? undefined : itemsCategoryId,
          date: nowIso,
          jalaliDate: customJalaliDate || jalaliDate,
          tableOption: targetTabOption,
          tableTitle: deskTitleToUse,
          existingTabId: targetTabOption === 'existing' ? selectedTabId : undefined,
        });
      } else {
        const cat = categories.find((c) => c.id === manualCategoryId);
        const deskTitleToUse =
          targetTabOption === 'new'
            ? newTabTitle.trim() || getNextTableTitle(activeTabs)
            : activeTabs.find((t) => t.id === selectedTabId)?.title;

        res = await onInstantCheckout({
          type: 'income',
          amount: grandAmount,
          accountId: accToUse,
          personId: personIdVal,
          customerName: newCustomerNameVal,
          customerPhone: newCustomerPhoneVal,
          paymentMethod: finalMethod,
          walletAmount: finalWalletAmt,
          cashOrPosAmount: finalCashOrPosAmt,
          description:
            manualDescription.trim() ||
            `درآمد ${cat?.name || 'متفرقه'}${customerNameVal ? ` - ${customerNameVal}` : ''}`,
          categoryId: manualCategoryId || undefined,
          date: nowIso,
          jalaliDate: customJalaliDate || jalaliDate,
          tableOption: targetTabOption,
          tableTitle: deskTitleToUse,
          existingTabId: targetTabOption === 'existing' ? selectedTabId : undefined,
        });
      }

      onRefresh();
      onClose();
      if (onNavigateToTabs) onNavigateToTabs();
      if (shouldPrintReceipt && res && res.transaction) {
        onViewReceipt(res.transaction);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطا در ثبت تراکنش');
    } finally {
      setLoading(false);
    }
  };

  // ================= 2. SEND TO OPEN DESK TAB (ارسال به میز) =================
  const handleSendToOpenTab = async () => {
    if (grandAmount <= 0) {
      setError('مبلغ یا سفارشی برای ارسال به میز وجود ندارد.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      let targetTabId = selectedTabId;

      if (targetTabOption === 'new' || activeTabs.length === 0) {
        const titleToUse = newTabTitle.trim() || getNextTableTitle(activeTabs);
        const createdTab = await onCreateTab({
          title: titleToUse,
          personId: customerSource === 'existing' ? (selectedPersonId || undefined) : undefined,
          customerName: customerSource === 'new' ? (manualCustomerName.trim() || undefined) : undefined,
          customerPhone: customerSource === 'new' ? (manualCustomerPhone.trim() || undefined) : undefined,
          notes: tabNotes.trim() || undefined,
        });
        targetTabId = createdTab.id;
      }

      if (activeMode === 'items') {
        for (const item of cart) {
          await onAddItemToTab(targetTabId, {
            productId: item.productId,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
        }
      } else {
        const cat = categories.find((c) => c.id === manualCategoryId);
        await onAddItemToTab(targetTabId, {
          productName: manualDescription.trim() || `درآمد / ${cat?.name || 'خدمات گیم‌نت'}`,
          quantity: 1,
          unitPrice: grandAmount,
        });
      }

      onRefresh();
      onClose();
      if (onNavigateToTabs) onNavigateToTabs();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'خطا در ارسال به میز');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-xs overscroll-contain animate-in fade-in duration-150">

      <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh]">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2596BE]/15 text-[#2596BE] flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                ثبت سریع فروش، درآمد و فاکتور — {settings?.name || 'نکسوس آرنا'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تسویه نقدی/کارتخوان درجا یا ارسال مستقیم به حساب میز
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector (Items vs Quick Income vs Expense) */}
        <div className="px-6 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveMode('items')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeMode === 'items'
                ? 'bg-[#2596BE] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>انتخاب کالا و بازی (اقلامی)</span>
            {cart.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-white font-mono text-[10px]">
                {cart.length}
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setActiveMode('manual');
              const incCats = categories.filter((c) => c.type === 'income');
              if (incCats.length > 0 && !manualCategoryId) setManualCategoryId(incCats[0].id);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeMode === 'manual'
                ? 'bg-[#2596BE] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>ثبت مبلغ دستی درآمد</span>
          </button>
          <button
            onClick={() => {
              setActiveMode('expense');
              const expCats = categories.filter((c) => c.type === 'expense');
              if (expCats.length > 0 && !expenseCategoryId) setExpenseCategoryId(expCats[0].id);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
              activeMode === 'expense'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4 text-rose-300" />
            <span>ثبت هزینه (خروجی دخل)</span>
          </button>

        </div>

        {/* Modal Main Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* MODE 1: ITEMS (Buffet & Console/Gaming presets) */}
          {activeMode === 'items' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left Column: Product & Gaming Picker */}
              <div className="lg:col-span-7 space-y-4">
                {/* Gaming Session & ID / Account Quick Buttons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Gamepad2 className="w-4 h-4 text-[#2596BE]" />
                      <span>کرایه کنسول و خدمات آیدی:</span>
                    </span>
                    {gamingCategories.length > 1 && (
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-xs">
                        <button
                          type="button"
                          onClick={() => setSelectedGamingCategory('all')}
                          className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                            selectedGamingCategory === 'all'
                              ? 'bg-[#2596BE] text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          همه ({effectiveGamingServices.length})
                        </button>
                        {gamingCategories.map((gCat) => (
                          <button
                            key={gCat}
                            type="button"
                            onClick={() => setSelectedGamingCategory(gCat)}
                            className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                              selectedGamingCategory === gCat
                                ? 'bg-[#2596BE] text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                            }`}
                          >
                            {gCat}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-0.5">
                    {filteredGamingServices.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => addGamingPresetToCart({ name: preset.name, price: preset.price })}
                        className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 hover:border-[#2596BE] hover:bg-[#2596BE]/10 text-right transition-all cursor-pointer group"
                        title={preset.description || preset.name}
                      >
                        <span className="text-xs font-bold block text-slate-800 dark:text-white truncate">
                          {preset.name}
                        </span>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-[#2596BE] font-bold font-mono">
                            {formatToman(preset.price)} تومان
                          </span>
                          {preset.category && (
                            <span className="text-[9px] text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-1 py-0.2 rounded truncate max-w-[65px]">
                              {preset.category}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Buffet Search & Categories */}
                <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                      <Coffee className="w-4 h-4 text-[#2596BE]" />
                      <span>کالاهای بوفه:</span>
                    </span>
                    <div className="relative w-44">
                      <Search className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        placeholder="جستجو در بوفه..."
                        className="w-full pl-2 pr-8 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                      />
                    </div>
                  </div>

                  {/* Category Pills */}
                  <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedProductCategory('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                        selectedProductCategory === 'all'
                          ? 'bg-[#2596BE] text-white font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      همه ({products.length})
                    </button>
                    {productCats.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedProductCategory(cat)}
                        className={`px-2.5 py-1 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                          selectedProductCategory === cat
                            ? 'bg-[#2596BE] text-white font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Product Cards Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                    {filteredProducts.map((p) => {
                      const inCart = cart.find((it) => it.productId === p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => addToCartProduct(p)}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                            inCart
                              ? 'border-[#2596BE] bg-[#2596BE]/10'
                              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-[#2596BE]/40'
                          }`}
                        >
                          <div>
                            <span className="text-xs font-bold block text-slate-800 dark:text-white line-clamp-1">
                              {p.name}
                            </span>
                            <span className="text-[10px] text-slate-400">موجودی: {p.stock} {p.unit}</span>
                          </div>
                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-bold font-mono text-[#2596BE]">
                              {formatToman(p.sellPrice)} تومان
                            </span>
                            {inCart && (
                              <span className="w-5 h-5 rounded-full bg-[#2596BE] text-white text-[11px] font-bold flex items-center justify-center">
                                {inCart.quantity}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Basket Summary */}
              <div className="lg:col-span-5 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                      <ShoppingCart className="w-4 h-4 text-[#2596BE]" />
                      <span>سبد فاکتور انتخابی</span>
                    </span>
                    {cart.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setCart([])}
                        className="text-[11px] text-rose-500 hover:underline cursor-pointer"
                      >
                        خالی کردن سبد
                      </button>
                    )}
                  </div>

                  {cart.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 space-y-2">
                      <ShoppingCart className="w-8 h-8 mx-auto opacity-40" />
                      <p className="text-xs">هنوز آیتمی انتخاب نشده است.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 mt-3">
                      {cart.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div className="flex-1 min-w-0 pr-1">
                            <span className="font-bold block truncate text-slate-800 dark:text-white">
                              {item.name}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatToman(item.unitPrice)} تومان
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateCartQty(idx, -1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center font-bold tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updateCartQty(idx, 1)}
                              className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 flex items-center justify-center cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeCartItem(idx)}
                              className="text-slate-400 hover:text-rose-500 p-1 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Subtotal */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-baseline justify-between">
                  <span className="text-xs text-slate-500 font-medium">مجموع اقلام:</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                    {formatToman(cartTotal)} تومان
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* MODE 2: MANUAL AMOUNT (Income) */}
          {activeMode === 'manual' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  مبلغ درآمد (تومان)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={manualAmountRaw ? Number(manualAmountRaw).toLocaleString('en-US') : ''}
                    onChange={(e) =>
                      setManualAmountRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))
                    }
                    placeholder="مبلغ را وارد کنید"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-base font-bold tabular-nums"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    تومان
                  </span>
                </div>
                {/* Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[50000, 100000, 150000, 200000, 500000, 1000000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setManualAmountRaw(amt.toString())}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#2596BE]/15 hover:text-[#2596BE] text-slate-600 dark:text-slate-300 text-xs font-mono font-medium transition-colors cursor-pointer"
                    >
                      {formatToman(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    سرفصل درآمد
                  </label>
                  <select
                    value={manualCategoryId}
                    onChange={(e) => setManualCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    {categories
                      .filter((c) => c.type === 'income')
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    شرح و بابت درآمد
                  </label>
                  <input
                    type="text"
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    placeholder="مثال: ورودی مسابقه FC25"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* MODE 3: EXPENSE (فرم ثبت هزینه خروجی دخل - کاملاً هماهنگ با دیزاین ثبت مبلغ دستی) */}
          {activeMode === 'expense' && (
            <div className="max-w-xl mx-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  مبلغ هزینه (تومان)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={expenseAmountRaw ? Number(expenseAmountRaw).toLocaleString('en-US') : ''}
                    onChange={(e) =>
                      setExpenseAmountRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))
                    }
                    placeholder="مبلغ هزینه را وارد کنید"
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-base font-bold tabular-nums"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    تومان
                  </span>
                </div>
                {/* Presets */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[50000, 100000, 150000, 200000, 500000, 1000000, 2000000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setExpenseAmountRaw(amt.toString())}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-[#2596BE]/15 hover:text-[#2596BE] text-slate-600 dark:text-slate-300 text-xs font-mono font-medium transition-colors cursor-pointer"
                    >
                      {formatToman(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    سرفصل هزینه
                  </label>
                  <select
                    value={expenseCategoryId}
                    onChange={(e) => setExpenseCategoryId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    شرح و بابت هزینه
                  </label>
                  <input
                    type="text"
                    value={expenseDescription}
                    onChange={(e) => setExpenseDescription(e.target.value)}
                    placeholder="مثال: خرید نوشیدنی بوفه، تعمیر دسته PS5..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  />
                </div>
              </div>

              {/* Account, Payee & Date - Identical Grid Style to Manual Income */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    حساب پرداخت
                  </label>
                  <select
                    value={expenseAccountId}
                    onChange={(e) => setExpenseAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <SearchablePersonSelect
                    persons={persons}
                    selectedPersonId={expensePersonId}
                    onSelectPerson={(p) => setExpensePersonId(p ? p.id : '')}
                    label="دریافت‌کننده (اختیاری)"
                    placeholder="جستجو یا انتخاب شخص..."
                    emptyLabel="بدون شخص (هزینه عمومی)"
                    showBalanceBadge={false}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>تاریخ سند (شمسی)</span>
                    <button
                      type="button"
                      onClick={() => setExpenseJalaliDate(getJalaliDateString())}
                      className="text-[10px] text-[#2596BE] hover:underline cursor-pointer font-bold"
                    >
                      امروز
                    </button>
                  </label>
                  <input
                    type="text"
                    value={expenseJalaliDate}
                    onChange={(e) => setExpenseJalaliDate(e.target.value)}
                    placeholder="1404/07/21"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold text-center"
                  />
                </div>
              </div>
            </div>
          )}

          {/* INCOME MODES (اقلام بوفه و ثبت درآمد دستی - کاملاً مستقل از هزینه) */}
          {activeMode !== 'expense' && (
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-4 bg-slate-50/80 dark:bg-slate-900/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
              {/* Spacious Payment Method Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5">
                  روش دریافت و تسویه حساب فاکتور:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { id: 'pos', label: 'کارتخوان (POS)', icon: CreditCard },
                    { id: 'cash', label: 'صندوق نقدی', icon: Coins },
                    { id: 'wallet', label: 'کیف پول', icon: Wallet },
                    { id: 'credit', label: 'نسیه', icon: AlertCircle },
                  ].map((m) => {
                    const isSelected = paymentMethod === m.id;
                    const hasWalletCredit = m.id === 'wallet' && selectedPerson && selectedPerson.currentBalance < 0;

                    const activeClasses =
                      m.id === 'pos'
                        ? 'bg-[#2596BE] text-white border-[#2596BE] shadow-md shadow-[#2596BE]/25 ring-2 ring-[#2596BE]/30'
                        : m.id === 'cash'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/25 ring-2 ring-emerald-600/30'
                        : m.id === 'wallet'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-600/25 ring-2 ring-purple-600/30'
                        : 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/25 ring-2 ring-amber-600/30';

                    const inactiveClasses = hasWalletCredit
                      ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-800 hover:bg-purple-100/70 animate-pulse'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-750';

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => handleSelectPaymentMethod(m.id as any)}
                        className={`h-11 px-3.5 rounded-2xl text-xs font-bold transition-all border cursor-pointer flex items-center justify-center gap-2 text-center shadow-xs active:scale-[0.98] ${
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

              {/* Account, Person & Date Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    {paymentMethod === 'wallet' && walletAmount < grandAmount
                      ? 'واریز مابقی فاکتور به'
                      : 'حساب دریافت'}
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => handleAccountChange(e.target.value)}
                    disabled={paymentMethod === 'credit' || (paymentMethod === 'wallet' && walletAmount >= grandAmount)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs disabled:opacity-50"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-1">
                  <SearchablePersonSelect
                    persons={persons}
                    selectedPersonId={selectedPersonId}
                    onSelectPerson={(p) => handlePersonChange(p ? p.id : '')}
                    allowManualNew={true}
                    isManualNew={customerSource === 'new'}
                    manualCustomerName={manualCustomerName}
                    manualCustomerPhone={manualCustomerPhone}
                    onManualToggle={(isManual) => {
                      setCustomerSource(isManual ? 'new' : 'existing');
                      if (isManual) {
                        setSelectedPersonId('');
                      }
                    }}
                    onManualNameChange={setManualCustomerName}
                    onManualPhoneChange={setManualCustomerPhone}
                    label="مشتری"
                    placeholder="جستجو با نام، شماره یا شناسه..."
                    emptyLabel="مشتری آزاد"
                    filterType="customer"
                    showBalanceBadge={true}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>تاریخ سند (شمسی)</span>
                    <button
                      type="button"
                      onClick={() => setCustomJalaliDate(getJalaliDateString())}
                      className="text-[10px] text-[#2596BE] hover:underline cursor-pointer font-bold"
                    >
                      امروز
                    </button>
                  </label>
                  <input
                    type="text"
                    value={customJalaliDate}
                    onChange={(e) => setCustomJalaliDate(e.target.value)}
                    placeholder="1404/07/21"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold text-center"
                  />
                </div>
              </div>

              {/* WALLET DEDUCTION CONTROLS (وقتی کیف پول انتخاب شده است) */}
              {paymentMethod === 'wallet' && (
                <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 space-y-2 animate-in fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <span className="text-xs font-bold text-purple-700 dark:text-purple-300">
                        تنظیم کسر از کیف پول:
                      </span>
                      {selectedPerson && selectedPerson.currentBalance < 0 ? (
                        <span className="text-xs text-purple-600 dark:text-purple-400 font-mono font-bold">
                          (موجودی قابل کسر: {formatToman(Math.abs(selectedPerson.currentBalance))} تومان)
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          (موجودی کیف پول این مشتری صفر است)
                        </span>
                      )}
                    </div>

                    {/* Quick buttons */}
                    <div className="flex items-center gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setWalletAmount(grandAmount)}
                        className="px-2 py-1 rounded-lg bg-purple-600 text-white font-bold hover:bg-purple-700 cursor-pointer"
                      >
                        کسر کل فاکتور ({formatToman(grandAmount)} ت)
                      </button>
                      {selectedPerson && selectedPerson.currentBalance < 0 && (
                        <button
                          type="button"
                          onClick={() => setWalletAmount(Math.min(grandAmount, Math.abs(selectedPerson.currentBalance)))}
                          className="px-2 py-1 rounded-lg bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 font-bold hover:bg-purple-50 cursor-pointer"
                        >
                          حداکثر شارژ ({formatToman(Math.min(grandAmount, Math.abs(selectedPerson.currentBalance)))} ت)
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        مبلغ دلخواه کسر از کیف پول (تومان):
                      </label>
                      <input
                        type="number"
                        value={walletAmount || ''}
                        onChange={(e) => setWalletAmount(Math.max(0, Number(e.target.value) || 0))}
                        placeholder={String(grandAmount)}
                        className="w-full px-3 py-1.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold"
                      />
                    </div>
                    {walletAmount < grandAmount && (
                      <div className="flex flex-col justify-center text-xs">
                        <span className="text-slate-500">مبلغ باقیمانده فاکتور:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">
                          {formatToman(grandAmount - walletAmount)} تومان (واریز به {accounts.find(a => a.id === selectedAccountId)?.name || 'حساب'})
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Credit Limit Warning */}
              {isCreditExceeded && selectedPerson && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    هشدار: مبلغ این فاکتور نسیه از سقف اعتبار مشتری ({formatToman(creditLimit)} تومان) عبور می‌کند.
                  </span>
                </div>
              )}

              {/* COLLAPSIBLE ACCORDION: DESK ASSIGNMENT & ACCOUNTING CATEGORY */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setShowDeskAndCategory((prev) => !prev)}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-[#2596BE] dark:hover:border-[#2596BE] bg-slate-50/80 dark:bg-slate-900/50 hover:bg-[#2596BE]/5 text-slate-700 dark:text-slate-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Gamepad2 className="w-4 h-4 text-[#2596BE] shrink-0" />
                    <span>انتساب به میز و سرفصل</span>
                    <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500 hidden sm:inline">
                      ({targetTabOption === 'existing' ? (activeTabs.find((t) => t.id === selectedTabId)?.title || 'میز انتخابی') : (newTabTitle || 'میز جدید')} • {itemsCategoryId === 'auto' ? 'سرفصل خودکار' : categories.find((c) => c.id === itemsCategoryId)?.name || 'سرفصل مشخص'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-[#2596BE]">
                    <span className="text-[11px] font-medium">
                      {showDeskAndCategory ? 'بستن تنظیمات' : 'تنظیم میز / سرفصل'}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        showDeskAndCategory ? 'rotate-180 text-[#2596BE]' : ''
                      }`}
                    />
                  </div>
                </button>

                {showDeskAndCategory && (
                  <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* SECTION: ACCOUNTING CATEGORY / سرفصل حسابداری */}
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Layers className="w-4 h-4 text-[#2596BE]" />
                          <span>سرفصل حسابداری درآمد:</span>
                        </label>
                        {isMixedItems && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-medium">
                            اقلام ترکیبی (گیمینگ + بوفه)
                          </span>
                        )}
                      </div>
                      <select
                        value={itemsCategoryId}
                        onChange={(e) => setItemsCategoryId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
                      >
                        <option value="auto">
                          {isMixedItems
                            ? 'تفکیک هوشمند خودکار (ساعت گیمینگ در «درآمد گیم‌نت» + خوراکی در «فروش بوفه») — پیشنهادی'
                            : hasGamingItems
                            ? 'تشخیص خودکار بر اساس اقلام (سرفصل درآمد گیمینگ)'
                            : 'تشخیص خودکار بر اساس اقلام (سرفصل فروش بوفه)'}
                        </option>
                        {categories
                          .filter((c) => c.type === 'income')
                          .map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              ثبت کل فاکتور در سرفصل: {cat.name}
                            </option>
                          ))}
                      </select>
                      {isMixedItems && itemsCategoryId === 'auto' && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          با تفکیک خودکار، مبالغ اقلام ساعت بازی و بوفه در سرفصل‌های مربوط به خود ثبت می‌شوند تا گزارش درآمد بخش‌ها ۱۰۰٪ دقیق و تراز باشد.
                        </p>
                      )}
                    </div>

                    {/* SECTION: CHOICE OF DESK / TABLE (انتساب به میز) */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-[#2596BE]/10 border border-[#2596BE]/30 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="text-xs font-black text-[#2596BE] flex items-center gap-1.5">
                          <Gamepad2 className="w-4 h-4" />
                          <span>انتساب به میز (نمایش در فاکتورها و سوابق میز):</span>
                        </span>
                        <div className="flex items-center gap-1 text-xs">
                          <button
                            type="button"
                            onClick={() => setTargetTabOption('existing')}
                            disabled={activeTabs.length === 0}
                            className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                              targetTabOption === 'existing'
                                ? 'bg-[#2596BE] text-white'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40'
                            }`}
                          >
                            میزهای فعال ({activeTabs.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTargetTabOption('new');
                              if (!newTabTitle) setNewTabTitle(getNextTableTitle(activeTabs));
                            }}
                            className={`px-2.5 py-1 rounded-lg font-bold cursor-pointer transition-all ${
                              targetTabOption === 'new'
                                ? 'bg-[#2596BE] text-white'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            میز جدید
                          </button>
                        </div>
                      </div>

                      {targetTabOption === 'existing' && activeTabs.length > 0 ? (
                        <div>
                          <select
                            value={selectedTabId}
                            onChange={(e) => setSelectedTabId(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                          >
                            {activeTabs.map((tab) => (
                              <option key={tab.id} value={tab.id}>
                                {tab.title} {tab.personName ? `(${tab.personName})` : ''} - حساب فعلی: {formatToman(tab.totalAmount)} تومان
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={newTabTitle}
                            onChange={(e) => setNewTabTitle(e.target.value)}
                            placeholder="عنوان میز (مثال: میز ۱ یا میز ۲)"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold"
                          />
                          <input
                            type="text"
                            value={tabNotes}
                            onChange={(e) => setTabNotes(e.target.value)}
                            placeholder="یادداشت اختیاری میز..."
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer: TWO PROMINENT ACTIONS (تسویه فوری درجا VS ارسال به میز) */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900/80 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs text-slate-500 font-medium">
                {activeMode === 'expense' ? 'مبلغ کل هزینه:' : 'مبلغ کل فاکتور:'}
              </span>
              <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                {formatToman(grandAmount)} تومان
              </span>
            </div>
            {activeMode !== 'expense' && (
              <button
                type="button"
                onClick={() => setShouldPrintReceipt(!shouldPrintReceipt)}
                className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center shrink-0 ${
                  shouldPrintReceipt
                    ? 'bg-[#2596BE] text-white border-[#2596BE] shadow-xs ring-2 ring-[#2596BE]/30'
                    : 'bg-white/80 dark:bg-slate-800/80 text-slate-400 border-slate-200 dark:border-slate-700 hover:text-slate-600 dark:hover:text-slate-200'
                }`}
                title={shouldPrintReceipt ? 'چاپ فیش خودکار فعال است' : 'چاپ فیش غیرفعال است (برای فعال‌سازی کلیک کنید)'}
              >
                <Printer className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {activeMode === 'expense' ? (
              <button
                type="button"
                onClick={handleInstantCheckout}
                disabled={loading || grandAmount <= 0}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-[0.98] text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال ثبت هزینه...</span>
                  </>
                ) : (
                  <>
                    <ArrowDownLeft className="w-4 h-4" />
                    <span>ثبت هزینه (خروج از دخل)</span>
                  </>
                )}
              </button>
            ) : (
              <>
                {/* OPTION 2: Send to Open Desk Tab */}
                <button
                  type="button"
                  onClick={handleSendToOpenTab}
                  disabled={loading || grandAmount <= 0}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.98] text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                  title="ارسال این اقلام به حساب باز میز"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال ارسال...</span>
                    </>
                  ) : (
                    <>
                      <Gamepad2 className="w-4 h-4" />
                      <span className="flex items-center gap-1">
                        <span>ارسال به</span>
                        <span className="max-w-[110px] truncate font-black">
                          {targetTabOption === 'existing'
                            ? activeTabs.find((t) => t.id === selectedTabId)?.title || 'میز'
                            : newTabTitle
                            ? newTabTitle
                            : getNextTableTitle(activeTabs)}
                        </span>
                      </span>
                    </>
                  )}
                </button>

                {/* OPTION 1: Instant Settlement */}
                <button
                  type="button"
                  onClick={handleInstantCheckout}
                  disabled={loading || grandAmount <= 0}
                  className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl active:scale-[0.98] text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-md disabled:opacity-50 ${
                    paymentMethod === 'wallet'
                      ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-600/20'
                      : paymentMethod === 'credit'
                      ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                      : 'bg-[#2596BE] hover:bg-[#1E7E9E] shadow-[#2596BE]/20'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال ثبت...</span>
                    </>
                  ) : (
                    <>
                      {paymentMethod === 'wallet' ? (
                        <Wallet className="w-4 h-4" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      <span>
                        {paymentMethod === 'wallet'
                          ? `تسویه با کیف پول (${formatToman(walletAmount > 0 ? walletAmount : grandAmount)} ت)`
                          : `تسویه درجا (${paymentMethod === 'pos' ? 'کارتخوان' : paymentMethod === 'cash' ? 'نقدی' : 'نسیه'})`}
                      </span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
