export type Role = 'admin' | 'accountant' | 'operator' | 'custom';

export interface User {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  permissions?: string[]; // 'all', 'view_dashboard', 'manage_tabs', 'manage_buffet', 'manage_transactions', 'delete_transactions', 'manage_accounts', 'manage_contacts', 'manage_staff', 'view_reports', 'manage_settings', 'manage_users'
  active?: boolean;
  phone?: string;
  password?: string;
  createdAt: string;
}

export type AccountType = 'cash' | 'bank' | 'pos';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  accountNumber?: string;
  bankName?: string;
  balance: number;
  initialBalance: number;
  description?: string;
  isDefault?: boolean;
  createdAt: string;
}

export type TransactionType =
  | 'income'
  | 'expense'
  | 'transfer'
  | 'debt_settlement'
  | 'receivable_collection';

export interface ReceiptItem {
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  date: string; // ISO String
  jalaliDate: string;
  categoryId?: string;
  categoryName?: string;
  fromAccountId?: string;
  fromAccountName?: string;
  toAccountId?: string;
  toAccountName?: string;
  personId?: string;
  personName?: string;
  description: string;
  referenceNumber?: string;
  tabId?: string; // Link to OpenTab if created from desk settlement
  receiptItems?: ReceiptItem[];
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
}

export type CategorySection =
  | 'gaming'
  | 'buffet'
  | 'vip'
  | 'event'
  | 'buffet_restock'
  | 'rent_bills'
  | 'repairs'
  | 'salary'
  | 'general';

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  section?: CategorySection | string;
  sectionLabel?: string;
  icon?: string;
  isDefault?: boolean;
  description?: string;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  purchasePrice: number;
  sellPrice: number;
  stock: number;
  minStockAlert: number;
  unit: string;
  barcode?: string;
  createdAt: string;
}

export interface GamingServiceItem {
  id: string;
  name: string;
  price: number;
  category: string;
  durationMinutes?: number;
  description?: string;
  createdAt: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  type: 'restock' | 'waste' | 'sale_deduction' | 'manual_correction';
  quantity: number;
  costPerUnit: number;
  reason: string;
  transactionId?: string;
  date: string;
  createdAt: string;
}

export type PersonType = 'customer' | 'supplier' | 'technician' | 'partner' | 'other';

export interface Person {
  id: string;
  name: string;
  phone?: string;
  type: PersonType;
  // Positive: they owe us (بدهکار به ما), Negative: we owe them (طلبکار از ما)
  currentBalance: number;
  maxCreditLimit?: number; // سقف اعتبار نسیه
  debtDueDate?: string; // مهلت تسویه بدهی به تاریخ شمسی
  smartLaunchId?: string; // شناسه سیستم اسمارت‌لانچ SmartLaunch ID
  nationalId?: string; // کد ملی (اختیاری)
  notes?: string;
  createdAt: string;
}

export interface OpenTabItem {
  id: string;
  productId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  addedAt: string;
}

export interface OpenTab {
  id: string;
  title: string; // نام میز / اتاق / دستگاه
  personId?: string;
  personName?: string;
  items: OpenTabItem[];
  totalAmount: number;
  paidAmount?: number;
  discount?: number;
  finalAmount?: number;
  depositAmount?: number; // مبلغ بیعانه پرداخت‌شده در رزرو
  reservationId?: string; // شناسه رزرو مرتبط
  notes?: string;
  startedAt: string;
  closedAt?: string;
  status: 'open' | 'closed';
  checkoutTransactionId?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled' | 'completed';

export interface Reservation {
  id: string;
  title: string; // نام دستگاه، کنسول یا اتاق
  customerName: string;
  customerPhone?: string;
  personId?: string;
  groupId?: string; // شناسه گروه برای رزروهای چند میز همزمان
  tableCount?: number;
  date: string; // تاریخ شمسی مثال 1404/07/22
  startTime: string; // ساعت شروع مثال 18:00
  endTime?: string; // ساعت پایان مثال 20:00
  depositAmount: number; // مبلغ بیعانه به تومان
  depositAccountId?: string;
  status: ReservationStatus;
  notes?: string;
  createdAt: string;
}

export interface ResetOptions {
  transactions?: boolean;
  tabs?: boolean;
  accounts?: boolean;
  debtBalances?: boolean;
  persons?: boolean;
  staffPayroll?: boolean;
  reservations?: boolean;
  inventoryLogs?: boolean;
  auditLogs?: boolean;
  stockQuantities?: boolean;
}

export interface Staff {
  id: string;
  fullName: string;
  phone: string;
  roleTitle: string;
  monthlySalary: number;
  active: boolean;
  hireDate: string;
  notes?: string;
  linkedUserId?: string;
}

export interface PayrollRecord {
  id: string;
  staffId: string;
  staffName: string;
  amount: number;
  period: string;
  accountId: string;
  accountName: string;
  paymentDate: string;
  jalaliDate: string;
  transactionId: string;
  notes?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  entityType: 'transaction' | 'account' | 'product' | 'person' | 'staff' | 'settings' | 'auth' | 'tab' | 'user';
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'transfer' | 'restore' | 'login' | 'checkout';
  userId: string;
  userName: string;
  details: string;
  timestamp: string;
}

export interface GameNetSettings {
  name: string;
  phone: string;
  address: string;
  receiptFooter: string;
  currency: 'toman';
  defaultBankAccountId?: string;
  defaultCashAccountId?: string;
  theme: 'dark' | 'light';
  customPersonTypes?: { id: string; label: string }[];
  buffetCategories?: string[];
}

export interface DashboardStats {
  todayIncome: number;
  todayExpense: number;
  todayProfit: number;
  monthIncome: number;
  monthExpense: number;
  monthProfit: number;
  cashBalance: number;
  bankBalance: number;
  totalReceivables: number;
  totalPayables: number;
  recentTransactions: Transaction[];
  incomeByCategory: { name: string; amount: number; percentage: number }[];
  expenseByCategory: { name: string; amount: number; percentage: number }[];
  trend: {
    jalaliDate: string;
    income: number;
    expense: number;
    profit: number;
  }[];
  openTabsCount?: number;
}

