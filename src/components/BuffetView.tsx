import React, { useState } from 'react';
import {
  Coffee,
  PlusCircle,
  PackagePlus,
  Trash,
  AlertTriangle,
  Search,
  X,
  Edit2,
  Trash2,
  Tags,
  Gamepad2,
  Clock,
  Sparkles,
  CreditCard,
  Plus,
} from 'lucide-react';
import { Account, GamingServiceItem, InventoryLog, OpenTab, Person, Product, Transaction } from '../types/index.ts';
import { formatToman, getJalaliDateString, normalizeDigits, parseTomanInput } from '../utils/jalali.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';

interface BuffetViewProps {
  products: Product[];
  inventoryLogs: InventoryLog[];
  accounts: Account[];
  persons: Person[];
  openTabs: OpenTab[];
  buffetCategories?: string[];
  gamingServices?: GamingServiceItem[];
  onUpdateBuffetCategories?: (categories: string[]) => Promise<unknown>;
  onSellBuffet: (data: {
    items: { productId: string; quantity: number; unitPrice?: number }[];
    accountId?: string;
    personId?: string;
    paymentMethod: 'cash' | 'pos' | 'credit';
    date: string;
    jalaliDate: string;
  }) => Promise<{ transaction: Transaction }>;
  onRestock: (data: {
    productId: string;
    quantity: number;
    costPerUnit: number;
    accountId?: string;
    date: string;
    jalaliDate: string;
  }) => Promise<unknown>;
  onWaste: (data: { productId: string; quantity: number; reason: string }) => Promise<unknown>;
  onCreateProduct: (data: Partial<Product>) => Promise<unknown>;
  onUpdateProduct: (id: string, data: Partial<Product>) => Promise<unknown>;
  onDeleteProduct: (id: string) => Promise<unknown>;
  onCreateGamingService?: (data: Partial<GamingServiceItem>) => Promise<unknown>;
  onUpdateGamingService?: (id: string, data: Partial<GamingServiceItem>) => Promise<unknown>;
  onDeleteGamingService?: (id: string) => Promise<unknown>;
  onAddItemToTab: (
    tabId: string,
    data: { productId?: string; productName?: string; quantity: number; unitPrice?: number }
  ) => Promise<unknown>;
  onViewReceipt: (tx: Transaction) => void;
  onOpenUnifiedSales?: () => void;
  onRefresh: () => void;
}

export const BuffetView: React.FC<BuffetViewProps> = ({
  products,
  accounts,
  buffetCategories,
  gamingServices = [],
  onUpdateBuffetCategories,
  onRestock,
  onWaste,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onCreateGamingService,
  onUpdateGamingService,
  onDeleteGamingService,
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'buffet' | 'services'>('buffet');

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Categories list
  const defaultCategories = ['نوشیدنی خنک', 'کافه گرم', 'تنقلات و اسنک', 'فست‌فود و غذا', 'شکلات و بیسکویت', 'سایر خوراکی‌ها'];
  const [activeCategories, setActiveCategories] = useState<string[]>(
    buffetCategories && buffetCategories.length > 0 ? buffetCategories : defaultCategories
  );

  // Category management modal
  const [isManageCatOpen, setIsManageCatOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCatName, setEditingCatName] = useState<{ oldName: string; newName: string } | null>(null);
  const [buffetCatToDelete, setBuffetCatToDelete] = useState<string | null>(null);

  const handleAddBuffetCat = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatInput.trim();
    if (!trimmed || activeCategories.includes(trimmed)) return;
    const updated = [...activeCategories, trimmed];
    setActiveCategories(updated);
    setNewCatInput('');
    if (onUpdateBuffetCategories) {
      await onUpdateBuffetCategories(updated);
    }
    onRefresh();
  };

  const handleSaveEditBuffetCat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCatName || !editingCatName.newName.trim()) return;
    const updated = activeCategories.map((c) =>
      c === editingCatName.oldName ? editingCatName.newName.trim() : c
    );
    setActiveCategories(updated);
    setEditingCatName(null);
    if (onUpdateBuffetCategories) {
      await onUpdateBuffetCategories(updated);
    }
    onRefresh();
  };

  const handleDeleteBuffetCat = (cat: string) => {
    if (activeCategories.length <= 1) return;
    setBuffetCatToDelete(cat);
  };

  const handleConfirmDeleteBuffetCat = async () => {
    if (!buffetCatToDelete) return;
    const updated = activeCategories.filter((c) => c !== buffetCatToDelete);
    setActiveCategories(updated);
    setBuffetCatToDelete(null);
    if (onUpdateBuffetCategories) {
      await onUpdateBuffetCategories(updated);
    }
    onRefresh();
  };

  // Modal states for Buffet
  const [isRestockOpen, setIsRestockOpen] = useState(false);
  const [isWasteOpen, setIsWasteOpen] = useState(false);
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Gaming & ID Services Management States
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState('all');
  const [isNewServiceOpen, setIsNewServiceOpen] = useState(false);
  const [editingService, setEditingService] = useState<GamingServiceItem | null>(null);
  const [serviceToDelete, setServiceToDelete] = useState<GamingServiceItem | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceCategory, setServiceCategory] = useState('کرایه کنسول');
  const [serviceDuration, setServiceDuration] = useState('60');
  const [serviceDescription, setServiceDescription] = useState('');
  const [serviceLoading, setServiceLoading] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);
  const [serviceDeleteLoading, setServiceDeleteLoading] = useState(false);

  // Lock body scroll when any modal in BuffetView is open
  useLockBodyScroll(
    isManageCatOpen ||
    isRestockOpen ||
    isWasteOpen ||
    isNewProductOpen ||
    editingProduct !== null ||
    productToDelete !== null ||
    buffetCatToDelete !== null ||
    isNewServiceOpen ||
    editingService !== null ||
    serviceToDelete !== null
  );

  const defaultServiceCategories = ['کرایه کنسول', 'PC گیمینگ', 'اتاق VIP', 'آیدی و اکانت', 'سایر خدمات'];
  const allServiceCategories = Array.from(new Set([...defaultServiceCategories, ...gamingServices.map((s) => s.category).filter(Boolean)]));

  const filteredServices = gamingServices.filter((s) => {
    if (serviceCategoryFilter !== 'all' && s.category !== serviceCategoryFilter) return false;
    if (serviceSearch.trim()) {
      const q = serviceSearch.toLowerCase().trim();
      return s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q));
    }
    return true;
  });

  const consoleServicesCount = gamingServices.filter(
    (s) => s.category === 'کرایه کنسول' || s.category === 'PC گیمینگ' || s.category === 'اتاق VIP'
  ).length;
  const idServicesCount = gamingServices.filter((s) => s.category === 'آیدی و اکانت').length;

  const handleOpenNewService = () => {
    setEditingService(null);
    setServiceName('');
    setServicePrice('');
    setServiceCategory('کرایه کنسول');
    setServiceDuration('60');
    setServiceDescription('');
    setServiceError(null);
    setIsNewServiceOpen(true);
  };

  const handleOpenEditService = (s: GamingServiceItem) => {
    setEditingService(s);
    setServiceName(s.name);
    setServicePrice(s.price.toString());
    setServiceCategory(s.category || 'کرایه کنسول');
    setServiceDuration(s.durationMinutes ? s.durationMinutes.toString() : '');
    setServiceDescription(s.description || '');
    setServiceError(null);
    setIsNewServiceOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim()) {
      setServiceError('نام خدمت یا تعرفه الزامی است.');
      return;
    }
    const parsedPrice = parseTomanInput(servicePrice);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setServiceError('مبلغ معتبر نیست.');
      return;
    }

    try {
      setServiceLoading(true);
      setServiceError(null);
      const payload: Partial<GamingServiceItem> = {
        name: serviceName.trim(),
        price: parsedPrice,
        category: serviceCategory.trim() || 'کرایه کنسول',
        durationMinutes: serviceDuration ? parseInt(normalizeDigits(serviceDuration), 10) : undefined,
        description: serviceDescription.trim() || undefined,
      };

      if (editingService && onUpdateGamingService) {
        await onUpdateGamingService(editingService.id, payload);
        setEditingService(null);
      } else if (onCreateGamingService) {
        await onCreateGamingService(payload);
      }
      setIsNewServiceOpen(false);
      onRefresh();
    } catch (err: unknown) {
      setServiceError(err instanceof Error ? err.message : 'خطا در ذخیره‌سازی تعرفه');
    } finally {
      setServiceLoading(false);
    }
  };

  const handleConfirmDeleteService = async () => {
    if (!serviceToDelete || !onDeleteGamingService) return;
    try {
      setServiceDeleteLoading(true);
      await onDeleteGamingService(serviceToDelete.id);
      setServiceToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setServiceDeleteLoading(false);
    }
  };


  // Restock state
  const [restockProdId, setRestockProdId] = useState(products[0]?.id || '');
  const [restockQty, setRestockQty] = useState('');
  const [restockCost, setRestockCost] = useState('');
  const [restockAccId, setRestockAccId] = useState(accounts[0]?.id || '');
  const [restockLoading, setRestockLoading] = useState(false);

  // Waste state
  const [wasteProdId, setWasteProdId] = useState(products[0]?.id || '');
  const [wasteQty, setWasteQty] = useState('');
  const [wasteReason, setWasteReason] = useState('');
  const [wasteLoading, setWasteLoading] = useState(false);

  // New & Edit Product Form State
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('نوشیدنی خنک');
  const [prodPurchasePrice, setProdPurchasePrice] = useState('');
  const [prodSellPrice, setProdSellPrice] = useState('');
  const [prodStock, setProdStock] = useState('');
  const [prodMinAlert, setProdMinAlert] = useState('5');
  const [prodUnit, setProdUnit] = useState('عدد');
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);

  const categoriesList = Array.from(new Set([...activeCategories, ...products.map((p) => p.category)]));

  const filteredProducts = products.filter((p) => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    if (search.trim() && !p.name.toLowerCase().includes(search.toLowerCase().trim())) return false;
    return true;
  });

  const handleOpenEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProdName(p.name);
    setProdCategory(p.category);
    setProdPurchasePrice(p.purchasePrice.toString());
    setProdSellPrice(p.sellPrice.toString());
    setProdStock(p.stock.toString());
    setProdMinAlert(p.minStockAlert.toString());
    setProdUnit(p.unit);
    setProdError(null);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodName.trim() || !prodSellPrice) {
      setProdError('نام کالا و قیمت فروش الزامی است.');
      return;
    }
    try {
      setProdLoading(true);
      setProdError(null);
      const payload = {
        name: prodName.trim(),
        category: prodCategory.trim(),
        purchasePrice: parseTomanInput(prodPurchasePrice),
        sellPrice: parseTomanInput(prodSellPrice),
        stock: parseInt(normalizeDigits(prodStock), 10) || 0,
        minStockAlert: parseInt(normalizeDigits(prodMinAlert), 10) || 5,
        unit: prodUnit.trim() || 'عدد',
      };

      if (editingProduct) {
        await onUpdateProduct(editingProduct.id, payload);
        setEditingProduct(null);
      } else {
        await onCreateProduct(payload);
        setIsNewProductOpen(false);
      }
      onRefresh();
    } catch (err: unknown) {
      setProdError(err instanceof Error ? err.message : 'خطا در ثبت کالا');
    } finally {
      setProdLoading(false);
    }
  };

  const handleDeleteProduct = (p: Product) => {
    setProductToDelete(p);
  };

  const handleConfirmDeleteProduct = async () => {
    if (!productToDelete) return;
    try {
      setDeleteLoading(true);
      await onDeleteProduct(productToDelete.id);
      setProductToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const totalInventoryValue = products.reduce((sum, p) => sum + p.purchasePrice * p.stock, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            کالاها، خدمات بازی و انبار
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            کنترل موجودی بوفه، تعریف و ویرایش نام و مبالغ کرایه زمان کنسول و شارژ آیدی/اکانت (فروش در «ثبت سریع»)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {activeSubTab === 'buffet' ? (
            <>
              <button
                onClick={() => setIsRestockOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-800 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-700"
              >
                <PackagePlus className="w-4 h-4 text-emerald-400" />
                <span>شارژ موجودی (خرید)</span>
              </button>
              <button
                onClick={() => setIsWasteOpen(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
              >
                <Trash className="w-4 h-4 text-rose-500" />
                <span>ثبت ضایعات</span>
              </button>
              <button
                onClick={() => {
                  setEditingProduct(null);
                  setProdName('');
                  setProdPurchasePrice('');
                  setProdSellPrice('');
                  setProdStock('');
                  setProdError(null);
                  setIsNewProductOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#2596BE] text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#1E7E9E] transition-all cursor-pointer shadow-xs"
              >
                <PlusCircle className="w-4 h-4" />
                <span>افزودن کالای جدید</span>
              </button>
            </>
          ) : (
            <button
              onClick={handleOpenNewService}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#2596BE] text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#1E7E9E] transition-all cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>افزودن تعرفه / خدمت جدید</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Tabs Switcher */}
      <div className="flex items-center gap-2 p-1.5 bg-slate-200/60 dark:bg-slate-900/80 rounded-2xl border border-slate-200 dark:border-slate-800 w-fit">
        <button
          type="button"
          onClick={() => setActiveSubTab('buffet')}
          className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSubTab === 'buffet'
              ? 'bg-white dark:bg-[#111C33] text-[#2596BE] shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Coffee className="w-4 h-4" />
          <span>کالاهای بوفه و انبار</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
            {products.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('services')}
          className={`flex items-center gap-2 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeSubTab === 'services'
              ? 'bg-white dark:bg-[#111C33] text-[#2596BE] shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Gamepad2 className="w-4 h-4" />
          <span>کرایه زمان کنسول و خدمات آیدی</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#2596BE]/15 text-[#2596BE] font-mono font-bold">
            {gamingServices.length}
          </span>
        </button>
      </div>

      {/* SUB-TAB 1: BUFFET PRODUCTS & INVENTORY */}
      {activeSubTab === 'buffet' && (
        <div className="space-y-6">
          {/* Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">تعداد اقلام بوفه</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                    {products.length} ردیف کالا
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">کالاهای رو به اتمام (هشدار)</span>
                  <span className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums">
                    {products.filter((p) => p.stock <= p.minStockAlert).length} کالا
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">ارزش کل موجودی انبار</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatToman(totalInventoryValue)} تومان
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filter and Search Bar with Category Editing */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="w-full sm:w-72 relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجوی نام کالا یا بارکد..."
                className="w-full pl-4 pr-9 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-[#2596BE] text-white font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                همه اقلام
              </button>
              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-[#2596BE] text-white font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
              {/* Manage Categories Button */}
              <button
                onClick={() => setIsManageCatOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap bg-slate-100 dark:bg-slate-800 text-[#2596BE] hover:bg-[#2596BE]/10 border border-slate-200 dark:border-slate-700 font-semibold transition-colors cursor-pointer mr-1"
                title="ویرایش و مدیریت دسته‌بندی‌های بوفه"
              >
                <Tags className="w-3.5 h-3.5" />
                <span>مدیریت دسته‌ها</span>
              </button>
            </div>
          </div>

          {/* Products Table */}
          <div className="rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <th className="py-3 px-4">نام کالا</th>
                    <th className="py-3 px-4">دسته‌بندی</th>
                    <th className="py-3 px-4">قیمت خرید (تومان)</th>
                    <th className="py-3 px-4">قیمت فروش (تومان)</th>
                    <th className="py-3 px-4">حاشیه سود واحد</th>
                    <th className="py-3 px-4">موجودی انبار</th>
                    <th className="py-3 px-4">وضعیت</th>
                    <th className="py-3 px-4 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredProducts.map((p) => {
                    const profitPerUnit = p.sellPrice - p.purchasePrice;
                    const isLowStock = p.stock <= p.minStockAlert;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {p.name}
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{p.category}</td>
                        <td className="py-3 px-4 tabular-nums font-mono text-slate-500">
                          {formatToman(p.purchasePrice)}
                        </td>
                        <td className="py-3 px-4 tabular-nums font-bold text-slate-900 dark:text-white">
                          {formatToman(p.sellPrice)}
                        </td>
                        <td className="py-3 px-4 tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                          +{formatToman(profitPerUnit)}
                        </td>
                        <td className="py-3 px-4 tabular-nums font-black text-sm">
                          <span className={isLowStock ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}>
                            {p.stock} {p.unit}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isLowStock ? (
                            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              نیازمند شارژ
                            </span>
                          ) : (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              موجود
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditProduct(p)}
                              className="p-1 rounded-lg text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                              title="ویرایش کالا"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduct(p)}
                              className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              title="حذف کالا"
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
        </div>
      )}

      {/* SUB-TAB 2: GAMING CONSOLE RENTAL & ID / ACCOUNT SERVICES */}
      {activeSubTab === 'services' && (
        <div className="space-y-6">
          {/* Gaming Services Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2596BE]/10 text-[#2596BE] flex items-center justify-center">
                  <Gamepad2 className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">کل خدمات و تعرفه‌های بازی</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white tabular-nums">
                    {gamingServices.length} تعرفه فعال
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">کرایه کنسول و سیستم PC</span>
                  <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {consoleServicesCount} تعرفه
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">خدمات آیدی و شارژ اکانت</span>
                  <span className="text-lg font-black text-amber-600 dark:text-amber-400 tabular-nums">
                    {idServicesCount} تعرفه
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Filter and Search Bar for Gaming Services */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="w-full sm:w-72 relative">
              <input
                type="text"
                value={serviceSearch}
                onChange={(e) => setServiceSearch(e.target.value)}
                placeholder="جستجوی نام خدمت، کنسول یا آیدی..."
                className="w-full pl-4 pr-9 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setServiceCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                  serviceCategoryFilter === 'all'
                    ? 'bg-[#2596BE] text-white font-semibold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                همه خدمات ({gamingServices.length})
              </button>
              {allServiceCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setServiceCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer ${
                    serviceCategoryFilter === cat
                      ? 'bg-[#2596BE] text-white font-semibold'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {cat} ({gamingServices.filter((s) => s.category === cat).length})
                </button>
              ))}
            </div>
          </div>

          {/* Gaming Services Table */}
          <div className="rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <th className="py-3 px-4">نام تعرفه / خدمت بازی</th>
                    <th className="py-3 px-4">دسته‌بندی</th>
                    <th className="py-3 px-4">مبلغ فروش مصوب (تومان)</th>
                    <th className="py-3 px-4">مدت زمان استاندارد</th>
                    <th className="py-3 px-4">توضیحات و کاربرد</th>
                    <th className="py-3 px-4 text-left">ویرایش / حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredServices.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        هیچ تعرفه یا خدمت بازی مطابق با فیلتر یافت نشد.
                      </td>
                    </tr>
                  ) : (
                    filteredServices.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-[#2596BE]" />
                            <span>{s.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {s.category || 'کرایه کنسول'}
                          </span>
                        </td>
                        <td className="py-3 px-4 tabular-nums font-mono font-bold text-sm text-[#2596BE]">
                          {formatToman(s.price)} تومان
                        </td>
                        <td className="py-3 px-4 text-slate-600 dark:text-slate-400">
                          {s.durationMinutes ? `${s.durationMinutes} دقیقه` : 'بدون محدودیت'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 text-[11px] max-w-xs truncate">
                          {s.description || '—'}
                        </td>
                        <td className="py-3 px-4 text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditService(s)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-slate-600 dark:text-slate-300 hover:text-[#2596BE] hover:bg-[#2596BE]/10 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer text-xs font-semibold"
                              title="ویرایش نام و مبلغ تعرفه"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-[#2596BE]" />
                              <span>ویرایش</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setServiceToDelete(s)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900 transition-colors cursor-pointer"
                              title="حذف تعرفه"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create or Edit Product */}
      {(isNewProductOpen || editingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingProduct ? `ویرایش ${editingProduct.name}` : 'افزودن کالای جدید'}
              </h2>
              <button
                onClick={() => {
                  setIsNewProductOpen(false);
                  setEditingProduct(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-3.5">
              {prodError && (
                <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{prodError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام کالا
                </label>
                <input
                  type="text"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="مثال: چیپس چی توز فلفلی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    دسته‌بندی
                  </label>
                  <select
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  >
                    {categoriesList.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    واحد شمارش
                  </label>
                  <input
                    type="text"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                    placeholder="عدد، قوطی، بسته..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    قیمت خرید (تومان)
                  </label>
                  <input
                    type="text"
                    value={prodPurchasePrice ? Number(prodPurchasePrice).toLocaleString('en-US') : ''}
                    onChange={(e) => setProdPurchasePrice(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    قیمت فروش (تومان)
                  </label>
                  <input
                    type="text"
                    value={prodSellPrice ? Number(prodSellPrice).toLocaleString('en-US') : ''}
                    onChange={(e) => setProdSellPrice(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    موجودی فعلی
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    حداقل موجودی (هشدار)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={prodMinAlert}
                    onChange={(e) => setProdMinAlert(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewProductOpen(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={prodLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {prodLoading ? 'در حال ثبت...' : 'ذخیره کالا'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {isRestockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                شارژ موجودی کالا (خرید انبار)
              </h2>
              <button
                onClick={() => setIsRestockOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const qty = parseInt(normalizeDigits(restockQty), 10);
                const cost = parseTomanInput(restockCost);
                if (isNaN(qty) || qty <= 0) return;
                setRestockLoading(true);
                try {
                  await onRestock({
                    productId: restockProdId,
                    quantity: qty,
                    costPerUnit: cost,
                    accountId: restockAccId || undefined,
                    date: new Date().toISOString(),
                    jalaliDate: getJalaliDateString(),
                  });
                  setIsRestockOpen(false);
                  onRefresh();
                } finally {
                  setRestockLoading(false);
                }
              }}
              className="p-5 space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  کالا
                </label>
                <select
                  value={restockProdId}
                  onChange={(e) => setRestockProdId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (موجودی فعلی: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    تعداد ورودی
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={restockQty}
                    onChange={(e) => setRestockQty(e.target.value)}
                    placeholder="تعداد"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    قیمت خرید هر عدد (تومان)
                  </label>
                  <input
                    type="text"
                    value={restockCost ? Number(restockCost).toLocaleString('en-US') : ''}
                    onChange={(e) => setRestockCost(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  پرداخت هزینه از حساب
                </label>
                <select
                  value={restockAccId}
                  onChange={(e) => setRestockAccId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                >
                  <option value="">بدون ثبت هزینه مالی (فقط شارژ فیزیکی)</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRestockOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={restockLoading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {restockLoading ? 'در حال ثبت...' : 'ثبت شارژ انبار'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Waste Modal */}
      {isWasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                ثبت ضایعات و خسارت کالا
              </h2>
              <button
                onClick={() => setIsWasteOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const qty = parseInt(normalizeDigits(wasteQty), 10);
                if (isNaN(qty) || qty <= 0) return;
                setWasteLoading(true);
                try {
                  await onWaste({
                    productId: wasteProdId,
                    quantity: qty,
                    reason: wasteReason.trim() || 'ضایعات و تاریخ مصرف',
                  });
                  setIsWasteOpen(false);
                  onRefresh();
                } finally {
                  setWasteLoading(false);
                }
              }}
              className="p-5 space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  کالا
                </label>
                <select
                  value={wasteProdId}
                  onChange={(e) => setWasteProdId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (موجودی: {p.stock})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  تعداد ضایعات
                </label>
                <input
                  type="number"
                  min="1"
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  placeholder="تعداد"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  دلیل ضایعات
                </label>
                <input
                  type="text"
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  placeholder="انقضای تاریخ، شکستگی، آسیب دیدگی..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsWasteOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={wasteLoading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {wasteLoading ? 'در حال ثبت...' : 'ثبت ضایعات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal (دسته بندی بوفه هم قابل ویرایش باشه) */}
      {isManageCatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Tags className="w-5 h-5 text-[#2596BE]" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  مدیریت و ویرایش دسته‌بندی‌های بوفه
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsManageCatOpen(false);
                  setEditingCatName(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add new category */}
            <form onSubmit={handleAddBuffetCat} className="flex gap-2">
              <input
                type="text"
                value={newCatInput}
                onChange={(e) => setNewCatInput(e.target.value)}
                placeholder="عنوان دسته جدید (مثال: دسر)..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
              >
                + افزودن
              </button>
            </form>

            {/* List of categories with Edit & Delete */}
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800">
              {activeCategories.map((cat) => (
                <div key={cat} className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  {editingCatName?.oldName === cat ? (
                    <form onSubmit={handleSaveEditBuffetCat} className="flex items-center gap-2 flex-1">
                      <input
                        type="text"
                        value={editingCatName.newName}
                        onChange={(e) =>
                          setEditingCatName({ ...editingCatName, newName: e.target.value })
                        }
                        className="flex-1 px-2 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-bold"
                        autoFocus
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        ذخیره
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCatName(null)}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                      >
                        لغو
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#2596BE]" />
                        <span className="text-xs font-bold text-slate-900 dark:text-white">{cat}</span>
                        <span className="text-[10px] text-slate-400">
                          ({products.filter((p) => p.category === cat).length} کالا)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingCatName({ oldName: cat, newName: cat })}
                          className="p-1 rounded-lg text-slate-400 hover:text-[#2596BE] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title="ویرایش نام دسته"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBuffetCat(cat)}
                          disabled={activeCategories.length <= 1}
                          className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 cursor-pointer"
                          title="حذف دسته"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsManageCatOpen(false);
                  setEditingCatName(null);
                }}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl hover:bg-slate-200 cursor-pointer"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Buffet Category Deletion */}
      <ConfirmModal
        isOpen={!!buffetCatToDelete}
        title="حذف دسته‌بندی بوفه"
        message={`آیا مطمئن هستید که می‌خواهید دسته‌بندی "${buffetCatToDelete}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={false}
        onConfirm={handleConfirmDeleteBuffetCat}
        onClose={() => setBuffetCatToDelete(null)}
      />

      {/* Confirmation Modal for Product Deletion */}
      <ConfirmModal
        isOpen={!!productToDelete}
        title="حذف کالا از بوفه"
        message={`آیا مطمئن هستید که می‌خواهید کالای "${productToDelete?.name}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDeleteProduct}
        onClose={() => setProductToDelete(null)}
      />

      {/* Modal: Create or Edit Gaming Service (Console Time Rental & ID / Account) */}
      {(isNewServiceOpen || editingService) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#2596BE]/10 text-[#2596BE] flex items-center justify-center">
                  <Gamepad2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {editingService ? `ویرایش تعرفه: ${editingService.name}` : 'افزودن تعرفه / خدمت جدید بازی'}
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    تنظیم نام و مبلغ برای ثبت سریع و تسویه میزها
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsNewServiceOpen(false);
                  setEditingService(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {serviceError && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{serviceError}</span>
              </div>
            )}

            <form onSubmit={handleSaveService} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام خدمت یا تعرفه بازی *
                </label>
                <input
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="مثلا: ۱ ساعت PS5، شارژ آیدی ۱۰۰ هزار ت، ۲ ساعت PC..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:border-[#2596BE] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  مبلغ فروش مصوب (تومان) *
                </label>
                <input
                  type="text"
                  required
                  value={servicePrice}
                  onChange={(e) => setServicePrice(e.target.value)}
                  placeholder="مثلا: 80,000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold focus:border-[#2596BE] outline-none text-left dir-ltr"
                />
                {servicePrice && !isNaN(parseTomanInput(servicePrice)) && (
                  <span className="text-[11px] text-[#2596BE] font-bold block mt-1">
                    معادل: {formatToman(parseTomanInput(servicePrice))} تومان
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    دسته‌بندی
                  </label>
                  <select
                    value={serviceCategory}
                    onChange={(e) => setServiceCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:border-[#2596BE] outline-none"
                  >
                    {allServiceCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    مدت زمان (دقیقه - اختیاری)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={serviceDuration}
                    onChange={(e) => setServiceDuration(e.target.value)}
                    placeholder="مثلا 60 یا 120"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono focus:border-[#2596BE] outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  توضیحات و یادداشت (اختیاری)
                </label>
                <textarea
                  rows={2}
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  placeholder="توضیحات مربوط به دستگاه، قوانین زمان بازی یا بونوس شارژ آیدی..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:border-[#2596BE] outline-none resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewServiceOpen(false);
                    setEditingService(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={serviceLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {serviceLoading ? 'در حال ذخیره‌سازی...' : editingService ? 'ذخیره تغییرات' : 'افزودن خدمت'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Gaming Service Deletion */}
      <ConfirmModal
        isOpen={!!serviceToDelete}
        title="حذف تعرفه / خدمت بازی"
        message={`آیا مطمئن هستید که می‌خواهید تعرفه "${serviceToDelete?.name}" (${serviceToDelete ? formatToman(serviceToDelete.price) : 0} تومان) را حذف کنید؟ این تعرفه دیگر در ثبت سریع نمایش داده نخواهد شد.`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={serviceDeleteLoading}
        onConfirm={handleConfirmDeleteService}
        onClose={() => setServiceToDelete(null)}
      />
    </div>
  );
};
