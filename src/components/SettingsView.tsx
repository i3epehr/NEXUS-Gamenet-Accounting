import React, { useState, useRef } from 'react';
import {
  Building,
  Tag,
  ShieldAlert,
  Download,
  Upload,
  RotateCcw,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Shield,
  KeyRound,
  Edit2,
  Trash2,
  X,
  Check,
  Coffee,
} from 'lucide-react';
import { AuditLog, Category, CategorySection, GameNetSettings, ResetOptions, Role, User } from '../types/index.ts';
import { formatJalaliReadable } from '../utils/jalali.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';

export const INCOME_SECTIONS: { id: CategorySection; label: string }[] = [
  { id: 'gaming', label: 'گیمینگ و کرایه کنسول / PC' },
  { id: 'buffet', label: 'فروش بوفه و کافه' },
  { id: 'vip', label: 'اتاق و خدمات VIP' },
  { id: 'event', label: 'مسابقات و رویدادها' },
  { id: 'general', label: 'سایر درآمدهای عمومی' },
];

export const EXPENSE_SECTIONS: { id: CategorySection; label: string }[] = [
  { id: 'buffet_restock', label: 'خرید اجناس و شارژ بوفه' },
  { id: 'repairs', label: 'تعمیر و استهلاک تجهیزات و دسته' },
  { id: 'rent_bills', label: 'اجاره بها و قبوض گیم‌نت' },
  { id: 'salary', label: 'حقوق و دستمزد پرسنل' },
  { id: 'general', label: 'سایر هزینه‌های عمومی' },
];



const AVAILABLE_PERMISSIONS: { id: string; label: string; desc: string }[] = [
  { id: 'view_dashboard', label: 'داشبورد مدیریتی', desc: 'مشاهده آمار درآمد، سود و نمودارها' },
  { id: 'manage_tabs', label: 'میزها و حساب‌های باز', desc: 'باز کردن، بستن و تسویه میزها' },
  { id: 'manage_buffet', label: 'بوفه و انبار', desc: 'فروش مستقیم POS و کنترل موجودی' },
  { id: 'manage_transactions', label: 'دفتر تراکنش‌ها', desc: 'ثبت و ویرایش گردش‌های مالی' },
  { id: 'delete_transactions', label: 'حذف تراکنش (حساس)', desc: 'امکان حذف تراکنش‌های ثبت‌شده' },
  { id: 'manage_accounts', label: 'صندوق‌ها و حساب‌ها', desc: 'افتتاح، انتقال وجه و ویرایش موجودی' },
  { id: 'manage_contacts', label: 'اشخاص و نسیه', desc: 'مدیریت مشتریان و وصول مطالبات' },
  { id: 'manage_staff', label: 'پرسنل و حقوق', desc: 'محاسبه و پرداخت حقوق کارکنان' },
  { id: 'view_reports', label: 'گزارشات و سود/زیان', desc: 'مشاهده گزارش‌های رسمی و چاپ' },
  { id: 'manage_settings', label: 'تنظیمات کلی سیستم', desc: 'ویرایش مشخصات فروشگاه و دسته‌ها' },
  { id: 'manage_users', label: 'مدیریت کاربران و دسترسی‌ها', desc: 'ایجاد ادمین‌ها و اپراتورها' },
];

const ROLE_DEFAULT_PERMISSIONS: Record<Role, string[]> = {
  admin: AVAILABLE_PERMISSIONS.map((p) => p.id),
  accountant: [
    'view_dashboard',
    'manage_transactions',
    'manage_accounts',
    'manage_contacts',
    'manage_staff',
    'view_reports',
  ],
  operator: [
    'view_dashboard',
    'manage_tabs',
    'manage_buffet',
    'manage_transactions',
  ],
  custom: ['view_dashboard', 'manage_tabs', 'manage_buffet'],
};

interface SettingsViewProps {
  settings: GameNetSettings;
  categories: Category[];
  auditLogs: AuditLog[];
  currentUser?: User | null;
  users?: User[];
  onCreateUser?: (data: Partial<User>) => Promise<unknown>;
  onUpdateUser?: (id: string, data: Partial<User>) => Promise<unknown>;
  onDeleteUser?: (id: string) => Promise<unknown>;
  onUpdateSettings: (data: Partial<GameNetSettings>) => Promise<unknown>;
  onCreateCategory: (data: Partial<Category>) => Promise<unknown>;
  onUpdateCategory?: (id: string, data: Partial<Category>) => Promise<unknown>;
  onDeleteCategory?: (id: string) => Promise<unknown>;
  onRestoreBackup: (data: unknown) => Promise<unknown>;
  onResetData: (clean?: boolean, options?: ResetOptions) => Promise<unknown>;
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  categories,
  auditLogs,
  users = [],
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
  onUpdateSettings,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onRestoreBackup,
  onResetData,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'categories' | 'users' | 'audit' | 'backup'>('profile');

  // Profile state
  const [name, setName] = useState(settings.name);
  const [phone, setPhone] = useState(settings.phone);
  const [address, setAddress] = useState(settings.address);
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // New Category state
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'income' | 'expense'>('income');
  const [newCatSection, setNewCatSection] = useState<CategorySection>('gaming');
  const [catLoading, setCatLoading] = useState(false);

  // Edit Category state
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatType, setEditCatType] = useState<'income' | 'expense'>('income');
  const [editCatSection, setEditCatSection] = useState<CategorySection>('gaming');
  const [editCatLoading, setEditCatLoading] = useState(false);

  // Person Types Management State
  const defaultPersonTypes = [
    { id: 'customer', label: 'مشتری و گیمر' },
    { id: 'supplier', label: 'تامین‌کننده بوفه' },
    { id: 'technician', label: 'تعمیرکار تجهیزات' },
    { id: 'partner', label: 'همکار / شریک' },
    { id: 'other', label: 'متفرقه' },
  ];
  const [personTypes, setPersonTypes] = useState<{ id: string; label: string }[]>(
    settings.customPersonTypes && settings.customPersonTypes.length > 0
      ? settings.customPersonTypes
      : defaultPersonTypes
  );
  const [newPersonTypeLabel, setNewPersonTypeLabel] = useState('');
  const [editingPersonType, setEditingPersonType] = useState<{ id: string; label: string } | null>(null);

  // Buffet Categories Management State
  const defaultBuffetCats = ['نوشیدنی خنک', 'کافه گرم', 'تنقلات و اسنک', 'فست‌فود و غذا', 'شکلات و بیسکویت', 'سایر خوراکی‌ها'];
  const [buffetCats, setBuffetCats] = useState<string[]>(
    settings.buffetCategories && settings.buffetCategories.length > 0
      ? settings.buffetCategories
      : defaultBuffetCats
  );
  const [newBuffetCatName, setNewBuffetCatName] = useState('');
  const [editingBuffetCat, setEditingBuffetCat] = useState<{ oldName: string; newName: string } | null>(null);
  const [buffetCatToDelete, setBuffetCatToDelete] = useState<string | null>(null);

  // Deletion and Reset Confirmation Modals
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [catToDelete, setCatToDelete] = useState<Category | null>(null);
  const [personTypeToDelete, setPersonTypeToDelete] = useState<{ id: string; label: string } | null>(null);
  const [resetModalType, setResetModalType] = useState<'seed' | 'zero' | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Granular Reset State
  const [isGranularResetOpen, setIsGranularResetOpen] = useState(false);
  const [granularResetOptions, setGranularResetOptions] = useState<ResetOptions>({
    tabs: true,
    transactions: true,
    accounts: true,
    debtBalances: true,
    persons: true,
    stockQuantities: true,
    staffPayroll: true,
    reservations: true,
    inventoryLogs: true,
    auditLogs: true,
  });
  const [granularConsent, setGranularConsent] = useState(false);
  const [granularResetLoading, setGranularResetLoading] = useState(false);

  // Users & Permissions State
  const [isNewUserOpen, setIsNewUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userUsername, setUserUsername] = useState('');
  const [userFullName, setUserFullName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState<Role>('operator');
  const [userPermissions, setUserPermissions] = useState<string[]>(ROLE_DEFAULT_PERMISSIONS.operator);
  const [userActive, setUserActive] = useState(true);

  // Lock body scroll when any modal in SettingsView is open
  useLockBodyScroll(
    editingCategory !== null ||
    editingPersonType !== null ||
    editingBuffetCat !== null ||
    buffetCatToDelete !== null ||
    userToDelete !== null ||
    catToDelete !== null ||
    personTypeToDelete !== null ||
    resetModalType !== null ||
    isGranularResetOpen ||
    isNewUserOpen ||
    editingUser !== null
  );

  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  // Backup & Restore
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenCreateUser = () => {
    setUserUsername('');
    setUserFullName('');
    setUserPhone('');
    setUserPassword('');
    setUserRole('operator');
    setUserPermissions(ROLE_DEFAULT_PERMISSIONS.operator);
    setUserActive(true);
    setUserError(null);
    setIsNewUserOpen(true);
  };

  const handleOpenEditUser = (u: User) => {
    setEditingUser(u);
    setUserUsername(u.username);
    setUserFullName(u.fullName);
    setUserPhone(u.phone || '');
    setUserPassword('');
    setUserRole(u.role);
    setUserPermissions(u.permissions || ROLE_DEFAULT_PERMISSIONS[u.role] || []);
    setUserActive(u.active !== false);
    setUserError(null);
  };

  const handleRoleChange = (role: Role) => {
    setUserRole(role);
    if (role !== 'custom') {
      setUserPermissions(ROLE_DEFAULT_PERMISSIONS[role]);
    }
  };

  const togglePermission = (permId: string) => {
    setUserRole('custom');
    setUserPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFullName.trim()) {
      setUserError('نام کامل الزامی است.');
      return;
    }
    try {
      setUserLoading(true);
      setUserError(null);
      if (editingUser) {
        if (!onUpdateUser) return;
        await onUpdateUser(editingUser.id, {
          fullName: userFullName.trim(),
          phone: userPhone.trim(),
          role: userRole,
          permissions: userPermissions,
          active: userActive,
          password: userPassword.trim() || undefined,
        });
        setEditingUser(null);
      } else {
        if (!userUsername.trim()) {
          setUserError('نام کاربری الزامی است.');
          return;
        }
        if (!onCreateUser) return;
        await onCreateUser({
          username: userUsername.trim(),
          fullName: userFullName.trim(),
          phone: userPhone.trim(),
          role: userRole,
          permissions: userPermissions,
          active: userActive,
          password: userPassword.trim() || '123456',
        });
        setIsNewUserOpen(false);
      }
      onRefresh();
    } catch (err: unknown) {
      setUserError(err instanceof Error ? err.message : 'خطا در ثبت کاربر');
    } finally {
      setUserLoading(false);
    }
  };

  // Person Types Handlers
  const handleAddPersonType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonTypeLabel.trim()) return;
    const newId = `pt_${Date.now()}`;
    const updated = [...personTypes, { id: newId, label: newPersonTypeLabel.trim() }];
    setPersonTypes(updated);
    setNewPersonTypeLabel('');
    await onUpdateSettings({ customPersonTypes: updated });
    onRefresh();
  };

  const handleSaveEditPersonType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPersonType || !editingPersonType.label.trim()) return;
    const updated = personTypes.map((pt) =>
      pt.id === editingPersonType.id ? { ...pt, label: editingPersonType.label.trim() } : pt
    );
    setPersonTypes(updated);
    setEditingPersonType(null);
    await onUpdateSettings({ customPersonTypes: updated });
    onRefresh();
  };

  const handleDeletePersonType = (pt: { id: string; label: string }) => {
    if (personTypes.length <= 1) return;
    setPersonTypeToDelete(pt);
  };

  const handleConfirmDeletePersonType = async () => {
    if (!personTypeToDelete) return;
    const updated = personTypes.filter((pt) => pt.id !== personTypeToDelete.id);
    setPersonTypes(updated);
    await onUpdateSettings({ customPersonTypes: updated });
    setPersonTypeToDelete(null);
    onRefresh();
  };

  const handleDeleteUser = (u: User) => {
    if (!onDeleteUser) return;
    if (u.id === 'usr_admin') return;
    setUserToDelete(u);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete || !onDeleteUser) return;
    try {
      setDeleteLoading(true);
      await onDeleteUser(userToDelete.id);
      setUserToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Buffet Categories Handlers
  const handleAddBuffetCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newBuffetCatName.trim();
    if (!trimmed || buffetCats.includes(trimmed)) return;
    const updated = [...buffetCats, trimmed];
    setBuffetCats(updated);
    setNewBuffetCatName('');
    await onUpdateSettings({ buffetCategories: updated });
    onRefresh();
  };

  const handleSaveEditBuffetCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBuffetCat || !editingBuffetCat.newName.trim()) return;
    const updated = buffetCats.map((c) =>
      c === editingBuffetCat.oldName ? editingBuffetCat.newName.trim() : c
    );
    setBuffetCats(updated);
    setEditingBuffetCat(null);
    await onUpdateSettings({ buffetCategories: updated });
    onRefresh();
  };

  const handleDeleteBuffetCategory = (catName: string) => {
    if (buffetCats.length <= 1) return;
    setBuffetCatToDelete(catName);
  };

  const handleConfirmDeleteBuffetCategory = async () => {
    if (!buffetCatToDelete) return;
    const updated = buffetCats.filter((c) => c !== buffetCatToDelete);
    setBuffetCats(updated);
    setBuffetCatToDelete(null);
    await onUpdateSettings({ buffetCategories: updated });
    onRefresh();
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setProfileLoading(true);
      setProfileSuccess(false);
      await onUpdateSettings({
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        receiptFooter: receiptFooter.trim(),
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
      onRefresh();
    } catch {
      // handled
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    try {
      setCatLoading(true);
      const secLabel =
        newCatType === 'income'
          ? INCOME_SECTIONS.find((s) => s.id === newCatSection)?.label || 'عمومی'
          : EXPENSE_SECTIONS.find((s) => s.id === newCatSection)?.label || 'عمومی';

      await onCreateCategory({
        name: newCatName.trim(),
        type: newCatType,
        section: newCatSection,
        sectionLabel: secLabel,
      });
      setNewCatName('');
      onRefresh();
    } catch {
      // handled
    } finally {
      setCatLoading(false);
    }
  };

  const handleOpenEditCategory = (cat: Category) => {
    setEditingCategory(cat);
    setEditCatName(cat.name);
    setEditCatType(cat.type);
    setEditCatSection((cat.section as CategorySection) || (cat.type === 'income' ? 'gaming' : 'buffet_restock'));
  };

  const handleSaveEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !onUpdateCategory) return;
    if (!editCatName.trim()) return;
    try {
      setEditCatLoading(true);
      const secLabel =
        editCatType === 'income'
          ? INCOME_SECTIONS.find((s) => s.id === editCatSection)?.label || 'عمومی'
          : EXPENSE_SECTIONS.find((s) => s.id === editCatSection)?.label || 'عمومی';

      await onUpdateCategory(editingCategory.id, {
        name: editCatName.trim(),
        type: editCatType,
        section: editCatSection,
        sectionLabel: secLabel,
      });
      setEditingCategory(null);
      onRefresh();
    } catch {
      // handled
    } finally {
      setEditCatLoading(false);
    }
  };

  const handleDeleteCategory = (cat: Category) => {
    setCatToDelete(cat);
  };

  const handleConfirmDeleteCategory = async () => {
    if (!catToDelete || !onDeleteCategory) return;
    try {
      setDeleteLoading(true);
      await onDeleteCategory(catToDelete.id);
      setCatToDelete(null);
      onRefresh();
    } catch {
      // handled
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDownloadBackup = () => {
    window.location.href = '/api/backup/download';
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setRestoreLoading(true);
        setRestoreMessage(null);
        const json = JSON.parse(event.target?.result as string);
        await onRestoreBackup(json);
        setRestoreMessage('فایل پشتیبان با موفقیت بازیابی شد.');
        onRefresh();
      } catch {
        setRestoreMessage('خطا در خواندن یا بازیابی فایل پشتیبان.');
      } finally {
        setRestoreLoading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmReset = async () => {
    if (!resetModalType) return;
    try {
      setResetLoading(true);
      await onResetData(resetModalType === 'zero');
      setResetModalType(null);
      onRefresh();
    } catch {
      // handled
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
          تنظیمات سیستم، دسترسی‌ها و پشتیبان‌گیری
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          مشخصات مجموعه، دسته‌بندی‌ها، کاربران، گزارش وقایع و مدیریت پایگاه داده
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1 text-xs font-semibold overflow-x-auto no-scrollbar">
        {[
          { id: 'profile', label: 'اطلاعات فروشگاه', icon: <Building className="w-4 h-4" /> },
          { id: 'categories', label: 'دسته‌بندی‌ها و بوفه', icon: <Tag className="w-4 h-4" /> },
          { id: 'users', label: 'مدیریت کاربران و دسترسی', icon: <Users className="w-4 h-4" /> },
          { id: 'audit', label: 'گزارش وقایع (Audit)', icon: <ShieldAlert className="w-4 h-4" /> },
          { id: 'backup', label: 'پشتیبان و صفر کردن داده‌ها', icon: <Download className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-[#2596BE] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Profile */}
      {activeTab === 'profile' && (
        <div className="max-w-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-5">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            مشخصات کلی مجموعه و فاکتور چاپی
          </h2>
          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                نام مجموعه / گیم‌نت
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                تلفن تماس
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                آدرس مجموعه
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                متن پاورقی فیش چاپی حرارتی
              </label>
              <textarea
                rows={2}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
              />
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              {profileSuccess && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  تنظیمات با موفقیت ذخیره شد
                </span>
              )}
              <button
                type="submit"
                disabled={profileLoading}
                className="mr-auto px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                {profileLoading ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Categories (Transaction Categories & Buffet Categories) */}
      {activeTab === 'categories' && (
        <div className="space-y-6 max-w-4xl">
          {/* Buffet Categories Management Card */}
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-[#2596BE] flex items-center gap-1.5">
                  <Coffee className="w-4 h-4" />
                  <span>دسته‌بندی‌های بوفه و خوراکی‌ها ({buffetCats.length} دسته)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  دسته‌بندی‌های قابل انتخاب برای کالاهای بوفه و کافه گیم‌نت
                </p>
              </div>
              <form onSubmit={handleAddBuffetCategory} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newBuffetCatName}
                  onChange={(e) => setNewBuffetCatName(e.target.value)}
                  placeholder="عنوان دسته جدید..."
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-48 sm:w-56"
                />
                <button
                  type="submit"
                  disabled={!newBuffetCatName.trim()}
                  className="px-3.5 py-1.5 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  + افزودن
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {buffetCats.map((catName) => (
                <div
                  key={catName}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{catName}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingBuffetCat({ oldName: catName, newName: catName })}
                      className="p-1 text-slate-400 hover:text-[#2596BE] rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title="ویرایش نام دسته"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteBuffetCategory(catName)}
                      disabled={buffetCats.length <= 1}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer disabled:opacity-30"
                      title="حذف دسته"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add Transaction Category Form */}
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-[#2596BE]" />
                <span>تعریف سرفصل مالی جدید و انتساب به بخش سیستم</span>
              </h2>
            </div>
            <form onSubmit={handleAddCategory} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-5">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    عنوان سرفصل
                  </label>
                  <input
                    type="text"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    placeholder="مثال: بازی‌های VR یا تجهیزات..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    نوع مالی
                  </label>
                  <select
                    value={newCatType}
                    onChange={(e) => {
                      const t = e.target.value as 'income' | 'expense';
                      setNewCatType(t);
                      setNewCatSection(t === 'income' ? 'gaming' : 'buffet_restock');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                  >
                    <option value="income">درآمد (ورودی)</option>
                    <option value="expense">هزینه (خروجی)</option>
                  </select>
                </div>
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    بخش مرتبط سیستم
                  </label>
                  <select
                    value={newCatSection}
                    onChange={(e) => setNewCatSection(e.target.value as CategorySection)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                  >
                    {(newCatType === 'income' ? INCOME_SECTIONS : EXPENSE_SECTIONS).map((sec) => (
                      <option key={sec.id} value={sec.id}>
                        {sec.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={catLoading || !newCatName.trim()}
                  className="px-5 py-2 bg-[#2596BE] text-white text-xs font-bold rounded-xl hover:bg-[#1E7E9E] transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>+ افزودن دسته‌بندی جدید</span>
                </button>
              </div>
            </form>
          </div>

          {/* Categories Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-emerald-600 dark:text-emerald-400">
                سرفصل‌های درآمد ({categories.filter((c) => c.type === 'income').length})
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {categories.filter((c) => c.type === 'income').map((cat) => (
                  <div key={cat.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-[#2596BE]/10 text-[#2596BE] whitespace-nowrap">
                        {cat.sectionLabel ||
                          INCOME_SECTIONS.find((s) => s.id === cat.section)?.label ||
                          'عمومی'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditCategory(cat)}
                        className="p-1 text-slate-400 hover:text-[#2596BE] rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="ویرایش"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
              <h3 className="font-bold text-xs text-rose-600 dark:text-rose-400">
                سرفصل‌های هزینه ({categories.filter((c) => c.type === 'expense').length})
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {categories.filter((c) => c.type === 'expense').map((cat) => (
                  <div key={cat.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 whitespace-nowrap">
                        {cat.sectionLabel ||
                          EXPENSE_SECTIONS.find((s) => s.id === cat.section)?.label ||
                          'عمومی'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditCategory(cat)}
                        className="p-1 text-slate-400 hover:text-[#2596BE] rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="ویرایش"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Person Types / Customer & Supplier Categories */}
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-xs sm:text-sm text-purple-600 dark:text-purple-400">
                  انواع و گروه‌بندی اشخاص ({personTypes.length} گروه)
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  گروه‌های طرف حساب (مشتری، تامین‌کننده، تعمیرکار...)
                </p>
              </div>
              <form onSubmit={handleAddPersonType} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newPersonTypeLabel}
                  onChange={(e) => setNewPersonTypeLabel(e.target.value)}
                  placeholder="عنوان نوع شخص..."
                  className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs w-48 sm:w-56"
                />
                <button
                  type="submit"
                  disabled={!newPersonTypeLabel.trim()}
                  className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  + افزودن
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {personTypes.map((pt) => (
                <div
                  key={pt.id}
                  className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 flex items-center justify-between text-xs"
                >
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{pt.label}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingPersonType({ id: pt.id, label: pt.label })}
                      className="p-1 text-slate-400 hover:text-purple-600 rounded-md hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors cursor-pointer"
                      title="ویرایش"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeletePersonType(pt)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Edit Person Type Modal */}
          {editingPersonType && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
              <div className="w-full max-w-sm bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    ویرایش نوع شخص
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingPersonType(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveEditPersonType} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      عنوان نوع شخص
                    </label>
                    <input
                      type="text"
                      value={editingPersonType.label}
                      onChange={(e) => setEditingPersonType({ ...editingPersonType, label: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingPersonType(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={!editingPersonType.label.trim()}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
                    >
                      ذخیره
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Category Modal */}
          {editingCategory && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
              <div className="w-full max-w-md bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    ویرایش دسته‌بندی مالی
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingCategory(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveEditCategory} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      نام دسته‌بندی
                    </label>
                    <input
                      type="text"
                      value={editCatName}
                      onChange={(e) => setEditCatName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      نوع سرفصل
                    </label>
                    <select
                      value={editCatType}
                      onChange={(e) => {
                        const t = e.target.value as 'income' | 'expense';
                        setEditCatType(t);
                        setEditCatSection(t === 'income' ? 'gaming' : 'buffet_restock');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                    >
                      <option value="income">درآمد (ورودی)</option>
                      <option value="expense">هزینه (خروجی)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      بخش مرتبط سیستم
                    </label>
                    <select
                      value={editCatSection}
                      onChange={(e) => setEditCatSection(e.target.value as CategorySection)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                    >
                      {(editCatType === 'income' ? INCOME_SECTIONS : EXPENSE_SECTIONS).map((sec) => (
                        <option key={sec.id} value={sec.id}>
                          {sec.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingCategory(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={editCatLoading}
                      className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      {editCatLoading ? 'در حال ذخیره...' : 'ذخیره'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Edit Buffet Category Modal */}
          {editingBuffetCat && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
              <div className="w-full max-w-sm bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    ویرایش دسته‌بندی بوفه
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingBuffetCat(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <form onSubmit={handleSaveEditBuffetCategory} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      عنوان دسته
                    </label>
                    <input
                      type="text"
                      value={editingBuffetCat.newName}
                      onChange={(e) =>
                        setEditingBuffetCat({ ...editingBuffetCat, newName: e.target.value })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold"
                      autoFocus
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setEditingBuffetCat(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={!editingBuffetCat.newName.trim()}
                      className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl cursor-pointer"
                    >
                      ذخیره
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Users & Access Permissions (RBAC) */}
      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#2596BE]" />
                <span>مدیریت کاربران، ادمین‌ها و مجوزهای دسترسی</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                تعریف نام کاربری، رمز عبور، نقش و تفکیک دسترسی‌های پنل (RBAC)
              </p>
            </div>
            {onCreateUser && (
              <button
                onClick={handleOpenCreateUser}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold transition-all shadow-xs cursor-pointer self-start sm:self-auto"
              >
                <PlusCircle className="w-4 h-4" />
                <span>تعریف کاربر جدید</span>
              </button>
            )}
          </div>

          {/* Password Storage & Reset Information Banner */}
          <div className="p-4 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-200">
              <KeyRound className="w-4 h-4 text-[#2596BE]" />
              <span>محل نگهداری و تغییر رمزهای عبور کاربران:</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              کلیه نام‌های کاربری و کلمات عبور در فایل امن پایگاه داده سرور (<code className="text-[#2596BE] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800">data/nexus_db.json</code>) ذخیره می‌شوند.
              اگر رمز عبوری را فراموش کردید یا مایل به تعویض آن بودید، کافیست روی دکمه <strong>«ویرایش دسترسی و رمز»</strong> در کارت کاربر مربوطه کلیک کنید و در فیلد رمز عبور، پسورد جدید را تایپ نمایید. بدون نیاز به دانستن رمز قبلی، رمز جدید فورا ثبت و جایگزین می‌شود.
            </p>
          </div>

          {/* User Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {users.map((u) => {
              const roleLabels: Record<Role, { label: string; color: string }> = {
                admin: { label: 'مدیر کل (Super Admin)', color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20' },
                accountant: { label: 'حسابدار', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                operator: { label: 'اپراتور شیفت', color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' },
                custom: { label: 'دسترسی سفارشی', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' },
              };
              const roleBadge = roleLabels[u.role] || roleLabels.operator;
              const perms = u.permissions || ROLE_DEFAULT_PERMISSIONS[u.role] || [];

              return (
                <div
                  key={u.id}
                  className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4 hover:border-[#2596BE]/40 transition-colors"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#2596BE]/15 text-[#2596BE] flex items-center justify-center font-bold text-sm">
                          {u.fullName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                            {u.fullName}
                          </h3>
                          <span className="text-xs text-slate-400 font-mono">@{u.username}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${roleBadge.color}`}>
                        {roleBadge.label}
                      </span>
                    </div>

                    {u.phone && (
                      <div className="text-xs text-slate-500 flex items-center gap-1 font-mono">
                        <span>موبایل:</span>
                        <span>{u.phone}</span>
                      </div>
                    )}

                    {/* Permissions tags */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <span className="text-[11px] text-slate-400 block mb-1.5 font-medium">
                        دسترسی‌های فعال ({perms.length} از {AVAILABLE_PERMISSIONS.length}):
                      </span>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {AVAILABLE_PERMISSIONS.map((p) => {
                          const hasPerm = perms.includes(p.id) || perms.includes('all');
                          return (
                            <span
                              key={p.id}
                              className={`text-[10px] px-2 py-0.5 rounded-md transition-colors ${
                                hasPerm
                                  ? 'bg-[#2596BE]/10 text-[#2596BE] font-medium'
                                  : 'bg-slate-100 dark:bg-slate-800/50 text-slate-400 line-through opacity-50'
                              }`}
                            >
                              {p.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    {onUpdateUser && (
                      <button
                        onClick={() => handleOpenEditUser(u)}
                        className="flex-1 py-1.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#2596BE] text-slate-700 dark:text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>ویرایش دسترسی و رمز</span>
                      </button>
                    )}
                    {onDeleteUser && u.id !== 'usr_admin' && (
                      <button
                        onClick={() => handleDeleteUser(u)}
                        title="حذف کاربر"
                        className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-900 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Create or Edit User Modal */}
          {(isNewUserOpen || editingUser) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
              <div className="w-full max-w-xl bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-[#2596BE]" />
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {editingUser ? `ویرایش کاربر: ${editingUser.fullName}` : 'ایجاد حساب کاربری جدید'}
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setIsNewUserOpen(false);
                      setEditingUser(null);
                    }}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {userError && (
                  <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{userError}</span>
                  </div>
                )}

                <form onSubmit={handleSaveUser} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        نام و نام خانوادگی
                      </label>
                      <input
                        type="text"
                        value={userFullName}
                        onChange={(e) => setUserFullName(e.target.value)}
                        placeholder="علیرضا محمدی"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        نام کاربری (انگلیسی)
                      </label>
                      <input
                        type="text"
                        value={userUsername}
                        onChange={(e) => setUserUsername(e.target.value)}
                        disabled={!!editingUser}
                        placeholder="alireza_admin"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono disabled:opacity-50"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        شماره موبایل
                      </label>
                      <input
                        type="text"
                        value={userPhone}
                        onChange={(e) => setUserPhone(e.target.value)}
                        placeholder="0912..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        رمز عبور {editingUser && '(در صورت خالی بودن تغییر نمی‌کند)'}
                      </label>
                      <input
                        type="password"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        placeholder={editingUser ? 'تغییر رمز...' : 'رمز عبور (پیش‌فرض: 123456)'}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                      />
                    </div>
                  </div>

                  {/* Role Selector Presets */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      سطح و نقش کاربری
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { id: 'admin', label: 'ادمین کل' },
                        { id: 'accountant', label: 'حسابدار' },
                        { id: 'operator', label: 'اپراتور' },
                        { id: 'custom', label: 'سفارشی' },
                      ].map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => handleRoleChange(r.id as Role)}
                          className={`py-2 px-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                            userRole === r.id
                              ? 'bg-[#2596BE] text-white border-[#2596BE] shadow-xs'
                              : 'bg-slate-50 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-[#2596BE]/40'
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Granular Permissions Checklist */}
                  <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <label className="block text-xs font-bold text-slate-800 dark:text-white">
                      مجوزهای دسترسی به بخش‌های سیستم (اگر کاربر دسترسی نداشته باشد در منو کم‌رنگ می‌شود):
                    </label>
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {AVAILABLE_PERMISSIONS.map((perm) => {
                        const isChecked = userPermissions.includes(perm.id) || userPermissions.includes('all');
                        return (
                          <div
                            key={perm.id}
                            onClick={() => togglePermission(perm.id)}
                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                              isChecked
                                ? 'bg-[#2596BE]/10 border-[#2596BE]/40 text-slate-900 dark:text-white'
                                : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 opacity-80'
                            }`}
                          >
                            <div
                              className={`w-4 h-4 rounded-md mt-0.5 flex items-center justify-center shrink-0 border transition-all ${
                                isChecked
                                  ? 'bg-[#2596BE] border-[#2596BE] text-white'
                                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-bold block">{perm.label}</span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 block">{perm.desc}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="userActive"
                      checked={userActive}
                      onChange={(e) => setUserActive(e.target.checked)}
                      className="rounded text-[#2596BE]"
                    />
                    <label htmlFor="userActive" className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                      حساب کاربری فعال است
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setIsNewUserOpen(false);
                        setEditingUser(null);
                      }}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      disabled={userLoading}
                      className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      {userLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>{userLoading ? 'در حال ثبت...' : editingUser ? 'ذخیره تغییرات' : 'ایجاد حساب کاربر'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Audit Trail */}
      {activeTab === 'audit' && (
        <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                دفتر ثبت رخدادها و امنیت (Audit Trail)
              </h2>
              <p className="text-xs text-slate-500">
                ردگیری کلیه عملیات‌های حساس شامل ایجاد، ویرایش، حذف و ورود کاربران
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">زمان و تاریخ</th>
                  <th className="py-2.5 px-3">کاربر</th>
                  <th className="py-2.5 px-3">بخش</th>
                  <th className="py-2.5 px-3">عملیات</th>
                  <th className="py-2.5 px-3">جزئیات تغییرات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400">
                      {formatJalaliReadable(log.timestamp, true)}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                      {log.userName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{log.entityType}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Backup & Restore & Zero Data Handover */}
      {activeTab === 'backup' && (
        <div className="max-w-xl space-y-5">
          {/* 1. Backup Download */}
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#2596BE]/10 text-[#2596BE] flex items-center justify-center">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  دریافت فایل پشتیبان کامل (JSON)
                </h3>
                <p className="text-xs text-slate-500">
                  دانلود نسخه کامل پایگاه داده شامل تراکنش‌ها، کالاها، حساب‌ها و اشخاص
                </p>
              </div>
            </div>
            <button
              onClick={handleDownloadBackup}
              className="w-full py-2.5 px-4 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>دانلود فایل پشتیبان (Backup)</span>
            </button>
          </div>

          {/* 2. Restore Backup */}
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  بازیابی اطلاعات از فایل پشتیبان
                </h3>
                <p className="text-xs text-slate-500">
                  بارگذاری فایل JSON جهت بازگردانی اطلاعات قبلی
                </p>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={restoreLoading}
              className="w-full py-2.5 px-4 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 border border-slate-700"
            >
              <Upload className="w-4 h-4" />
              <span>انتخاب فایل JSON و بازیابی</span>
            </button>
            {restoreMessage && (
              <p className="text-xs text-center font-semibold text-[#2596BE]">
                {restoreMessage}
              </p>
            )}
          </div>

          {/* 3. Clean Zero (صفر کردن انتخابی داده‌ها) */}
          <div className="bg-rose-500/10 dark:bg-rose-950/30 border-2 border-rose-500/40 dark:border-rose-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-rose-700 dark:text-rose-400 font-extrabold text-sm">
              <RotateCcw className="w-5 h-5 text-rose-600" />
              <span>صفر کردن یا بازنشانی انتخابی داده‌ها</span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              با انتخاب این گزینه، پنجره انتخاب بخش‌ها باز می‌شود تا بتوانید مشخص کنید دقیقا کدام اطلاعات (تراکنش‌ها، سفارشات میزها، موجودی صندوق‌ها، اشخاص و بدهی‌ها، انبار و ...) صفر یا پاک شوند.
            </p>
            <button
              type="button"
              onClick={() => setIsGranularResetOpen(true)}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md shadow-rose-600/20 flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>صفر کردن انتخابی داده‌ها (با انتخاب بخش‌ها)</span>
            </button>
          </div>

          {/* 4. Reset To Seed Data */}
          <div className="bg-amber-500/10 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-900/60 rounded-2xl p-5 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-bold text-xs">
              <AlertCircle className="w-4 h-4" />
              <span>بازنشانی به داده‌های اولیه</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              بازگردانی تراکنش‌ها و میزهای پیش‌فرض پایه برای راه‌اندازی اولیه سامانه.
            </p>
            <button
              type="button"
              onClick={() => setResetModalType('seed')}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
            >
              بازنشانی داده‌های پایه
            </button>
          </div>
        </div>
      )}

      {/* Comprehensive Granular Data Reset Modal (صفر کردن انتخابی داده‌ها) */}
      {isGranularResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-2xl bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-600" />
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    صفر کردن یا بازنشانی انتخابی داده‌ها
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  بخش‌هایی را که مایلید صفر و پاک‌سازی شوند انتخاب نمایید:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGranularResetOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Select Buttons */}
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-slate-100 dark:bg-slate-900/60 text-xs">
              <span className="font-semibold text-slate-600 dark:text-slate-400">
                انتخاب سریع:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setGranularResetOptions({
                      tabs: true,
                      transactions: true,
                      accounts: true,
                      debtBalances: true,
                      persons: true,
                      stockQuantities: true,
                      staffPayroll: true,
                      reservations: true,
                      inventoryLogs: true,
                      auditLogs: true,
                    })
                  }
                  className="px-3 py-1 rounded-lg bg-[#2596BE]/15 text-[#2596BE] hover:bg-[#2596BE]/25 font-bold cursor-pointer"
                >
                  انتخاب همه موارد
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGranularResetOptions({
                      tabs: false,
                      transactions: false,
                      accounts: false,
                      debtBalances: false,
                      persons: false,
                      stockQuantities: false,
                      staffPayroll: false,
                      reservations: false,
                      inventoryLogs: false,
                      auditLogs: false,
                    })
                  }
                  className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
                >
                  لغو انتخاب همه
                </button>
              </div>
            </div>

            {/* Options Checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-72 overflow-y-auto p-1">
              {[
                { key: 'tabs', title: 'میزها و سفارش‌های باز و بسته‌شده', desc: 'پاک‌سازی کلیه فاکتورها و سوابق میزهای بازی' },
                { key: 'transactions', title: 'دفتر کل تراکنش‌ها و اسناد مالی', desc: 'حذف تمامی درآمدها، هزینه‌ها و واریزی‌ها' },
                { key: 'accounts', title: 'موجودی حساب‌ها و صندوق‌ها', desc: 'صفر کردن (۰ تومان) موجودی دخل و کارتخوان‌ها' },
                { key: 'debtBalances', title: 'مانده بدهی و طلبکاری اشخاص', desc: 'صفر کردن صورت‌حساب نسیه و مانده بدهی مشتریان' },
                { key: 'persons', title: 'پاک‌سازی کامل اشخاص و طرف‌حساب‌ها', desc: 'حذف کامل پرونده مشتریان و تامین‌کنندگان' },
                { key: 'stockQuantities', title: 'موجودی انبار بوفه و کافه', desc: 'صفر کردن موجودی عددی تمام کالاها در انبار' },
                { key: 'staffPayroll', title: 'سوابق حقوق و دستمزد پرسنل', desc: 'پاک‌سازی تاریخچه فیش‌های حقوقی و پرداخت‌ها' },
                { key: 'reservations', title: 'نوبت‌ها و رزروهای جا', desc: 'حذف لیست تمامی رزروهای ثبت‌شده' },
                { key: 'inventoryLogs', title: 'تاریخچه ورود/خروج و ضایعات انبار', desc: 'پاک‌سازی گزارش‌های انبارداری' },
                { key: 'auditLogs', title: 'تاریخچه وقایع سیستم (Audit Logs)', desc: 'پاک‌سازی گزارش لاگ‌های مدیریتی' },
              ].map((item) => {
                const isChecked = !!granularResetOptions[item.key as keyof ResetOptions];
                return (
                  <label
                    key={item.key}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                      isChecked
                        ? 'border-rose-500/40 bg-rose-500/5 dark:bg-rose-950/20'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 opacity-70'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setGranularResetOptions((prev) => ({
                          ...prev,
                          [item.key]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                    />
                    <div className="space-y-0.5 min-w-0">
                      <span className={`text-xs font-bold block ${isChecked ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        {item.title}
                      </span>
                      <span className="text-[11px] text-slate-400 block leading-tight">
                        {item.desc}
                      </span>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Consent & Security Confirmation */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2">
              <label className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={granularConsent}
                  onChange={(e) => setGranularConsent(e.target.checked)}
                  className="rounded text-rose-600 focus:ring-rose-500 w-4 h-4 cursor-pointer"
                />
                <span>مسئولیت صفر و پاک شدن بخش‌های انتخاب‌شده را برای تحویل به مشتری می‌پذیرم</span>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsGranularResetOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={!granularConsent || granularResetLoading}
                onClick={async () => {
                  try {
                    setGranularResetLoading(true);
                    await onResetData(true, granularResetOptions);
                    setIsGranularResetOpen(false);
                    setGranularConsent(false);
                    onRefresh();
                  } catch {
                    alert('خطا در پاک‌سازی داده‌ها');
                  } finally {
                    setGranularResetLoading(false);
                  }
                }}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-md shadow-rose-600/25 flex items-center gap-2"
              >
                {granularResetLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                <span>{granularResetLoading ? 'در حال صفر کردن...' : 'صفر کردن بخش‌های انتخاب‌شده'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Data Reset (Seed) */}
      <ConfirmModal
        isOpen={resetModalType === 'seed'}
        title="بازنشانی به داده‌های اولیه دمو"
        message="آیا مایلید کلیه اطلاعات فعلی با داده‌های اولیه و نمونه دمو جایگزین شوند؟"
        confirmText="بله، بازنشانی شود"
        variant="warning"
        isLoading={resetLoading}
        onConfirm={handleConfirmReset}
        onClose={() => setResetModalType(null)}
      />

      {/* Confirmation Modal: User Deletion */}
      <ConfirmModal
        isOpen={!!userToDelete}
        title="حذف کاربر سیستم"
        message={`آیا مطمئن هستید که می‌خواهید کاربر "${userToDelete?.fullName}" (${userToDelete?.username}) را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDeleteUser}
        onClose={() => setUserToDelete(null)}
      />

      {/* Confirmation Modal: Category Deletion */}
      <ConfirmModal
        isOpen={!!catToDelete}
        title="حذف دسته‌بندی مالی"
        message={`آیا مطمئن هستید که می‌خواهید دسته‌بندی "${catToDelete?.name}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDeleteCategory}
        onClose={() => setCatToDelete(null)}
      />

      {/* Confirmation Modal: Buffet Category Deletion */}
      <ConfirmModal
        isOpen={!!buffetCatToDelete}
        title="حذف دسته‌بندی بوفه"
        message={`آیا مطمئن هستید که می‌خواهید دسته‌بندی "${buffetCatToDelete}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        onConfirm={handleConfirmDeleteBuffetCategory}
        onClose={() => setBuffetCatToDelete(null)}
      />

      {/* Confirmation Modal: Person Type Deletion */}
      <ConfirmModal
        isOpen={!!personTypeToDelete}
        title="حذف نوع شخص"
        message={`آیا مطمئن هستید که می‌خواهید گروه "${personTypeToDelete?.label}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        variant="danger"
        onConfirm={handleConfirmDeletePersonType}
        onClose={() => setPersonTypeToDelete(null)}
      />
    </div>
  );
};
