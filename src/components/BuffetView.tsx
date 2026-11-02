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
  Snowflake,
  Warehouse,
  Boxes,
  ArrowRightLeft,
  Package,
  History,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
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
    destination?: 'warehouse' | 'fridge' | 'split';
    fridgeQuantity?: number;
    warehouseQuantity?: number;
    isPackageMode?: boolean;
    packageCount?: number;
  }) => Promise<unknown>;
  onTransferToFridge?: (data: {
    productId: string;
    quantity: number;
    date?: string;
    jalaliDate?: string;
    note?: string;
  }) => Promise<unknown>;
  onWaste: (data: { productId: string; quantity: number; reason: string; location?: 'warehouse' | 'fridge' | 'overall' }) => Promise<unknown>;
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
  inventoryLogs = [],
  accounts,
  buffetCategories,
  gamingServices = [],
  onUpdateBuffetCategories,
  onRestock,
  onTransferToFridge,
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
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
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
    isTransferModalOpen ||
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


  // Transfer to fridge modal state
  const [transferProdId, setTransferProdId] = useState(products[0]?.id || '');
  const [transferQty, setTransferQty] = useState('');
  const [transferUnitMode, setTransferUnitMode] = useState<'piece' | 'package'>('piece');
  const [transferNote, setTransferNote] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Restock state (Bulk purchase mode & Destination Split)
  const [restockProdId, setRestockProdId] = useState(products[0]?.id || '');
  const [restockMode, setRestockMode] = useState<'package' | 'piece'>('package');
  const [restockPackageCount, setRestockPackageCount] = useState('1');
  const [restockPieceCount, setRestockPieceCount] = useState('24');
  const [restockCost, setRestockCost] = useState('');
  const [restockAccId, setRestockAccId] = useState(accounts[0]?.id || '');
  const [restockDestination, setRestockDestination] = useState<'warehouse' | 'fridge' | 'split'>('warehouse');
  const [restockFridgeSplit, setRestockFridgeSplit] = useState('');
  const [restockWarehouseSplit, setRestockWarehouseSplit] = useState('');
  const [restockLoading, setRestockLoading] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);

  // Waste state
  const [wasteProdId, setWasteProdId] = useState(products[0]?.id || '');
  const [wasteQty, setWasteQty] = useState('');
  const [wasteLocation, setWasteLocation] = useState<'fridge' | 'warehouse'>('fridge');
  const [wasteReason, setWasteReason] = useState('');
  const [wasteLoading, setWasteLoading] = useState(false);

  // New & Edit Product Form State
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('نوشیدنی خنک');
  const [prodPurchasePrice, setProdPurchasePrice] = useState('');
  const [prodSellPrice, setProdSellPrice] = useState('');
  const [prodWarehouseStock, setProdWarehouseStock] = useState('0');
  const [prodFridgeStock, setProdFridgeStock] = useState('0');
  const [prodPackageUnit, setProdPackageUnit] = useState('باکس');
  const [prodUnitsPerPackage, setProdUnitsPerPackage] = useState('24');
  const [prodMinAlert, setProdMinAlert] = useState('5');
  const [prodUnit, setProdUnit] = useState('عدد');
  const [prodBarcode, setProdBarcode] = useState('');
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState<string | null>(null);

  const categoriesList = Array.from(new Set([...activeCategories, ...products.map((p) => p.category)]));

  const filteredProducts = products.filter((p) => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const matchName = p.name.toLowerCase().includes(q);
      const matchBarcode = p.barcode && p.barcode.includes(q);
      if (!matchName && !matchBarcode) return false;
    }
    return true;
  });

  // Pagination for Buffet Products Table
  const [prodPage, setProdPage] = useState(1);
  const prodPageSize = 12;
  const totalProdPages = Math.ceil(filteredProducts.length / prodPageSize) || 1;
  const paginatedProducts = filteredProducts.slice((prodPage - 1) * prodPageSize, prodPage * prodPageSize);

  // Pagination for Inventory History Table
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;
  const totalHistoryPages = Math.ceil(inventoryLogs.length / historyPageSize) || 1;
  const paginatedLogs = inventoryLogs.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);

  const handleOpenEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProdName(p.name);
    setProdCategory(p.category);
    setProdPurchasePrice(p.purchasePrice.toString());
    setProdSellPrice(p.sellPrice.toString());
    const wStock = p.warehouseStock !== undefined ? p.warehouseStock : Math.max(0, p.stock - (p.fridgeStock || 0));
    const fStock = p.fridgeStock !== undefined ? p.fridgeStock : 0;
    setProdWarehouseStock(wStock.toString());
    setProdFridgeStock(fStock.toString());
    setProdPackageUnit(p.packageUnit || (p.category === 'نوشیدنی خنک' ? 'باکس' : 'کارتن'));
    setProdUnitsPerPackage((p.unitsPerPackage || (p.category === 'نوشیدنی خنک' ? 24 : 12)).toString());
    setProdMinAlert(p.minStockAlert.toString());
    setProdUnit(p.unit || 'عدد');
    setProdBarcode(p.barcode || '');
    setProdError(null);
  };

  const handleOpenTransferModal = (targetProduct?: Product) => {
    const prod = targetProduct || products.find((p) => p.id === transferProdId) || products[0];
    if (prod) {
      setTransferProdId(prod.id);
    }
    setTransferQty('5');
    setTransferUnitMode('piece');
    setTransferNote('');
    setTransferError(null);
    setIsTransferModalOpen(true);
  };

  const handleOpenRestockModal = (targetProduct?: Product) => {
    const prod = targetProduct || products.find((p) => p.id === restockProdId) || products[0];
    if (prod) {
      setRestockProdId(prod.id);
      setRestockCost(prod.purchasePrice.toString());
      setRestockMode(prod.unitsPerPackage && prod.unitsPerPackage > 1 ? 'package' : 'piece');
      setRestockPieceCount((prod.unitsPerPackage || 24).toString());
    }
    setRestockPackageCount('1');
    setRestockDestination('warehouse');
    setRestockFridgeSplit('');
    setRestockWarehouseSplit('');
    setRestockError(null);
    setIsRestockOpen(true);
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
      const wStock = parseInt(normalizeDigits(prodWarehouseStock), 10) || 0;
      const fStock = parseInt(normalizeDigits(prodFridgeStock), 10) || 0;
      const packMult = Math.max(1, parseInt(normalizeDigits(prodUnitsPerPackage), 10) || 1);

      const payload: Partial<Product> = {
        name: prodName.trim(),
        category: prodCategory.trim(),
        purchasePrice: parseTomanInput(prodPurchasePrice),
        sellPrice: parseTomanInput(prodSellPrice),
        warehouseStock: wStock,
        fridgeStock: fStock,
        stock: wStock + fStock,
        packageUnit: prodPackageUnit.trim() || 'باکس',
        unitsPerPackage: packMult,
        minStockAlert: parseInt(normalizeDigits(prodMinAlert), 10) || 5,
        unit: prodUnit.trim() || 'عدد',
        barcode: prodBarcode.trim() || undefined,
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
                onClick={() => handleOpenTransferModal()}
                className="flex items-center gap-1.5 px-3 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer shadow-xs"
                title="انتقال اقلام از انبار مرکزی به یخچال و پیشخوان"
              >
                <Snowflake className="w-4 h-4 text-cyan-200" />
                <span>شارژ یخچال</span>
              </button>
              <button
                onClick={() => handleOpenRestockModal()}
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
                  setProdWarehouseStock('0');
                  setProdFridgeStock('0');
                  setProdPackageUnit('باکس');
                  setProdUnitsPerPackage('24');
                  setProdBarcode('');
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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Coffee className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">تعداد اقلام بوفه</span>
                  <span className="text-base sm:text-lg font-black text-slate-900 dark:text-white tabular-nums">
                    {products.length} ردیف کالا
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <Snowflake className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">یخچال / پیشخوان فروش</span>
                  <span className="text-base sm:text-lg font-black text-cyan-600 dark:text-cyan-400 tabular-nums">
                    {products.reduce((sum, p) => sum + (p.fridgeStock || 0), 0)} عدد
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Warehouse className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">انبار مرکزی / ذخیره</span>
                  <span className="text-base sm:text-lg font-black text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {products.reduce((sum, p) => sum + (p.warehouseStock || 0), 0)} عدد
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">ارزش کل موجودی</span>
                  <span className="text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {formatToman(totalInventoryValue)} ت
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
                onChange={(e) => {
                  setSearch(e.target.value);
                  setProdPage(1);
                }}
                placeholder="جستجوی نام کالا یا بارکد..."
                className="w-full pl-4 pr-9 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar w-full sm:w-auto">
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setProdPage(1);
                }}
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
                  onClick={() => {
                    setSelectedCategory(cat);
                    setProdPage(1);
                  }}
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
                    <th className="py-3 px-4">نام کالا و بسته‌بندی</th>
                    <th className="py-3 px-4">دسته‌بندی</th>
                    <th className="py-3 px-4">قیمت خرید (تومان)</th>
                    <th className="py-3 px-4">قیمت فروش (تومان)</th>
                    <th className="py-3 px-4">حاشیه سود</th>
                    <th className="py-3 px-3">
                      <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                        <Snowflake className="w-3.5 h-3.5 shrink-0" />
                        <span>یخچال / پیشخوان</span>
                      </div>
                    </th>
                    <th className="py-3 px-3">
                      <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Warehouse className="w-3.5 h-3.5 shrink-0" />
                        <span>انبار مرکزی</span>
                      </div>
                    </th>
                    <th className="py-3 px-3">موجودی کل</th>
                    <th className="py-3 px-4 text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {paginatedProducts.map((p) => {
                    const profitPerUnit = p.sellPrice - p.purchasePrice;
                    const wStock = p.warehouseStock !== undefined ? p.warehouseStock : Math.max(0, p.stock - (p.fridgeStock || 0));
                    const fStock = p.fridgeStock !== undefined ? p.fridgeStock : 0;
                    const totalStk = wStock + fStock;
                    const isFridgeEmpty = fStock <= 0;
                    const isFridgeLow = fStock > 0 && fStock <= Math.max(2, Math.round(p.minStockAlert * 0.4));
                    const isTotalLow = totalStk <= p.minStockAlert;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{p.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>واحد: {p.unit}</span>
                            {p.packageUnit && (
                              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.2 rounded text-[10px] text-slate-500">
                                هر {p.packageUnit} = {p.unitsPerPackage || 24} {p.unit}
                              </span>
                            )}
                          </div>
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

                        {/* Fridge Stock */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums font-mono ${
                                isFridgeEmpty
                                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                                  : isFridgeLow
                                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-900'
                                  : 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800'
                              }`}
                            >
                              <Snowflake className="w-3.5 h-3.5 shrink-0" />
                              <span>{fStock}</span>
                              <span className="text-[10px] font-normal">{p.unit}</span>
                            </span>
                            {isFridgeEmpty && (
                              <span className="text-[10px] text-rose-500 font-semibold hidden sm:inline">خالی!</span>
                            )}
                          </div>
                        </td>

                        {/* Warehouse Stock */}
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums font-mono bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            <Warehouse className="w-3.5 h-3.5 shrink-0" />
                            <span>{wStock}</span>
                            <span className="text-[10px] font-normal">{p.unit}</span>
                            {p.unitsPerPackage && p.unitsPerPackage > 1 && wStock >= p.unitsPerPackage && (
                              <span className="text-[10px] font-normal text-indigo-500 dark:text-indigo-400 mr-0.5">
                                ({Math.floor(wStock / p.unitsPerPackage)} {p.packageUnit})
                              </span>
                            )}
                          </span>
                        </td>

                        {/* Total Stock */}
                        <td className="py-3 px-3 tabular-nums font-black text-sm">
                          <span className={isTotalLow ? 'text-rose-600 dark:text-rose-400' : 'text-slate-800 dark:text-slate-200'}>
                            {totalStk} {p.unit}
                          </span>
                          {isTotalLow && (
                            <span className="block text-[10px] text-rose-500 font-normal">حداقل: {p.minStockAlert}</span>
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

            {/* Products Table Pagination Footer */}
            {totalProdPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-xs">
                <span className="text-slate-500">
                  صفحه {prodPage} از {totalProdPages} (نمایش {(prodPage - 1) * prodPageSize + 1} تا {Math.min(prodPage * prodPageSize, filteredProducts.length)} از {filteredProducts.length} کالا)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setProdPage((p) => Math.max(1, p - 1))}
                    disabled={prodPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800 transition-colors"
                    title="صفحه قبلی"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setProdPage((p) => Math.min(totalProdPages, p + 1))}
                    disabled={prodPage === totalProdPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800 transition-colors"
                    title="صفحه بعدی"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Inventory Circulation History Card */}
          <div className="rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#2596BE]" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  تاریخچه گردش انبار و انتقال به یخچال
                </h3>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                {inventoryLogs.length} رویداد ثبت‌شده
                {totalHistoryPages > 1 ? ` (صفحه ${historyPage} از ${totalHistoryPages})` : ''}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold sticky top-0 z-10 backdrop-blur-xs">
                    <th className="py-2.5 px-4">نوع عملیات</th>
                    <th className="py-2.5 px-4">نام کالا</th>
                    <th className="py-2.5 px-4">تعداد</th>
                    <th className="py-2.5 px-4">محل / مسیر گردش</th>
                    <th className="py-2.5 px-4">توضیحات و علت</th>
                    <th className="py-2.5 px-4">تاریخ ثبت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {inventoryLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        هنوز هیچ رویداد گردشی در انبار ثبت نشده است.
                      </td>
                    </tr>
                  ) : (
                    paginatedLogs.map((log) => {
                      let badge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          گردش انبار
                        </span>
                      );

                      if (log.type === 'fridge_transfer') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-50 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                            <Snowflake className="w-3 h-3" />
                            <span>شارژ یخچال</span>
                          </span>
                        );
                      } else if (log.type === 'restock') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <PackagePlus className="w-3 h-3" />
                            <span>خرید / ورود بار</span>
                          </span>
                        );
                      } else if (log.type === 'waste') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <Trash className="w-3 h-3" />
                            <span>ضایعات</span>
                          </span>
                        );
                      } else if (log.type === 'sale_deduction') {
                        badge = (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <Coffee className="w-3 h-3" />
                            <span>فروش و خروج</span>
                          </span>
                        );
                      }

                      return (
                        <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-4">{badge}</td>
                          <td className="py-2.5 px-4 font-bold text-slate-800 dark:text-slate-200">
                            {log.productName}
                          </td>
                          <td className="py-2.5 px-4 font-black font-mono text-slate-900 dark:text-white tabular-nums">
                            {log.quantity} عدد
                          </td>
                          <td className="py-2.5 px-4 text-[11px]">
                            {log.type === 'fridge_transfer' ? (
                              <span className="text-cyan-600 dark:text-cyan-400 font-semibold flex items-center gap-1">
                                <ArrowRightLeft className="w-3 h-3" />
                                <span>انبار مرکزی ← یخچال</span>
                              </span>
                            ) : log.sourceLocation === 'fridge' ? (
                              <span className="text-cyan-600 dark:text-cyan-400">یخچال / پیشخوان</span>
                            ) : log.sourceLocation === 'warehouse' ? (
                              <span className="text-indigo-600 dark:text-indigo-400">انبار مرکزی</span>
                            ) : log.sourceLocation === 'both' ? (
                              <span className="text-purple-600 dark:text-purple-400">ترکیبی (یخچال + انبار)</span>
                            ) : log.targetLocation === 'fridge' ? (
                              <span className="text-cyan-600 dark:text-cyan-400">یخچال</span>
                            ) : (
                              <span className="text-slate-500">انبار مرکزی</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400 text-[11px]">
                            {log.reason || '—'}
                          </td>
                          <td className="py-2.5 px-4 text-slate-400 font-mono text-[10px] tabular-nums">
                            {new Date(log.date || log.createdAt).toLocaleDateString('fa-IR')}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* History Table Pagination Footer */}
            {totalHistoryPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 text-xs">
                <span className="text-slate-500">
                  صفحه {historyPage} از {totalHistoryPages} (نمایش {(historyPage - 1) * historyPageSize + 1} تا {Math.min(historyPage * historyPageSize, inventoryLogs.length)} از {inventoryLogs.length} رویداد)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800 transition-colors"
                    title="صفحه قبلی"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                    disabled={historyPage === totalHistoryPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed hover:bg-white dark:hover:bg-slate-800 transition-colors"
                    title="صفحه بعدی"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
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

      {/* Modal 1: Create or Edit Product */}
      {(isNewProductOpen || editingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#2596BE]/10 text-[#2596BE] flex items-center justify-center font-bold">
                  <Package className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {editingProduct ? `ویرایش کالا: ${editingProduct.name}` : 'افزودن کالای جدید به بوفه'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsNewProductOpen(false);
                  setEditingProduct(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-5 space-y-4 overflow-y-auto">
              {prodError && (
                <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{prodError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام کالا *
                </label>
                <input
                  type="text"
                  required
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="مثال: ردبول ۲۵۰ میل، چیپس چی توز..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs outline-none focus:border-[#2596BE]"
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs outline-none focus:border-[#2596BE]"
                  >
                    {categoriesList.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    واحد تکی / جزء
                  </label>
                  <input
                    type="text"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                    placeholder="عدد، قوطی، لیوان..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs outline-none focus:border-[#2596BE]"
                  />
                </div>
              </div>

              {/* Bulk Packaging configuration */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
                  <Boxes className="w-4 h-4 text-[#2596BE]" />
                  <span>تنظیمات بسته‌بندی عمده (خرید باکسی / کارتنی)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      عنوان بسته عمده
                    </label>
                    <input
                      type="text"
                      value={prodPackageUnit}
                      onChange={(e) => setProdPackageUnit(e.target.value)}
                      placeholder="باکس، کارتن، شیرینگ، شانه..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      تعداد در هر بسته ({prodPackageUnit || 'باکس'})
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={prodUnitsPerPackage}
                      onChange={(e) => setProdUnitsPerPackage(e.target.value)}
                      placeholder="مثلاً ۲۴ یا ۱۲"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400">
                  راهنما: برای نوشیدنی‌های انرژی‌زا معمولاً ۲۴ عدد در باکس و برای آب معدنی ۱۲ عدد می‌باشد.
                </p>
              </div>

              {/* Pricing */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    قیمت خرید هر دانه (تومان)
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
                    قیمت فروش هر دانه (تومان) *
                  </label>
                  <input
                    type="text"
                    required
                    value={prodSellPrice ? Number(prodSellPrice).toLocaleString('en-US') : ''}
                    onChange={(e) => setProdSellPrice(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                    placeholder="0"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold text-[#2596BE]"
                  />
                </div>
              </div>

              {/* Two-tier Initial Stock Input */}
              <div className="p-3 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ArrowRightLeft className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span>موجودی اولیه تفکیک‌شده دو سطحی</span>
                  </span>
                  <span className="text-[11px] font-bold text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/60 px-2 py-0.5 rounded-lg">
                    مجموع: {(parseInt(normalizeDigits(prodWarehouseStock), 10) || 0) + (parseInt(normalizeDigits(prodFridgeStock), 10) || 0)} {prodUnit || 'عدد'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-cyan-900 dark:text-cyan-200 mb-1 flex items-center gap-1">
                      <Snowflake className="w-3.5 h-3.5 text-cyan-500" />
                      <span>موجودی در یخچال / پیشخوان</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={prodFridgeStock}
                      onChange={(e) => setProdFridgeStock(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-cyan-300 dark:border-cyan-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                    />
                    <span className="text-[10px] text-cyan-700/70 dark:text-cyan-400/70 block mt-0.5">
                      آماده فروش در ویترین یا یخچال
                    </span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-1 flex items-center gap-1">
                      <Warehouse className="w-3.5 h-3.5 text-amber-500" />
                      <span>موجودی در انبار مرکزی</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={prodWarehouseStock}
                      onChange={(e) => setProdWarehouseStock(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                    />
                    <span className="text-[10px] text-amber-700/70 dark:text-amber-400/70 block mt-0.5">
                      ذخیره پشتیبان در انبار اصلی
                    </span>
                  </div>
                </div>

                {/* Packaging equivalent helper */}
                {(() => {
                  const total = (parseInt(normalizeDigits(prodWarehouseStock), 10) || 0) + (parseInt(normalizeDigits(prodFridgeStock), 10) || 0);
                  const mult = Math.max(1, parseInt(normalizeDigits(prodUnitsPerPackage), 10) || 1);
                  const boxes = Math.floor(total / mult);
                  const rem = total % mult;
                  return (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 pt-1 border-t border-cyan-200/60 dark:border-cyan-800/60">
                      <span>معادل کل:</span>
                      <strong className="text-slate-800 dark:text-slate-200 font-mono">
                        {boxes} {prodPackageUnit || 'باکس'}
                        {rem > 0 ? ` و ${rem} ${prodUnit || 'عدد'}` : ''}
                      </strong>
                    </div>
                  );
                })()}
              </div>

              {/* Alert & Barcode */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    حداقل موجودی هشدار
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={prodMinAlert}
                    onChange={(e) => setProdMinAlert(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    بارکد کالا (اختیاری)
                  </label>
                  <input
                    type="text"
                    value={prodBarcode}
                    onChange={(e) => setProdBarcode(e.target.value)}
                    placeholder="کد اسکنر بارکدخوان..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
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
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs"
                >
                  {prodLoading ? 'در حال ثبت...' : 'ذخیره کالا'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Restock / Purchase Modal (Bulk package mode + Destination Split) */}
      {isRestockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    شارژ موجودی و ورود بار به انبار
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    خرید عمده باکسی یا تکی همراه با تفکیک محل چیدمان
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRestockOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const selectedProd = products.find((p) => p.id === restockProdId) || products[0];
              const packMult = Math.max(1, selectedProd?.unitsPerPackage || 24);
              const packageUnitName = selectedProd?.packageUnit || 'باکس';
              const pieceUnitName = selectedProd?.unit || 'عدد';

              // Calculate total pieces being restocked
              const totalUnits = restockMode === 'package'
                ? (parseInt(normalizeDigits(restockPackageCount), 10) || 0) * packMult
                : (parseInt(normalizeDigits(restockPieceCount), 10) || 0);

              // Cost calculation
              const rawCost = parseTomanInput(restockCost);
              const totalInvoiceCost = restockMode === 'package'
                ? rawCost * (parseInt(normalizeDigits(restockPackageCount), 10) || 0)
                : rawCost * totalUnits;
              const costPerPiece = totalUnits > 0 ? Math.round(totalInvoiceCost / totalUnits) : 0;

              // Split calculation
              const fridgeSplitNum = parseInt(normalizeDigits(restockFridgeSplit), 10) || 0;
              const warehouseSplitNum = restockDestination === 'split'
                ? Math.max(0, totalUnits - fridgeSplitNum)
                : restockDestination === 'warehouse'
                ? totalUnits
                : 0;
              const finalFridgeQty = restockDestination === 'split'
                ? fridgeSplitNum
                : restockDestination === 'fridge'
                ? totalUnits
                : 0;

              return (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (totalUnits <= 0) {
                      setRestockError('لطفاً تعداد ورودی معتبر وارد نمایید.');
                      return;
                    }
                    if (restockDestination === 'split' && fridgeSplitNum > totalUnits) {
                      setRestockError('تعداد چیدمان در یخچال نمی‌تواند بیشتر از کل بار ورودی باشد.');
                      return;
                    }

                    setRestockLoading(true);
                    setRestockError(null);
                    try {
                      await onRestock({
                        productId: selectedProd.id,
                        quantity: totalUnits,
                        costPerUnit: costPerPiece,
                        accountId: restockAccId || undefined,
                        date: new Date().toISOString(),
                        jalaliDate: getJalaliDateString(),
                        destination: restockDestination,
                        fridgeQuantity: finalFridgeQty,
                        warehouseQuantity: warehouseSplitNum,
                        isPackageMode: restockMode === 'package',
                        packageCount: restockMode === 'package' ? parseInt(normalizeDigits(restockPackageCount), 10) || 1 : undefined,
                      });
                      setIsRestockOpen(false);
                      onRefresh();
                    } catch (err: unknown) {
                      setRestockError(err instanceof Error ? err.message : 'خطا در ثبت شارژ انبار');
                    } finally {
                      setRestockLoading(false);
                    }
                  }}
                  className="p-5 space-y-4 overflow-y-auto"
                >
                  {restockError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{restockError}</span>
                    </div>
                  )}

                  {/* Product Picker & Current Stock Preview */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      انتخاب کالا
                    </label>
                    <select
                      value={restockProdId}
                      onChange={(e) => {
                        const newId = e.target.value;
                        setRestockProdId(newId);
                        const prod = products.find((p) => p.id === newId);
                        if (prod) {
                          setRestockCost((prod.purchasePrice * (prod.unitsPerPackage || 1)).toString());
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — (موجودی کل: {p.stock} | ❄️ یخچال: {p.fridgeStock || 0} | 📦 انبار: {p.warehouseStock || 0})
                        </option>
                      ))}
                    </select>

                    {selectedProd && (
                      <div className="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px]">
                        <span className="text-slate-500">وضعیت موجودی زنده:</span>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 font-bold">
                            <Snowflake className="w-3 h-3 text-cyan-600 dark:text-cyan-400" />
                            <span>{selectedProd.fridgeStock || 0} یخچال</span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold">
                            <Warehouse className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>{selectedProd.warehouseStock || 0} انبار</span>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Purchase Mode Toggle (Bulk Package vs Single Piece) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      نحوه خرید و ورود بار
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setRestockMode('package')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                          restockMode === 'package'
                            ? 'bg-[#2596BE] text-white border-[#2596BE] shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200'
                        }`}
                      >
                        <Boxes className="w-4 h-4" />
                        <span>خرید باکسی / عمده ({packageUnitName})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRestockMode('piece')}
                        className={`py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer border ${
                          restockMode === 'piece'
                            ? 'bg-[#2596BE] text-white border-[#2596BE] shadow-xs'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200'
                        }`}
                      >
                        <Package className="w-4 h-4" />
                        <span>خرید تکی / دانه‌ای ({pieceUnitName})</span>
                      </button>
                    </div>
                  </div>

                  {/* Quantity & Cost Inputs according to Mode */}
                  {restockMode === 'package' ? (
                    <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                            تعداد {packageUnitName}
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={restockPackageCount}
                            onChange={(e) => setRestockPackageCount(e.target.value)}
                            placeholder="مثلا 2"
                            className="w-full px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                            قیمت خرید هر {packageUnitName} (تومان)
                          </label>
                          <input
                            type="text"
                            value={restockCost ? Number(restockCost).toLocaleString('en-US') : ''}
                            onChange={(e) => setRestockCost(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                            placeholder="0"
                            className="w-full px-3 py-2 rounded-xl border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                          />
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-blue-100/60 dark:bg-blue-900/40 text-blue-900 dark:text-blue-200 text-xs flex items-center justify-between font-medium">
                        <span>ضریب: هر {packageUnitName} = {packMult} {pieceUnitName}</span>
                        <span className="font-bold">
                          جمع کل دانه‌ها: <span className="font-mono text-sm underline">{totalUnits}</span> {pieceUnitName}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          تعداد ورودی ({pieceUnitName})
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={restockPieceCount}
                          onChange={(e) => setRestockPieceCount(e.target.value)}
                          placeholder="مثلاً 24"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          قیمت خرید هر {pieceUnitName} (تومان)
                        </label>
                        <input
                          type="text"
                          value={restockCost ? Number(restockCost).toLocaleString('en-US') : ''}
                          onChange={(e) => setRestockCost(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                          placeholder="0"
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                        />
                      </div>
                    </div>
                  )}

                  {/* Destination Placement: 1) Central Warehouse, 2) Fridge, 3) Split */}
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                    <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                      تعیین محل تخلیه و چیدمان بار:
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setRestockDestination('warehouse')}
                        className={`p-2 rounded-xl text-center text-xs font-bold transition-all cursor-pointer border ${
                          restockDestination === 'warehouse'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Warehouse className="w-4 h-4 mx-auto mb-1" />
                        <span>انبار مرکزی</span>
                        <span className="block text-[10px] opacity-80 mt-0.5">کل بار به انبار</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRestockDestination('fridge')}
                        className={`p-2 rounded-xl text-center text-xs font-bold transition-all cursor-pointer border ${
                          restockDestination === 'fridge'
                            ? 'bg-cyan-500 text-white border-cyan-600 shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Snowflake className="w-4 h-4 mx-auto mb-1" />
                        <span>یخچال پیشخوان</span>
                        <span className="block text-[10px] opacity-80 mt-0.5">مستقیم به یخچال</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRestockDestination('split');
                          if (!restockFridgeSplit && totalUnits > 0) {
                            setRestockFridgeSplit(Math.min(10, totalUnits).toString());
                          }
                        }}
                        className={`p-2 rounded-xl text-center text-xs font-bold transition-all cursor-pointer border ${
                          restockDestination === 'split'
                            ? 'bg-[#2596BE] text-white border-[#2596BE] shadow-xs'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <ArrowRightLeft className="w-4 h-4 mx-auto mb-1" />
                        <span>تفکیک بار (Split)</span>
                        <span className="block text-[10px] opacity-80 mt-0.5">چیدمان همزمان</span>
                      </button>
                    </div>

                    {/* Split details input */}
                    {restockDestination === 'split' && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-semibold text-cyan-700 dark:text-cyan-300 mb-1">
                              تعداد چیدمان در یخچال (دانه)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max={totalUnits}
                              value={restockFridgeSplit}
                              onChange={(e) => setRestockFridgeSplit(e.target.value)}
                              placeholder="مثلاً 10"
                              className="w-full px-3 py-2 rounded-xl border border-cyan-400 dark:border-cyan-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                              تعداد مانده برای انبار مرکزی
                            </label>
                            <div className="px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs font-mono font-bold">
                              {warehouseSplitNum} عدد
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          مثال: از {totalUnits} عدد خرید جدید، {finalFridgeQty} عدد مستقیم در یخچال چیده شده و {warehouseSplitNum} عدد به انبار اصلی می‌رود.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Payment Account Selection */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      پرداخت هزینه فاکتور از حساب
                    </label>
                    <select
                      value={restockAccId}
                      onChange={(e) => setRestockAccId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    >
                      <option value="">بدون ثبت سند هزینه مالی (فقط شارژ انبار)</option>
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} (موجودی: {formatToman(acc.balance)} ت)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Total Cost Summary Card */}
                  {totalInvoiceCost > 0 && (
                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-xs">
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                        مبلغ کل فاکتور شارژ:
                      </span>
                      <span className="font-black font-mono text-emerald-700 dark:text-emerald-400 text-sm">
                        {formatToman(totalInvoiceCost)} تومان
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsRestockOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={restockLoading || totalUnits <= 0}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {restockLoading ? 'در حال ثبت...' : 'تأیید و ثبت شارژ انبار'}
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal 3: Quick Transfer to Fridge Modal (❄️ شارژ یخچال) */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
                  <Snowflake className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    شارژ یخچال از انبار مرکزی
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    انتقال سریع موجودی از انبار اصلی به یخچال و پیشخوان فروش
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {(() => {
              const targetProd = products.find((p) => p.id === transferProdId) || products[0];
              const wStock = targetProd?.warehouseStock || 0;
              const fStock = targetProd?.fridgeStock || 0;
              const packMult = Math.max(1, targetProd?.unitsPerPackage || 24);
              const packageUnitName = targetProd?.packageUnit || 'باکس';
              const pieceUnitName = targetProd?.unit || 'عدد';

              const rawQty = parseInt(normalizeDigits(transferQty), 10) || 0;
              const totalPiecesToTransfer = transferUnitMode === 'package' ? rawQty * packMult : rawQty;
              const isShortage = totalPiecesToTransfer > wStock;

              return (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!onTransferToFridge) return;
                    if (totalPiecesToTransfer <= 0) {
                      setTransferError('لطفاً تعداد انتقال معتبر وارد کنید.');
                      return;
                    }
                    if (isShortage) {
                      setTransferError(`موجودی انبار مرکزی (${wStock} عدد) کافی نیست!`);
                      return;
                    }

                    setTransferLoading(true);
                    setTransferError(null);
                    try {
                      await onTransferToFridge({
                        productId: targetProd.id,
                        quantity: totalPiecesToTransfer,
                        note: transferNote.trim() || undefined,
                        date: new Date().toISOString(),
                        jalaliDate: getJalaliDateString(),
                      });
                      setIsTransferModalOpen(false);
                      onRefresh();
                    } catch (err: unknown) {
                      setTransferError(err instanceof Error ? err.message : 'خطا در شارژ یخچال');
                    } finally {
                      setTransferLoading(false);
                    }
                  }}
                  className="p-5 space-y-4 overflow-y-auto"
                >
                  {transferError && (
                    <div className="p-3 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs rounded-xl flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{transferError}</span>
                    </div>
                  )}

                  {/* Product Picker */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      انتخاب کالا
                    </label>
                    <select
                      value={transferProdId}
                      onChange={(e) => {
                        setTransferProdId(e.target.value);
                        setTransferError(null);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Live Stock Comparison Card */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 text-center">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 mb-1">
                        <Warehouse className="w-3.5 h-3.5" />
                        <span>انبار مرکزی</span>
                      </div>
                      <div className="text-base font-black font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                        {wStock} {pieceUnitName}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        ({Math.floor(wStock / packMult)} {packageUnitName})
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                      <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-cyan-700 dark:text-cyan-400 mb-1">
                        <Snowflake className="w-3.5 h-3.5" />
                        <span>یخچال / پیشخوان</span>
                      </div>
                      <div className="text-base font-black font-mono text-cyan-700 dark:text-cyan-400 tabular-nums">
                        {fStock} {pieceUnitName}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        آماده فروش فوری
                      </span>
                    </div>
                  </div>

                  {/* Transfer Unit Toggle: Piece vs Package */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        مقدار انتقال به یخچال
                      </label>
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px]">
                        <button
                          type="button"
                          onClick={() => setTransferUnitMode('piece')}
                          className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-colors ${
                            transferUnitMode === 'piece'
                              ? 'bg-[#2596BE] text-white'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          تکی ({pieceUnitName})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTransferUnitMode('package')}
                          className={`px-2 py-0.5 rounded-md font-semibold cursor-pointer transition-colors ${
                            transferUnitMode === 'package'
                              ? 'bg-[#2596BE] text-white'
                              : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          بسته‌ای ({packageUnitName})
                        </button>
                      </div>
                    </div>

                    <input
                      type="number"
                      min="1"
                      value={transferQty}
                      onChange={(e) => {
                        setTransferQty(e.target.value);
                        setTransferError(null);
                      }}
                      placeholder="تعداد..."
                      className={`w-full px-3 py-2 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono font-bold ${
                        isShortage
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-slate-300 dark:border-slate-700 focus:border-cyan-500'
                      }`}
                    />

                    {transferUnitMode === 'package' && (
                      <span className="text-[11px] text-cyan-600 dark:text-cyan-400 font-medium block mt-1">
                        معادل: {totalPiecesToTransfer} {pieceUnitName} (هر {packageUnitName} = {packMult} دانه)
                      </span>
                    )}

                    {isShortage && (
                      <div className="mt-1.5 p-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          کسری موجودی انبار! موجودی انبار ({wStock} عدد) کمتر از مقدار درخواستی ({totalPiecesToTransfer} عدد) است.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Fill Buttons */}
                  <div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1.5 font-medium">
                      پر کردن سریع:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setTransferUnitMode('piece');
                          setTransferQty('5');
                          setTransferError(null);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer font-medium"
                      >
                        +۵ دانه
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTransferUnitMode('piece');
                          setTransferQty('10');
                          setTransferError(null);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer font-medium"
                      >
                        +۱۰ دانه
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTransferUnitMode('package');
                          setTransferQty('1');
                          setTransferError(null);
                        }}
                        className="px-2.5 py-1 rounded-lg text-xs bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 cursor-pointer font-medium"
                      >
                        +۱ {packageUnitName} کامل ({packMult} دانه)
                      </button>
                      {wStock > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setTransferUnitMode('piece');
                            setTransferQty(wStock.toString());
                            setTransferError(null);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 cursor-pointer font-medium"
                        >
                          انتقال کل انبار ({wStock})
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Transfer Note */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      یادداشت انتقال (اختیاری)
                    </label>
                    <input
                      type="text"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      placeholder="مثال: پر کردن یخچال ابتدای شیفت..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsTransferModalOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={transferLoading || totalPiecesToTransfer <= 0 || isShortage}
                      className="px-5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Snowflake className="w-3.5 h-3.5" />
                      <span>{transferLoading ? 'در حال انتقال...' : 'تأیید شارژ یخچال'}</span>
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}

      {/* Modal 4: Waste Modal (با تعیین محل کسر: یخچال یا انبار مرکزی) */}
      {isWasteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-500" />
                <span>ثبت ضایعات و خسارت کالا</span>
              </h2>
              <button
                type="button"
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
                    location: wasteLocation,
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
                  انتخاب کالا
                </label>
                <select
                  value={wasteProdId}
                  onChange={(e) => setWasteProdId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (یخچال: {p.fridgeStock || 0} | انبار: {p.warehouseStock || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  محل وقوع ضایعات
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWasteLocation('fridge')}
                    className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center justify-center gap-1.5 ${
                      wasteLocation === 'fridge'
                        ? 'bg-cyan-500 text-white border-cyan-600'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>از یخچال / پیشخوان</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWasteLocation('warehouse')}
                    className={`p-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center justify-center gap-1.5 ${
                      wasteLocation === 'warehouse'
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Warehouse className="w-3.5 h-3.5" />
                    <span>از انبار مرکزی</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  تعداد ضایعات (دانه)
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
