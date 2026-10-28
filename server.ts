import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  Account,
  AuditLog,
  Category,
  GameNetSettings,
  GamingServiceItem,
  InventoryLog,
  OpenTab,
  OpenTabItem,
  PayrollRecord,
  Person,
  Product,
  ReceiptItem,
  Reservation,
  Staff,
  Transaction,
  TransactionType,
  User,
} from './src/types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Path for persistent storage
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'nexus_db.json');
const DB_BAK_FILE = path.join(DATA_DIR, 'nexus_db.json.bak');

interface DatabaseSchema {
  settings: GameNetSettings;
  users: User[];
  accounts: Account[];
  categories: Category[];
  products: Product[];
  inventoryLogs: InventoryLog[];
  persons: Person[];
  openTabs: OpenTab[];
  reservations: Reservation[];
  staff: Staff[];
  payrollRecords: PayrollRecord[];
  transactions: Transaction[];
  auditLogs: AuditLog[];
  gamingServices?: GamingServiceItem[];
}

// Default Gaming & ID Service Items (کرایه زمان کنسول، سیستم و شارژ اکانت/آیدی)
function getDefaultGamingServices(): GamingServiceItem[] {
  const nowIso = new Date().toISOString();
  return [
    {
      id: 'srv_ps5_1h',
      name: '۱ ساعت PS5',
      price: 80000,
      category: 'کرایه کنسول',
      durationMinutes: 60,
      description: 'کرایه یک ساعت کنسول پلی‌استیشن ۵',
      createdAt: nowIso,
    },
    {
      id: 'srv_ps5_2h',
      name: '۲ ساعت PS5',
      price: 150000,
      category: 'کرایه کنسول',
      durationMinutes: 120,
      description: 'کرایه دو ساعت کنسول پلی‌استیشن ۵ با تخفیف',
      createdAt: nowIso,
    },
    {
      id: 'srv_ps5_extra_ctrl',
      name: 'کرایه دسته اضافی',
      price: 30000,
      category: 'کرایه کنسول',
      durationMinutes: 60,
      description: 'دسته اضافی دوال‌سنس برای بازی دونفره و چندنفره',
      createdAt: nowIso,
    },
    {
      id: 'srv_pc_1h',
      name: '۱ ساعت PC گیمینگ',
      price: 50000,
      category: 'PC گیمینگ',
      durationMinutes: 60,
      description: 'سیستم پی‌سی گیمینگ با مانیتور ۱۴۴ هرتز',
      createdAt: nowIso,
    },
    {
      id: 'srv_pc_2h',
      name: '۲ ساعت PC گیمینگ',
      price: 95000,
      category: 'PC گیمینگ',
      durationMinutes: 120,
      description: 'دو ساعت گیم‌پلی سیستم پی‌سی',
      createdAt: nowIso,
    },
    {
      id: 'srv_vip_1h',
      name: '۱ ساعت اتاق VIP',
      price: 250000,
      category: 'اتاق VIP',
      durationMinutes: 60,
      description: 'اتاق اختصاصی وی‌آی‌پی با نمایشگر بزرگ و صدای ساراند',
      createdAt: nowIso,
    },
    {
      id: 'srv_id_charge_50',
      name: 'شارژ آیدی / اکانت گیمینگ (۵۰ هزار تومانی)',
      price: 50000,
      category: 'آیدی و اکانت',
      description: 'شارژ اعتبار کیف پول یا حساب کاربری سیستم اسمارت‌لانچ / لانچر',
      createdAt: nowIso,
    },
    {
      id: 'srv_id_charge_100',
      name: 'شارژ آیدی / اکانت گیمینگ (۱۰۰ هزار تومانی)',
      price: 100000,
      category: 'آیدی و اکانت',
      description: 'شارژ اعتبار اکانت گیمر در سامانه کلوپ',
      createdAt: nowIso,
    },
    {
      id: 'srv_id_charge_200',
      name: 'شارژ آیدی / اکانت گیمینگ (۲۰۰ هزار تومانی)',
      price: 200000,
      category: 'آیدی و اکانت',
      description: 'شارژ اعتبار ویژه آیدی گیمر با بونوس',
      createdAt: nowIso,
    },
    {
      id: 'srv_id_pass',
      name: 'عضویت ماهانه آیدی گیمر VIP',
      price: 350000,
      category: 'آیدی و اکانت',
      description: 'حق عضویت و شناسه کاربری ماهانه باشگاه گیمرها',
      createdAt: nowIso,
    },
  ];
}

// Default Seed Data
function getInitialData(): DatabaseSchema {
  const now = new Date();
  const nowIso = now.toISOString();

  const daysAgoIso = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString();
  const daysAgoJalali = (d: number) => {
    const target = new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
    return `${target.getFullYear()}/${(target.getMonth() + 1).toString().padStart(2, '0')}/${target.getDate().toString().padStart(2, '0')}`;
  };

  const users: User[] = [
    {
      id: 'usr_admin',
      username: 'admin',
      fullName: 'مدیر کل سیستم (ادمین)',
      role: 'admin',
      permissions: ['all'],
      active: true,
      phone: '09121112233',
      password: 'admin',
      createdAt: nowIso,
    },
    {
      id: 'usr_operator',
      username: 'operator',
      fullName: 'اپراتور شیفت عصر',
      role: 'operator',
      permissions: ['view_dashboard', 'manage_tabs', 'manage_buffet'],
      active: true,
      phone: '09301234567',
      password: '123',
      createdAt: nowIso,
    },
    {
      id: 'usr_accountant',
      username: 'accountant',
      fullName: 'حسابدار ارشد',
      role: 'accountant',
      permissions: ['view_dashboard', 'view_reports', 'manage_accounts', 'manage_contacts'],
      active: true,
      phone: '09192223344',
      password: '123',
      createdAt: nowIso,
    },
  ];

  const accounts: Account[] = [
    {
      id: 'acc_cash',
      name: 'صندوق نقدی دخل',
      type: 'cash',
      balance: 5200000,
      initialBalance: 2000000,
      description: 'وجه نقد موجود در کشوی صندوق دخل',
      isDefault: true,
      createdAt: nowIso,
    },
    {
      id: 'acc_pos_saman',
      name: 'پوز سامان (کارتخوان ۱)',
      type: 'pos',
      bankName: 'بانک سامان',
      accountNumber: '6219-8610-1234-5678',
      balance: 18450000,
      initialBalance: 10000000,
      description: 'کارتخوان بی‌سیم پیشخوان اصلی',
      isDefault: true,
      createdAt: nowIso,
    },
    {
      id: 'acc_pos_pasargad',
      name: 'پوز پاسارگاد (کارتخوان ۲)',
      type: 'pos',
      bankName: 'بانک پاسارگاد',
      accountNumber: '5022-2910-9876-5432',
      balance: 9300000,
      initialBalance: 5000000,
      description: 'دستگاه پوز ثابت کافی‌شاپ و بوفه',
      createdAt: nowIso,
    },
    {
      id: 'acc_melli_main',
      name: 'حساب جاری بانک ملی',
      type: 'bank',
      bankName: 'بانک ملی ایران',
      accountNumber: '0102030405006',
      balance: 32000000,
      initialBalance: 30000000,
      description: 'حساب اصلی بانکی و واریز شارژها',
      createdAt: nowIso,
    },
  ];

  const categories: Category[] = [
    // Income
    { id: 'cat_ps5', name: 'کرایه کنسول PS5', type: 'income', section: 'gaming', sectionLabel: 'گیمینگ و کرایه کنسول', icon: 'Gamepad2', isDefault: true },
    { id: 'cat_pc', name: 'کرایه سیستم PC گیمینگ', type: 'income', section: 'gaming', sectionLabel: 'گیمینگ و کرایه کنسول', icon: 'Monitor', isDefault: true },
    { id: 'cat_vip', name: 'اتاق VIP اختصاصی', type: 'income', section: 'vip', sectionLabel: 'اتاق VIP', icon: 'Crown', isDefault: true },
    { id: 'cat_buffet_inc', name: 'فروش بوفه و کافه', type: 'income', section: 'buffet', sectionLabel: 'فروش بوفه و کافه', icon: 'Coffee', isDefault: true },
    { id: 'cat_tournament', name: 'ورودی مسابقات و تورنومنت', type: 'income', section: 'event', sectionLabel: 'مسابقات و ایونت', icon: 'Trophy' },
    { id: 'cat_other_inc', name: 'سایر درآمدهای متفرقه', type: 'income', section: 'general', sectionLabel: 'عمومی و متفرقه', icon: 'PlusCircle' },
    // Expense
    { id: 'cat_rent', name: 'اجاره بهای گیم نت', type: 'expense', section: 'rent_bills', sectionLabel: 'اجاره و قبوض', icon: 'Building2', isDefault: true },
    { id: 'cat_electricity', name: 'قبض برق تجاری', type: 'expense', section: 'rent_bills', sectionLabel: 'اجاره و قبوض', icon: 'Zap', isDefault: true },
    { id: 'cat_internet', name: 'اینترنت گیمینگ پینگ پایین', type: 'expense', section: 'rent_bills', sectionLabel: 'اجاره و قبوض', icon: 'Wifi', isDefault: true },
    { id: 'cat_buffet_exp', name: 'خرید اجناس بوفه', type: 'expense', section: 'buffet_restock', sectionLabel: 'خرید اجناس بوفه', icon: 'ShoppingBag', isDefault: true },
    { id: 'cat_repairs', name: 'تعمیر و سرویس دسته‌ها و سیستم‌ها', type: 'expense', section: 'repairs', sectionLabel: 'تعمیرات و تجهیزات', icon: 'Wrench', isDefault: true },
    { id: 'cat_salary', name: 'حقوق و دستمزد پرسنل', type: 'expense', section: 'salary', sectionLabel: 'حقوق و دستمزد پرسنل', icon: 'Users', isDefault: true },
    { id: 'cat_cleaning', name: 'نظافت و بهداشت محیط', type: 'expense', section: 'general', sectionLabel: 'عمومی و متفرقه', icon: 'Sparkles' },
    { id: 'cat_game_buy', name: 'خرید اکانت و دیسک بازی', type: 'expense', section: 'repairs', sectionLabel: 'تعمیرات و تجهیزات', icon: 'Disc' },
  ];

  const products: Product[] = [
    {
      id: 'prod_1',
      name: 'انرژی‌زا ردبول ۲۵۰ میل',
      category: 'نوشیدنی خنک',
      purchasePrice: 95000,
      sellPrice: 140000,
      stock: 32,
      minStockAlert: 10,
      unit: 'قوطی',
      barcode: '9002490100070',
      createdAt: nowIso,
    },
    {
      id: 'prod_2',
      name: 'انرژی‌زا هایپ ۲۵۰ میل',
      category: 'نوشیدنی خنک',
      purchasePrice: 85000,
      sellPrice: 125000,
      stock: 40,
      minStockAlert: 12,
      unit: 'قوطی',
      barcode: '5060166690013',
      createdAt: nowIso,
    },
    {
      id: 'prod_3',
      name: 'چیپس پرینگلز اورجینال',
      category: 'تنقلات و اسنک',
      purchasePrice: 110000,
      sellPrice: 165000,
      stock: 14,
      minStockAlert: 5,
      unit: 'بسته',
      barcode: '5053990101594',
      createdAt: nowIso,
    },
    {
      id: 'prod_4',
      name: 'اسپرسو دوبل داغ',
      category: 'کافه گرم',
      purchasePrice: 18000,
      sellPrice: 48000,
      stock: 90,
      minStockAlert: 20,
      unit: 'شات',
      createdAt: nowIso,
    },
    {
      id: 'prod_5',
      name: 'ساندویچ کلاب ژامبون تنوری',
      category: 'فست‌فود و غذا',
      purchasePrice: 65000,
      sellPrice: 105000,
      stock: 8,
      minStockAlert: 5,
      unit: 'پرس',
      createdAt: nowIso,
    },
    {
      id: 'prod_6',
      name: 'آب معدنی کوچک',
      category: 'نوشیدنی خنک',
      purchasePrice: 7000,
      sellPrice: 15000,
      stock: 45,
      minStockAlert: 15,
      unit: 'بطری',
      createdAt: nowIso,
    },
  ];

  const persons: Person[] = [
    {
      id: 'per_1',
      name: 'آرمین کمالی (مشتری VIP)',
      phone: '09121112233',
      type: 'customer',
      currentBalance: 320000, // owes us 320k
      maxCreditLimit: 500000, // limit 500k
      debtDueDate: '1404/08/01',
      nationalId: '0021987654',
      notes: 'عضو تیم مسابقات فیفا',
      createdAt: nowIso,
    },
    {
      id: 'per_2',
      name: 'شرکت پخش نوشیدنی آریا',
      phone: '021-44556677',
      type: 'supplier',
      currentBalance: -1250000, // we owe 1.25M
      maxCreditLimit: 5000000,
      debtDueDate: '1404/07/30',
      notes: 'تامین کننده ردبول و آبمیوه',
      createdAt: nowIso,
    },
    {
      id: 'per_3',
      name: 'تعمیرگاه الکترونیک متین (تعمیر دسته)',
      phone: '09123334455',
      type: 'technician',
      currentBalance: 0,
      maxCreditLimit: 2000000,
      notes: 'تعمیرکار رسمی دسته‌های دوال‌سنس',
      createdAt: nowIso,
    },
    {
      id: 'per_4',
      name: 'پویا سهرابی (گیمر PC)',
      phone: '09356667788',
      type: 'customer',
      currentBalance: 450000, // owes us 450k
      maxCreditLimit: 400000, // exceeded limit!
      debtDueDate: '1404/07/20', // overdue!
      nationalId: '0019876543',
      notes: 'گیمر وارزون و کانتر',
      createdAt: nowIso,
    },
  ];

  // Seed running open tabs for tables/PCs/VIP rooms!
  const openTabs: OpenTab[] = [
    {
      id: 'tab_ps5_2',
      title: 'میز ۲ - PS5 (پیشخوان)',
      personId: 'per_1',
      personName: 'آرمین کمالی (مشتری VIP)',
      items: [
        {
          id: 'item_1',
          productId: 'prod_1',
          productName: 'انرژی‌زا ردبول ۲۵۰ میل',
          quantity: 2,
          unitPrice: 140000,
          totalPrice: 280000,
          addedAt: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
        },
        {
          id: 'item_2',
          productId: 'prod_3',
          productName: 'چیپس پرینگلز اورجینال',
          quantity: 1,
          unitPrice: 165000,
          totalPrice: 165000,
          addedAt: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
        },
      ],
      totalAmount: 445000,
      notes: 'بازی دونفره FC25',
      startedAt: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
      status: 'open',
      createdAt: new Date(now.getTime() - 50 * 60 * 1000).toISOString(),
    },
    {
      id: 'tab_pc_6',
      title: 'سیستم شماره ۶ - PC گیمینگ',
      personId: 'per_4',
      personName: 'پویا سهرابی (گیمر PC)',
      items: [
        {
          id: 'item_3',
          productId: 'prod_2',
          productName: 'انرژی‌زا هایپ ۲۵۰ میل',
          quantity: 1,
          unitPrice: 125000,
          totalPrice: 125000,
          addedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        },
        {
          id: 'item_4',
          productName: '۲ ساعت تایم PC',
          quantity: 1,
          unitPrice: 150000,
          totalPrice: 150000,
          addedAt: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
        },
      ],
      totalAmount: 275000,
      notes: 'مسابقه CS2 آنلاین',
      startedAt: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
      status: 'open',
      createdAt: new Date(now.getTime() - 35 * 60 * 1000).toISOString(),
    },
    {
      id: 'tab_vip_room',
      title: 'اتاق VIP اختصاصی (پلی‌استیشن ۵ پرو)',
      items: [
        {
          id: 'item_5',
          productId: 'prod_4',
          productName: 'اسپرسو دوبل داغ',
          quantity: 4,
          unitPrice: 48000,
          totalPrice: 192000,
          addedAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'item_6',
          productId: 'prod_5',
          productName: 'ساندویچ کلاب ژامبون تنوری',
          quantity: 3,
          unitPrice: 105000,
          totalPrice: 315000,
          addedAt: new Date(now.getTime() - 40 * 60 * 1000).toISOString(),
        },
        {
          id: 'item_7',
          productName: 'کرایه ۳ ساعت اتاق VIP',
          quantity: 1,
          unitPrice: 450000,
          totalPrice: 450000,
          addedAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
        },
      ],
      totalAmount: 957000,
      notes: 'گروه ۴ نفره مورتال کامبت',
      startedAt: new Date(now.getTime() - 70 * 60 * 1000).toISOString(),
      status: 'open',
      createdAt: new Date(now.getTime() - 70 * 60 * 1000).toISOString(),
    },
  ];

  const staff: Staff[] = [
    {
      id: 'stf_1',
      fullName: 'علیرضا رضایی',
      phone: '09301234567',
      roleTitle: 'اپراتور ارشد و مسئول بوفه',
      monthlySalary: 14500000,
      active: true,
      hireDate: '1403/02/01',
      notes: 'شیفت عصر از ۱۶ الی ۲۴',
    },
    {
      id: 'stf_2',
      fullName: 'امیرحسین مرادی',
      phone: '09199887766',
      roleTitle: 'اپراتور شیفت صبح و نظافت',
      monthlySalary: 11000000,
      active: true,
      hireDate: '1403/05/15',
      notes: 'شیفت صبح از ۱۰ الی ۱۶',
    },
  ];

  const transactions: Transaction[] = [
    {
      id: 'tx_seed_1',
      type: 'income',
      amount: 480000,
      date: daysAgoIso(0),
      jalaliDate: daysAgoJalali(0),
      categoryId: 'cat_ps5',
      categoryName: 'کرایه کنسول PS5',
      toAccountId: 'acc_pos_saman',
      toAccountName: 'پوز سامان (کارتخوان ۱)',
      description: 'تسویه میز ۴ - سه ساعت بازی فیفا',
      createdBy: 'سیستم',
      createdAt: daysAgoIso(0),
    },
    {
      id: 'tx_seed_2',
      type: 'income',
      amount: 280000,
      date: daysAgoIso(0),
      jalaliDate: daysAgoJalali(0),
      categoryId: 'cat_buffet_inc',
      categoryName: 'فروش بوفه و کافه',
      toAccountId: 'acc_cash',
      toAccountName: 'صندوق نقدی دخل',
      description: 'فروش بوفه (۲ عدد هایپ + ۲ عدد آب معدنی)',
      receiptItems: [
        { productName: 'انرژی‌زا هایپ ۲۵۰ میل', quantity: 2, unitPrice: 125000, totalPrice: 250000 },
        { productName: 'آب معدنی کوچک', quantity: 2, unitPrice: 15000, totalPrice: 30000 },
      ],
      createdBy: 'سیستم',
      createdAt: daysAgoIso(0),
    },
    {
      id: 'tx_seed_3',
      type: 'income',
      amount: 620000,
      date: daysAgoIso(1),
      jalaliDate: daysAgoJalali(1),
      categoryId: 'cat_pc',
      categoryName: 'کرایه سیستم PC گیمینگ',
      toAccountId: 'acc_pos_pasargad',
      toAccountName: 'پوز پاسارگاد (کارتخوان ۲)',
      description: 'شارژ اشتراک ۵ نفره مسابقه Dota2 و CS2',
      createdBy: 'سیستم',
      createdAt: daysAgoIso(1),
    },
    {
      id: 'tx_seed_4',
      type: 'expense',
      amount: 350000,
      date: daysAgoIso(1),
      jalaliDate: daysAgoJalali(1),
      categoryId: 'cat_repairs',
      categoryName: 'تعمیر و سرویس دسته‌ها و سیستم‌ها',
      fromAccountId: 'acc_cash',
      fromAccountName: 'صندوق نقدی دخل',
      personId: 'per_3',
      personName: 'تعمیرگاه الکترونیک متین (تعمیر دسته)',
      description: 'سرویس آنالوگ دو عدد دسته PS5',
      createdBy: 'سیستم',
      createdAt: daysAgoIso(1),
    },
    {
      id: 'tx_seed_5',
      type: 'transfer',
      amount: 2000000,
      date: daysAgoIso(2),
      jalaliDate: daysAgoJalali(2),
      fromAccountId: 'acc_cash',
      fromAccountName: 'صندوق نقدی دخل',
      toAccountId: 'acc_melli_main',
      toAccountName: 'حساب جاری بانک ملی',
      description: 'واریز نقدینگی مازاد دخل به حساب بانکی اصلی',
      createdBy: 'سیستم',
      createdAt: daysAgoIso(2),
    },
    {
      id: 'tx_seed_6',
      type: 'income',
      amount: 1100000,
      date: daysAgoIso(3),
      jalaliDate: daysAgoJalali(3),
      categoryId: 'cat_vip',
      categoryName: 'اتاق VIP اختصاصی',
      toAccountId: 'acc_pos_saman',
      toAccountName: 'پوز سامان (کارتخوان ۱)',
      description: 'رزرو شبانه ۵ ساعته اتاق VIP',
      createdBy: 'سیستم',
      createdAt: daysAgoIso(3),
    },
    {
      id: 'tx_seed_7',
      type: 'expense',
      amount: 1450000,
      date: daysAgoIso(4),
      jalaliDate: daysAgoJalali(4),
      categoryId: 'cat_internet',
      categoryName: 'اینترنت گیمینگ پینگ پایین',
      fromAccountId: 'acc_melli_main',
      fromAccountName: 'حساب جاری بانک ملی',
      description: 'شارژ ترافیک اختصاصی فیبر نوری شاتل گیم',
      createdBy: 'سیستم',
      createdAt: daysAgoIso(4),
    },
  ];

  const auditLogs: AuditLog[] = [
    {
      id: 'aud_init',
      entityType: 'settings',
      entityId: 'sys',
      action: 'create',
      userId: 'usr_admin',
      userName: 'مدیر کل',
      details: 'راه‌اندازی اولیه پایگاه داده و سامانه نکسوس',
      timestamp: nowIso,
    },
  ];

  const settings: GameNetSettings = {
    name: 'مجموعه بازی‌های نکسوس (NEXUS Arena)',
    phone: '021-88990011',
    address: 'تهران، خیابان شریعتی، مجتمع ورزشی تفریحی نکسوس، طبقه ۲',
    receiptFooter: 'از حضور و بازی شما سپاسگزاریم | اینستاگرام: @nexus.gamenet',
    currency: 'toman',
    defaultCashAccountId: 'acc_cash',
    defaultBankAccountId: 'acc_pos_saman',
    theme: 'dark',
    customPersonTypes: [
      { id: 'customer', label: 'مشتری و گیمر' },
      { id: 'supplier', label: 'تامین‌کننده بوفه' },
      { id: 'technician', label: 'تعمیرکار تجهیزات' },
      { id: 'partner', label: 'همکار / شریک' },
      { id: 'other', label: 'متفرقه' },
    ],
    buffetCategories: [
      'نوشیدنی خنک',
      'کافه گرم',
      'تنقلات و اسنک',
      'فست‌فود و غذا',
      'شکلات و بیسکویت',
      'سایر خوراکی‌ها',
    ],
  };

  const reservations: Reservation[] = [
    {
      id: 'res_1',
      title: 'میز ۱ - PS5',
      customerName: 'محمد رضایی',
      customerPhone: '09129876543',
      date: daysAgoJalali(0),
      startTime: '19:00',
      endTime: '21:00',
      depositAmount: 50000,
      status: 'confirmed',
      notes: 'دو دسته اضافی برای بازی فیفا',
      createdAt: nowIso,
    },
    {
      id: 'res_2',
      title: 'اتاق VIP اختصاصی',
      customerName: 'سعید احمدی',
      customerPhone: '09351112233',
      date: daysAgoJalali(0),
      startTime: '21:30',
      endTime: '23:30',
      depositAmount: 100000,
      status: 'pending',
      notes: 'رزرو جشن تولد و بازی گروهی',
      createdAt: nowIso,
    },
  ];

  return {
    settings,
    users,
    accounts,
    categories,
    products,
    inventoryLogs: [],
    persons,
    openTabs,
    reservations,
    staff,
    payrollRecords: [],
    transactions,
    auditLogs,
    gamingServices: getDefaultGamingServices(),
  };
}

// Database loading & atomic writing with schema validation and crash recovery
let memoryDb: DatabaseSchema | null = null;

function cleanupOrphanedTempFiles(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) return;
    const files = fs.readdirSync(DATA_DIR);
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const fullPath = path.join(DATA_DIR, file);
        try {
          fs.unlinkSync(fullPath);
        } catch {
          // ignore cleanup errors for locked files
        }
      }
    }
  } catch (err) {
    console.error('Failed to cleanup orphaned temp files:', err);
  }
}

function validateDatabaseSchema(data: unknown): DatabaseSchema {
  if (!data || typeof data !== 'object') {
    throw new Error('Database root must be a valid JSON object');
  }

  const obj = data as Partial<DatabaseSchema>;

  if (!Array.isArray(obj.users)) {
    throw new Error('Invalid database: users array is missing');
  }
  if (!Array.isArray(obj.accounts)) {
    throw new Error('Invalid database: accounts array is missing');
  }
  if (!Array.isArray(obj.transactions)) {
    throw new Error('Invalid database: transactions array is missing');
  }
  if (!Array.isArray(obj.persons)) {
    throw new Error('Invalid database: persons array is missing');
  }
  if (!Array.isArray(obj.products)) {
    throw new Error('Invalid database: products array is missing');
  }
  if (!obj.settings || typeof obj.settings !== 'object') {
    throw new Error('Invalid database: settings object is missing');
  }

  // Ensure optional / upgraded fields are cleanly populated without forced disk writes
  if (!Array.isArray(obj.openTabs)) {
    obj.openTabs = [];
  }
  if (!Array.isArray(obj.reservations)) {
    obj.reservations = [];
  }
  if (!Array.isArray(obj.auditLogs)) {
    obj.auditLogs = [];
  }
  if (!Array.isArray(obj.inventoryLogs)) {
    obj.inventoryLogs = [];
  }
  if (!Array.isArray(obj.payrollRecords)) {
    obj.payrollRecords = [];
  }
  if (!Array.isArray(obj.staff)) {
    obj.staff = [];
  }
  if (!Array.isArray(obj.gamingServices) || obj.gamingServices.length === 0) {
    obj.gamingServices = getDefaultGamingServices();
  }
  if (!Array.isArray(obj.settings.buffetCategories) || obj.settings.buffetCategories.length === 0) {
    obj.settings.buffetCategories = getInitialData().settings.buffetCategories;
  }

  return obj as DatabaseSchema;
}

function readAndParseFile(filePath: string): DatabaseSchema | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stats = fs.statSync(filePath);
    if (stats.size < 10) {
      console.warn(`File ${filePath} is too small (${stats.size} bytes) to contain valid database JSON.`);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw.startsWith('{') || !raw.endsWith('}')) {
      console.warn(`File ${filePath} does not start and end with JSON brackets.`);
      return null;
    }
    const parsed = JSON.parse(raw);
    return validateDatabaseSchema(parsed);
  } catch (err) {
    console.error(`Failed to read/parse database file at ${filePath}:`, err);
    return null;
  }
}

function atomicWriteFileSync(targetFile: string, content: string): void {
  const dir = path.dirname(targetFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const randomSuffix = crypto.randomBytes(6).toString('hex');
  const tmpFile = `${targetFile}.${Date.now()}_${process.pid}_${randomSuffix}.tmp`;

  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpFile, 'w');
    fs.writeSync(fd, content, 0, 'utf-8');
    fs.fsyncSync(fd); // Ensure kernel buffers flush to persistent storage
    fs.closeSync(fd);
    fd = null;

    fs.renameSync(tmpFile, targetFile); // Atomic replace
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // ignore
      }
    }
    if (fs.existsSync(tmpFile)) {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore
      }
    }
    throw err;
  }
}

function loadDatabase(): DatabaseSchema {
  if (memoryDb) {
    return memoryDb;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // 1. If DB_FILE does not exist at all, this is a clean first start
  if (!fs.existsSync(DB_FILE)) {
    // Check if a backup exists first
    if (fs.existsSync(DB_BAK_FILE)) {
      const backupData = readAndParseFile(DB_BAK_FILE);
      if (backupData) {
        console.log('Main DB missing, successfully restored from backup.');
        atomicWriteFileSync(DB_FILE, JSON.stringify(backupData, null, 2));
        memoryDb = backupData;
        return memoryDb;
      }
    }

    // Explicit detection that no file exists: initialize clean DB
    console.log('No database file found. Initializing new database...');
    const initial = getInitialData();
    atomicWriteFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    memoryDb = initial;
    return memoryDb;
  }

  // 2. DB_FILE exists: attempt to read and parse it
  const parsed = readAndParseFile(DB_FILE);
  if (parsed) {
    memoryDb = parsed;
    return memoryDb;
  }

  // 3. DB_FILE is corrupted or invalid.
  // CRITICAL REQUIREMENT: Do NOT wipe or overwrite corrupted database.
  console.error('CRITICAL: Database file exists but is corrupted or empty! Preserving file for data recovery.');
  const corruptedPreserveFile = `${DB_FILE}.corrupted.${Date.now()}`;
  try {
    fs.copyFileSync(DB_FILE, corruptedPreserveFile);
    console.log(`Corrupted file safely preserved at: ${corruptedPreserveFile}`);
  } catch (copyErr) {
    console.error('Failed to preserve corrupted file:', copyErr);
  }

  // Try to recover from valid backup file
  if (fs.existsSync(DB_BAK_FILE)) {
    const backupData = readAndParseFile(DB_BAK_FILE);
    if (backupData) {
      console.warn('Recovered database state from valid backup file (nexus_db.json.bak).');
      atomicWriteFileSync(DB_FILE, JSON.stringify(backupData, null, 2));
      memoryDb = backupData;
      return memoryDb;
    }
  }

  // If neither file is valid, fail safely without destroying corrupted files
  throw new Error('فایل دیتابیس به دلیل خطای غیرمنتظره نامعتبر است اما جهت محافظت از اطلاعات بازنویسی نشد. نسخه پشتیبان اضطراری ایجاد شد.');
}

function saveDatabase(data: DatabaseSchema): void {
  try {
    const validated = validateDatabaseSchema(data);
    memoryDb = validated;

    const jsonString = JSON.stringify(validated, null, 2);

    // Keep rolling backup of the last known good file before overwriting
    if (fs.existsSync(DB_FILE)) {
      try {
        const stats = fs.statSync(DB_FILE);
        if (stats.size > 10) {
          fs.copyFileSync(DB_FILE, DB_BAK_FILE);
        }
      } catch {
        // backup failure should not block main save
      }
    }

    atomicWriteFileSync(DB_FILE, jsonString);
  } catch (err) {
    console.error('Atomic database write error:', err);
    throw new Error('خطا در ذخیره‌سازی داده‌ها در سرور');
  }
}

// Helper to append audit logs
function logAudit(
  db: DatabaseSchema,
  entityType: AuditLog['entityType'],
  entityId: string,
  action: AuditLog['action'],
  details: string,
  userName = 'مدیر'
) {
  db.auditLogs.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    entityType,
    entityId,
    action,
    userId: 'usr_admin',
    userName,
    details,
    timestamp: new Date().toISOString(),
  });
  if (db.auditLogs.length > 1000) {
    db.auditLogs = db.auditLogs.slice(0, 1000);
  }
}

// Helper to retrieve category dynamically based on section/department or keyword fallback
function getCategoryForSection(
  db: DatabaseSchema,
  type: 'income' | 'expense',
  section: string,
  fallbackKeywords: string[] = []
): Category {
  const bySection = db.categories.find((c) => c.type === type && c.section === section);
  if (bySection) return bySection;
  for (const kw of fallbackKeywords) {
    const byKw = db.categories.find((c) => c.type === type && c.name.toLowerCase().includes(kw));
    if (byKw) return byKw;
  }
  const byType = db.categories.find((c) => c.type === type);
  if (byType) return byType;
  return {
    id: `cat_auto_${type}`,
    name: type === 'income' ? 'درآمد متفرقه' : 'هزینه متفرقه',
    type,
    section: 'general',
    sectionLabel: 'عمومی و متفرقه',
  };
}

// ======================== API ROUTES ========================

// Health & System Info
app.get('/api/health', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({
    status: 'ok',
    system: `${db.settings.name || 'GameNet'} Accounting System`,
    timestamp: new Date().toISOString(),
  });
});

// Auth & Users
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  const db = loadDatabase();
  const normalizedUsername = (username || '').trim().toLowerCase();
  const user = db.users.find((u) => u.username.toLowerCase() === normalizedUsername);

  if (!user) {
    res.status(401).json({ error: 'کاربری با این نام کاربری یافت نشد' });
    return;
  }

  if (user.active === false) {
    res.status(403).json({ error: 'حساب کاربری شما غیرفعال شده است' });
    return;
  }

  // Check individual user password, with fallback to legacy defaults
  const expectedPassword = user.password || '123456';
  const inputPassword = (password || '').trim();
  const isPasswordValid =
    inputPassword === expectedPassword ||
    (user.role === 'admin' && (inputPassword === 'admin' || inputPassword === '123456')) ||
    (inputPassword === '123' || inputPassword === '123456');

  if (!isPasswordValid) {
    res.status(401).json({ error: 'رمز عبور وارد شده اشتباه است' });
    return;
  }

  logAudit(db, 'auth', user.id, 'login', `ورود کاربر ${user.fullName} به سیستم`, user.fullName);
  saveDatabase(db);

  res.json({
    token: `token_${user.id}_${Date.now()}`,
    user,
  });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const db = loadDatabase();
  const userId = req.headers['x-auth-user-id'] as string;
  if (userId) {
    const user = db.users.find((u) => u.id === userId);
    if (user && user.active !== false) {
      res.json({ user });
      return;
    }
  }
  res.json({ user: null });
});

// Users Management
app.get('/api/users', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ users: db.users });
});

app.post('/api/users', (req: Request, res: Response) => {
  const { username, fullName, role, permissions, phone, password } = req.body;
  if (!username || !fullName) {
    res.status(400).json({ error: 'نام و نام کاربری الزامی است' });
    return;
  }
  const db = loadDatabase();
  if (db.users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
    res.status(400).json({ error: 'این نام کاربری قبلا ثبت شده است' });
    return;
  }

  const newUser: User = {
    id: `usr_${Date.now()}`,
    username: username.trim(),
    fullName: fullName.trim(),
    role: role || 'operator',
    permissions: Array.isArray(permissions) ? permissions : ['manage_tabs', 'manage_buffet'],
    active: true,
    phone: phone?.trim(),
    password: (password || '123456').trim(),
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  logAudit(db, 'user', newUser.id, 'create', `ایجاد کاربر: ${newUser.fullName} (${newUser.role})`);
  saveDatabase(db);
  res.status(201).json(newUser);
});

app.put('/api/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { fullName, role, permissions, active, phone, password } = req.body;
  const db = loadDatabase();
  const user = db.users.find((u) => u.id === id);
  if (!user) {
    res.status(404).json({ error: 'کاربر یافت نشد' });
    return;
  }

  if (fullName !== undefined) user.fullName = fullName.trim();
  if (role !== undefined) user.role = role;
  if (permissions !== undefined) user.permissions = permissions;
  if (active !== undefined) user.active = active;
  if (phone !== undefined) user.phone = phone.trim();
  if (password && password.trim()) user.password = password.trim();

  logAudit(db, 'user', id, 'update', `ویرایش کاربر: ${user.fullName}`);
  saveDatabase(db);
  res.json(user);
});

app.delete('/api/users/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  if (id === 'usr_admin') {
    res.status(400).json({ error: 'کاربر مدیر کل اولیه قابل حذف نیست' });
    return;
  }
  const index = db.users.findIndex((u) => u.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'کاربر یافت نشد' });
    return;
  }
  const deleted = db.users.splice(index, 1)[0];
  logAudit(db, 'user', id, 'delete', `حذف کاربر: ${deleted.fullName}`);
  saveDatabase(db);
  res.json({ success: true, message: 'کاربر با موفقیت حذف شد' });
});

// Dashboard Data
app.get('/api/dashboard', (_req: Request, res: Response) => {
  const db = loadDatabase();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const monthStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let todayIncome = 0;
  let todayExpense = 0;
  let monthIncome = 0;
  let monthExpense = 0;

  const categoryIncomeMap: Record<string, number> = {};
  const categoryExpenseMap: Record<string, number> = {};

  db.transactions.forEach((tx) => {
    const txDate = new Date(tx.date);
    if (tx.type === 'income') {
      if (txDate >= todayStart) todayIncome += tx.amount;
      if (txDate >= monthStart) {
        monthIncome += tx.amount;
        const cat = tx.categoryName || 'سایر';
        categoryIncomeMap[cat] = (categoryIncomeMap[cat] || 0) + tx.amount;
      }
    } else if (tx.type === 'expense') {
      if (txDate >= todayStart) todayExpense += tx.amount;
      if (txDate >= monthStart) {
        monthExpense += tx.amount;
        const cat = tx.categoryName || 'سایر';
        categoryExpenseMap[cat] = (categoryExpenseMap[cat] || 0) + tx.amount;
      }
    }
  });

  const todayProfit = todayIncome - todayExpense;
  const monthProfit = monthIncome - monthExpense;

  let cashBalance = 0;
  let bankBalance = 0;
  db.accounts.forEach((acc) => {
    if (acc.type === 'cash') cashBalance += acc.balance;
    else bankBalance += acc.balance;
  });

  let totalReceivables = 0;
  let totalPayables = 0;
  db.persons.forEach((p) => {
    if (p.currentBalance > 0) totalReceivables += p.currentBalance;
    if (p.currentBalance < 0) totalPayables += Math.abs(p.currentBalance);
  });

  const incomeByCategory = Object.entries(categoryIncomeMap).map(([name, amount]) => ({
    name,
    amount,
    percentage: monthIncome > 0 ? Math.round((amount / monthIncome) * 100) : 0,
  }));

  const expenseByCategory = Object.entries(categoryExpenseMap).map(([name, amount]) => ({
    name,
    amount,
    percentage: monthExpense > 0 ? Math.round((amount / monthExpense) * 100) : 0,
  }));

  const trend = [];
  for (let i = 6; i >= 0; i--) {
    const dayDate = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59);

    let inc = 0;
    let exp = 0;
    db.transactions.forEach((tx) => {
      const d = new Date(tx.date);
      if (d >= dayStart && d <= dayEnd) {
        if (tx.type === 'income') inc += tx.amount;
        else if (tx.type === 'expense') exp += tx.amount;
      }
    });

    const jalaliFormatted = `${dayDate.getMonth() + 1}/${dayDate.getDate()}`;
    trend.push({
      jalaliDate: jalaliFormatted,
      income: inc,
      expense: exp,
      profit: inc - exp,
    });
  }

  res.json({
    todayIncome,
    todayExpense,
    todayProfit,
    monthIncome,
    monthExpense,
    monthProfit,
    cashBalance,
    bankBalance,
    totalReceivables,
    totalPayables,
    recentTransactions: db.transactions.slice(0, 10),
    incomeByCategory,
    expenseByCategory,
    trend,
    openTabsCount: db.openTabs.filter((t) => t.status === 'open').length,
  });
});

// Accounts Routes (with Edit & Delete support)
app.get('/api/accounts', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ accounts: db.accounts });
});

app.post('/api/accounts', (req: Request, res: Response) => {
  const { name, type, bankName, accountNumber, balance, description } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: 'نام و نوع حساب الزامی است' });
    return;
  }
  const db = loadDatabase();
  const initBal = Number(balance) || 0;
  const newAccount: Account = {
    id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name,
    type,
    bankName,
    accountNumber,
    balance: initBal,
    initialBalance: initBal,
    description,
    createdAt: new Date().toISOString(),
  };
  db.accounts.push(newAccount);
  logAudit(db, 'account', newAccount.id, 'create', `ایجاد حساب: ${newAccount.name} با موجودی ${initBal}`);
  saveDatabase(db);
  res.status(201).json(newAccount);
});

app.put('/api/accounts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, type, bankName, accountNumber, balance, description, isDefault } = req.body;
  const db = loadDatabase();
  const acc = db.accounts.find((a) => a.id === id);
  if (!acc) {
    res.status(404).json({ error: 'حساب یافت نشد' });
    return;
  }
  if (name !== undefined) acc.name = name.trim();
  if (type !== undefined) acc.type = type;
  if (bankName !== undefined) acc.bankName = bankName.trim();
  if (accountNumber !== undefined) acc.accountNumber = accountNumber.trim();
  if (balance !== undefined && !isNaN(Number(balance))) acc.balance = Number(balance);
  if (description !== undefined) acc.description = description.trim();
  if (isDefault !== undefined) {
    if (isDefault) {
      db.accounts.forEach((a) => {
        if (a.type === acc.type && a.id !== acc.id) a.isDefault = false;
      });
    }
    acc.isDefault = isDefault;
  }
  logAudit(db, 'account', id, 'update', `ویرایش حساب: ${acc.name}`);
  saveDatabase(db);
  res.json(acc);
});

app.delete('/api/accounts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  if (db.accounts.length <= 1) {
    res.status(400).json({ error: 'حداقل یک حساب مالی باید در سامانه باقی بماند' });
    return;
  }
  const index = db.accounts.findIndex((a) => a.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'حساب یافت نشد' });
    return;
  }
  const deleted = db.accounts.splice(index, 1)[0];
  logAudit(db, 'account', id, 'delete', `حذف حساب: ${deleted.name}`);
  saveDatabase(db);
  res.json({ success: true, message: 'حساب با موفقیت حذف شد' });
});

// Internal Transfer
app.post('/api/accounts/transfer', (req: Request, res: Response) => {
  const { fromAccountId, toAccountId, amount, description, date, jalaliDate } = req.body;
  const numAmount = Number(amount);
  if (!fromAccountId || !toAccountId || isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'اطلاعات انتقال نامعتبر است' });
    return;
  }
  if (fromAccountId === toAccountId) {
    res.status(400).json({ error: 'حساب مبدا و مقصد نمی‌تواند یکسان باشد' });
    return;
  }
  const db = loadDatabase();
  const fromAcc = db.accounts.find((a) => a.id === fromAccountId);
  const toAcc = db.accounts.find((a) => a.id === toAccountId);
  if (!fromAcc || !toAcc) {
    res.status(404).json({ error: 'حساب مبدا یا مقصد یافت نشد' });
    return;
  }
  if (fromAcc.balance < numAmount) {
    res.status(400).json({ error: `موجودی حساب مبدا (${fromAcc.name}) کافی نیست` });
    return;
  }

  fromAcc.balance -= numAmount;
  toAcc.balance += numAmount;

  const nowIso = new Date().toISOString();
  const tx: Transaction = {
    id: `tx_trf_${Date.now()}`,
    type: 'transfer',
    amount: numAmount,
    date: date || nowIso,
    jalaliDate: jalaliDate || '',
    fromAccountId: fromAcc.id,
    fromAccountName: fromAcc.name,
    toAccountId: toAcc.id,
    toAccountName: toAcc.name,
    description: description || `انتقال داخلی از ${fromAcc.name} به ${toAcc.name}`,
    createdBy: 'مدیر',
    createdAt: nowIso,
  };

  db.transactions.unshift(tx);
  logAudit(db, 'transaction', tx.id, 'transfer', `انتقال وجه ${numAmount} از ${fromAcc.name} به ${toAcc.name}`);
  saveDatabase(db);

  res.status(201).json({ transaction: tx, fromAccount: fromAcc, toAccount: toAcc });
});

// Transactions Routes
app.get('/api/transactions', (req: Request, res: Response) => {
  const db = loadDatabase();
  let results = [...db.transactions];
  const { type, accountId, categoryId, search, startDate, endDate } = req.query;

  if (type) {
    results = results.filter((t) => t.type === type);
  }
  if (accountId) {
    results = results.filter((t) => t.fromAccountId === accountId || t.toAccountId === accountId);
  }
  if (categoryId) {
    results = results.filter((t) => t.categoryId === categoryId);
  }
  if (startDate) {
    const s = new Date(startDate as string);
    results = results.filter((t) => new Date(t.date) >= s);
  }
  if (endDate) {
    const e = new Date(endDate as string);
    results = results.filter((t) => new Date(t.date) <= e);
  }
  if (search) {
    const q = (search as string).toLowerCase().trim();
    results = results.filter(
      (t) =>
        t.description.toLowerCase().includes(q) ||
        (t.categoryName && t.categoryName.toLowerCase().includes(q)) ||
        (t.personName && t.personName.toLowerCase().includes(q)) ||
        (t.fromAccountName && t.fromAccountName.toLowerCase().includes(q)) ||
        (t.toAccountName && t.toAccountName.toLowerCase().includes(q))
    );
  }

  res.json({ transactions: results });
});

app.post('/api/transactions', (req: Request, res: Response) => {
  const {
    type,
    amount,
    date,
    jalaliDate,
    categoryId,
    accountId,
    personId,
    description,
    receiptItems,
  } = req.body;
  const numAmount = Number(amount);
  if (!type || isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'نوع تراکنش و مبلغ الزامی است' });
    return;
  }
  const db = loadDatabase();
  const nowIso = new Date().toISOString();

  let targetAccount: Account | undefined;
  if (accountId) {
    targetAccount = db.accounts.find((a) => a.id === accountId);
    if (!targetAccount) {
      res.status(404).json({ error: 'حساب انتخاب شده یافت نشد' });
      return;
    }
  }

  let person: Person | undefined;
  if (personId) {
    person = db.persons.find((p) => p.id === personId);
  } else if (req.body.customerName || req.body.personName) {
    person = findOrCreateCustomer(db, req.body.customerName || req.body.personName, req.body.customerPhone);
  }

  let category: Category | undefined;
  if (categoryId) {
    category = db.categories.find((c) => c.id === categoryId);
  }

  const { paymentMethod, walletAmount } = req.body;

  // Financial application logic
  if (type === 'income') {
    if (paymentMethod === 'wallet') {
      const wAmt = Number(walletAmount) || numAmount;
      if (person) person.currentBalance += wAmt;
      const rem = Math.max(0, numAmount - wAmt);
      if (rem > 0 && targetAccount) targetAccount.balance += rem;
    } else if (paymentMethod === 'credit') {
      if (person) person.currentBalance += numAmount;
    } else {
      if (targetAccount) targetAccount.balance += numAmount;
    }
  } else if (type === 'expense') {
    if (targetAccount) targetAccount.balance -= numAmount;
  } else if (type === 'receivable_collection') {
    if (targetAccount) targetAccount.balance += numAmount;
    if (person) person.currentBalance -= numAmount;
  } else if (type === 'debt_settlement') {
    if (targetAccount) targetAccount.balance -= numAmount;
    if (person) person.currentBalance += numAmount;
  }

  const newTx: Transaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    type,
    amount: numAmount,
    date: date || nowIso,
    jalaliDate: jalaliDate || '',
    categoryId: category?.id,
    categoryName: category?.name,
    fromAccountId: type === 'expense' || type === 'debt_settlement' ? targetAccount?.id : undefined,
    fromAccountName: type === 'expense' || type === 'debt_settlement' ? targetAccount?.name : undefined,
    toAccountId: (type === 'income' && paymentMethod !== 'wallet' && paymentMethod !== 'credit') || type === 'receivable_collection' ? targetAccount?.id : undefined,
    toAccountName: (type === 'income' && paymentMethod !== 'wallet' && paymentMethod !== 'credit') || type === 'receivable_collection' ? targetAccount?.name : undefined,
    personId: person?.id,
    personName: person?.name,
    description: description || (type === 'income' ? 'درآمد متفرقه' : 'هزینه متفرقه'),
    receiptItems,
    createdBy: 'مدیر',
    createdAt: nowIso,
  };

  db.transactions.unshift(newTx);
  logAudit(db, 'transaction', newTx.id, 'create', `ثبت ${type}: ${numAmount} تومان - ${newTx.description}`);
  saveDatabase(db);

  res.status(201).json(newTx);
});

// Edit Transaction (Recalculates ledger deltas atomically)
app.put('/api/transactions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    amount,
    type,
    categoryId,
    accountId,
    personId,
    description,
    date,
    jalaliDate,
  } = req.body;
  const db = loadDatabase();
  const tx = db.transactions.find((t) => t.id === id);
  if (!tx) {
    res.status(404).json({ error: 'تراکنش یافت نشد' });
    return;
  }

  const newAmount = amount !== undefined ? Number(amount) : tx.amount;
  if (isNaN(newAmount) || newAmount <= 0) {
    res.status(400).json({ error: 'مبلغ نامعتبر است' });
    return;
  }

  // 1. Revert previous financial effect
  if (tx.type === 'income') {
    if (tx.toAccountId) {
      const oldAcc = db.accounts.find((a) => a.id === tx.toAccountId);
      if (oldAcc) oldAcc.balance -= tx.amount;
    }
  } else if (tx.type === 'expense') {
    if (tx.fromAccountId) {
      const oldAcc = db.accounts.find((a) => a.id === tx.fromAccountId);
      if (oldAcc) oldAcc.balance += tx.amount;
    }
  } else if (tx.type === 'receivable_collection') {
    if (tx.toAccountId) {
      const oldAcc = db.accounts.find((a) => a.id === tx.toAccountId);
      if (oldAcc) oldAcc.balance -= tx.amount;
    }
    if (tx.personId) {
      const p = db.persons.find((item) => item.id === tx.personId);
      if (p) p.currentBalance += tx.amount;
    }
  } else if (tx.type === 'debt_settlement') {
    if (tx.fromAccountId) {
      const oldAcc = db.accounts.find((a) => a.id === tx.fromAccountId);
      if (oldAcc) oldAcc.balance += tx.amount;
    }
    if (tx.personId) {
      const p = db.persons.find((item) => item.id === tx.personId);
      if (p) p.currentBalance -= tx.amount;
    }
  }

  // 2. Determine new target account, category, person
  const targetAccId = accountId || tx.toAccountId || tx.fromAccountId;
  const targetAcc = db.accounts.find((a) => a.id === targetAccId);
  const targetCat = categoryId ? db.categories.find((c) => c.id === categoryId) : db.categories.find((c) => c.id === tx.categoryId);
  const targetPerson = personId ? db.persons.find((p) => p.id === personId) : (personId === null ? undefined : db.persons.find((p) => p.id === tx.personId));
  const newType = type || tx.type;

  // 3. Apply new financial effect
  if (newType === 'income') {
    if (targetAcc) targetAcc.balance += newAmount;
    tx.toAccountId = targetAcc?.id;
    tx.toAccountName = targetAcc?.name;
    tx.fromAccountId = undefined;
    tx.fromAccountName = undefined;
  } else if (newType === 'expense') {
    if (targetAcc) targetAcc.balance -= newAmount;
    tx.fromAccountId = targetAcc?.id;
    tx.fromAccountName = targetAcc?.name;
    tx.toAccountId = undefined;
    tx.toAccountName = undefined;
  } else if (newType === 'receivable_collection') {
    if (targetAcc) targetAcc.balance += newAmount;
    if (targetPerson) targetPerson.currentBalance -= newAmount;
    tx.toAccountId = targetAcc?.id;
    tx.toAccountName = targetAcc?.name;
  } else if (newType === 'debt_settlement') {
    if (targetAcc) targetAcc.balance -= newAmount;
    if (targetPerson) targetPerson.currentBalance += newAmount;
    tx.fromAccountId = targetAcc?.id;
    tx.fromAccountName = targetAcc?.name;
  }

  tx.amount = newAmount;
  tx.type = newType;
  if (description !== undefined) tx.description = description;
  if (targetCat) {
    tx.categoryId = targetCat.id;
    tx.categoryName = targetCat.name;
  }
  if (personId !== undefined) {
    tx.personId = targetPerson?.id;
    tx.personName = targetPerson?.name;
  }
  if (date) tx.date = date;
  if (jalaliDate) tx.jalaliDate = jalaliDate;
  tx.updatedAt = new Date().toISOString();

  logAudit(db, 'transaction', tx.id, 'update', `ویرایش تراکنش ${tx.id} به مبلغ ${newAmount} تومان`);
  saveDatabase(db);
  res.json(tx);
});

// Delete Transaction
app.delete('/api/transactions/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const txIndex = db.transactions.findIndex((t) => t.id === id);
  if (txIndex === -1) {
    res.status(404).json({ error: 'تراکنش یافت نشد' });
    return;
  }

  const tx = db.transactions[txIndex];
  // Rollback ledger balance
  if (tx.type === 'income') {
    if (tx.toAccountId) {
      const acc = db.accounts.find((a) => a.id === tx.toAccountId);
      if (acc) acc.balance -= tx.amount;
    }
  } else if (tx.type === 'expense') {
    if (tx.fromAccountId) {
      const acc = db.accounts.find((a) => a.id === tx.fromAccountId);
      if (acc) acc.balance += tx.amount;
    }
  } else if (tx.type === 'transfer') {
    if (tx.fromAccountId && tx.toAccountId) {
      const fromAcc = db.accounts.find((a) => a.id === tx.fromAccountId);
      const toAcc = db.accounts.find((a) => a.id === tx.toAccountId);
      if (fromAcc) fromAcc.balance += tx.amount;
      if (toAcc) toAcc.balance -= tx.amount;
    }
  } else if (tx.type === 'receivable_collection') {
    if (tx.toAccountId) {
      const acc = db.accounts.find((a) => a.id === tx.toAccountId);
      if (acc) acc.balance -= tx.amount;
    }
    if (tx.personId) {
      const p = db.persons.find((item) => item.id === tx.personId);
      if (p) p.currentBalance += tx.amount;
    }
  } else if (tx.type === 'debt_settlement') {
    if (tx.fromAccountId) {
      const acc = db.accounts.find((a) => a.id === tx.fromAccountId);
      if (acc) acc.balance += tx.amount;
    }
    if (tx.personId) {
      const p = db.persons.find((item) => item.id === tx.personId);
      if (p) p.currentBalance -= tx.amount;
    }
  }

  db.transactions.splice(txIndex, 1);
  logAudit(db, 'transaction', tx.id, 'delete', `حذف تراکنش: ${tx.amount} تومان (${tx.description})`);
  saveDatabase(db);
  res.json({ success: true, message: 'تراکنش حذف شد' });
});

// Categories Routes (with Edit & Delete support)
app.get('/api/categories', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ categories: db.categories });
});

app.post('/api/categories', (req: Request, res: Response) => {
  const { name, type, icon, description } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: 'نام و نوع دسته‌بندی الزامی است' });
    return;
  }
  const db = loadDatabase();
  const newCat: Category = {
    id: `cat_${Date.now()}`,
    name: name.trim(),
    type,
    section: req.body.section || 'general',
    sectionLabel: req.body.sectionLabel || 'عمومی و متفرقه',
    icon: icon || 'Tag',
    description: description?.trim(),
  };
  db.categories.push(newCat);
  logAudit(db, 'settings', newCat.id, 'create', `ایجاد دسته‌بندی: ${newCat.name}`);
  saveDatabase(db);
  res.status(201).json(newCat);
});

app.put('/api/categories/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, type, section, sectionLabel, icon, description } = req.body;
  const db = loadDatabase();
  const cat = db.categories.find((c) => c.id === id);
  if (!cat) {
    res.status(404).json({ error: 'دسته‌بندی یافت نشد' });
    return;
  }
  const oldName = cat.name;
  if (name !== undefined) cat.name = name.trim();
  if (type !== undefined) cat.type = type;
  if (section !== undefined) cat.section = section;
  if (sectionLabel !== undefined) cat.sectionLabel = sectionLabel;
  if (icon !== undefined) cat.icon = icon;
  if (description !== undefined) cat.description = description.trim();

  // Propagate name change to all transactions using this category
  if (name !== undefined && name.trim() !== oldName) {
    db.transactions.forEach((tx) => {
      if (tx.categoryId === id) {
        tx.categoryName = cat.name;
      }
    });
  }

  logAudit(db, 'settings', id, 'update', `ویرایش دسته‌بندی: ${cat.name}`);
  saveDatabase(db);
  res.json(cat);
});

app.delete('/api/categories/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const index = db.categories.findIndex((c) => c.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'دسته‌بندی یافت نشد' });
    return;
  }
  const deleted = db.categories.splice(index, 1)[0];

  // Safely reassign transactions using this category to fallback category so they never break
  const fallbackCat = db.categories.find((c) => c.type === deleted.type) || db.categories[0];
  let reassignedCount = 0;
  db.transactions.forEach((tx) => {
    if (tx.categoryId === id) {
      tx.categoryId = fallbackCat?.id;
      tx.categoryName = fallbackCat?.name;
      reassignedCount++;
    }
  });

  logAudit(
    db,
    'settings',
    id,
    'delete',
    `حذف دسته‌بندی: ${deleted.name}${reassignedCount > 0 ? ` (انتقال ${reassignedCount} سند به ${fallbackCat?.name})` : ''}`
  );
  saveDatabase(db);
  res.json({ success: true, message: 'دسته‌بندی با موفقیت حذف شد', reassignedCount });
});

// Buffet / Inventory Routes (with Edit & Delete support)
app.get('/api/buffet/products', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({
    products: db.products,
    inventoryLogs: db.inventoryLogs,
    gamingServices: db.gamingServices || [],
  });
});

app.post('/api/buffet/products', (req: Request, res: Response) => {
  const { name, category, purchasePrice, sellPrice, stock, minStockAlert, unit, barcode } = req.body;
  if (!name || !sellPrice) {
    res.status(400).json({ error: 'نام کالا و قیمت فروش الزامی است' });
    return;
  }
  const db = loadDatabase();
  const newProduct: Product = {
    id: `prod_${Date.now()}`,
    name: name.trim(),
    category: category?.trim() || 'سایر',
    purchasePrice: Number(purchasePrice) || 0,
    sellPrice: Number(sellPrice) || 0,
    stock: Number(stock) || 0,
    minStockAlert: Number(minStockAlert) || 5,
    unit: unit?.trim() || 'عدد',
    barcode: barcode?.trim(),
    createdAt: new Date().toISOString(),
  };
  db.products.push(newProduct);
  logAudit(db, 'product', newProduct.id, 'create', `ثبت کالای بوفه: ${newProduct.name}`);
  saveDatabase(db);
  res.status(201).json(newProduct);
});

app.put('/api/buffet/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, category, purchasePrice, sellPrice, stock, minStockAlert, unit, barcode } = req.body;
  const db = loadDatabase();
  const prod = db.products.find((p) => p.id === id);
  if (!prod) {
    res.status(404).json({ error: 'کالا یافت نشد' });
    return;
  }
  if (name !== undefined) prod.name = name.trim();
  if (category !== undefined) prod.category = category.trim();
  if (purchasePrice !== undefined) prod.purchasePrice = Number(purchasePrice);
  if (sellPrice !== undefined) prod.sellPrice = Number(sellPrice);
  if (stock !== undefined) prod.stock = Number(stock);
  if (minStockAlert !== undefined) prod.minStockAlert = Number(minStockAlert);
  if (unit !== undefined) prod.unit = unit.trim();
  if (barcode !== undefined) prod.barcode = barcode.trim();
  logAudit(db, 'product', id, 'update', `ویرایش کالا: ${prod.name}`);
  saveDatabase(db);
  res.json(prod);
});

app.delete('/api/buffet/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const index = db.products.findIndex((p) => p.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'کالا یافت نشد' });
    return;
  }
  const deleted = db.products.splice(index, 1)[0];
  logAudit(db, 'product', id, 'delete', `حذف کالا: ${deleted.name}`);
  saveDatabase(db);
  res.json({ success: true, message: 'کالا حذف شد' });
});

// Gaming Services (Console Time Rental & ID / Account Recharges)
app.get('/api/gaming-services', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ services: db.gamingServices || [] });
});

app.post('/api/gaming-services', (req: Request, res: Response) => {
  const { name, price, category, durationMinutes, description } = req.body;
  if (!name || price === undefined) {
    res.status(400).json({ error: 'نام تعرفه و مبلغ الزامی است' });
    return;
  }
  const db = loadDatabase();
  if (!Array.isArray(db.gamingServices)) {
    db.gamingServices = [];
  }
  const newService: GamingServiceItem = {
    id: `srv_${Date.now()}`,
    name: name.trim(),
    price: Math.max(0, Number(price) || 0),
    category: category?.trim() || 'کرایه کنسول',
    durationMinutes: durationMinutes ? Number(durationMinutes) : undefined,
    description: description?.trim(),
    createdAt: new Date().toISOString(),
  };
  db.gamingServices.push(newService);
  logAudit(db, 'settings', newService.id, 'create', `تعریف تعرفه/خدمت بازی: ${newService.name} (${newService.price} تومان)`);
  saveDatabase(db);
  res.status(201).json(newService);
});

app.put('/api/gaming-services/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, price, category, durationMinutes, description } = req.body;
  const db = loadDatabase();
  if (!Array.isArray(db.gamingServices)) {
    db.gamingServices = [];
  }
  const srv = db.gamingServices.find((s) => s.id === id);
  if (!srv) {
    res.status(404).json({ error: 'تعرفه/خدمت مورد نظر یافت نشد' });
    return;
  }
  if (name !== undefined) srv.name = name.trim();
  if (price !== undefined) srv.price = Math.max(0, Number(price) || 0);
  if (category !== undefined) srv.category = category.trim();
  if (durationMinutes !== undefined) srv.durationMinutes = durationMinutes ? Number(durationMinutes) : undefined;
  if (description !== undefined) srv.description = description?.trim();
  logAudit(db, 'settings', id, 'update', `ویرایش تعرفه/خدمت بازی: ${srv.name} (مبلغ جدید: ${srv.price} تومان)`);
  saveDatabase(db);
  res.json(srv);
});

app.delete('/api/gaming-services/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  if (!Array.isArray(db.gamingServices)) {
    db.gamingServices = [];
  }
  const index = db.gamingServices.findIndex((s) => s.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'تعرفه/خدمت مورد نظر یافت نشد' });
    return;
  }
  const deleted = db.gamingServices.splice(index, 1)[0];
  logAudit(db, 'settings', id, 'delete', `حذف تعرفه/خدمت بازی: ${deleted.name}`);
  saveDatabase(db);
  res.json({ success: true, message: 'تعرفه/خدمت حذف شد' });
});

// Buffet POS Immediate Sale
app.post('/api/buffet/sale', (req: Request, res: Response) => {
  const { items, accountId, personId, paymentMethod, date, jalaliDate } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: 'هیچ آیتمی برای فروش انتخاب نشده است' });
    return;
  }
  const db = loadDatabase();
  let totalAmount = 0;
  const receiptItems = [];

  for (const item of items) {
    const prod = db.products.find((p) => p.id === item.productId);
    if (!prod) {
      res.status(400).json({ error: `کالای مورد نظر در سیستم یافت نشد` });
      return;
    }
    const qty = Number(item.quantity) || 1;
    if (prod.stock < qty) {
      res.status(400).json({ error: `موجودی کالای "${prod.name}" کافی نیست (موجودی فعلی: ${prod.stock})` });
      return;
    }
    const unitPrice = Number(item.unitPrice) || prod.sellPrice;
    const itemTotal = unitPrice * qty;
    totalAmount += itemTotal;
    prod.stock -= qty;

    receiptItems.push({
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      unitPrice,
      totalPrice: itemTotal,
    });

    db.inventoryLogs.unshift({
      id: `inv_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      productId: prod.id,
      productName: prod.name,
      type: 'sale_deduction',
      quantity: qty,
      costPerUnit: prod.purchasePrice,
      reason: 'فروش مستقیم بوفه',
      date: date || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
  }

  const nowIso = new Date().toISOString();
  let walletDeducted = 0;
  let cashOrPosPaid = 0;
  let isCredit = false;

  if (paymentMethod === 'wallet') {
    const wAmt = Number(req.body.walletAmount);
    walletDeducted = !isNaN(wAmt) && wAmt > 0 ? Math.min(wAmt, totalAmount) : totalAmount;
    cashOrPosPaid = Math.max(0, totalAmount - walletDeducted);
  } else if (paymentMethod === 'split') {
    walletDeducted = Math.min(Number(req.body.walletAmount) || 0, totalAmount);
    cashOrPosPaid = Math.max(0, totalAmount - walletDeducted);
  } else if (paymentMethod === 'credit') {
    isCredit = true;
  } else {
    cashOrPosPaid = totalAmount;
  }

  let targetAccount: Account | undefined;
  if (cashOrPosPaid > 0 && accountId) {
    targetAccount = db.accounts.find((a) => a.id === accountId);
    if (targetAccount) {
      targetAccount.balance += cashOrPosPaid;
    }
  }

  let person: Person | undefined;
  if (personId) {
    person = db.persons.find((p) => p.id === personId);
    if (person) {
      if (walletDeducted > 0) {
        // Deduct from customer wallet credit (balance moves towards 0 / positive)
        person.currentBalance += walletDeducted;
      }
      if (isCredit) {
        person.currentBalance += totalAmount;
      }
    }
  }

  let paymentNote = '';
  if (walletDeducted > 0 && cashOrPosPaid > 0) {
    paymentNote = ` [ترکیبی: کیف پول + واریزی]`;
  } else if (walletDeducted > 0) {
    paymentNote = ` [کیف پول]`;
  } else if (isCredit) {
    paymentNote = ` [نسیه]`;
  } else {
    paymentNote = '';
  }

  const buffetCat = getCategoryForSection(db, 'income', 'buffet', ['بوفه', 'کافه', 'خوراکی']);
  const tx: Transaction = {
    id: `tx_pos_${Date.now()}`,
    type: 'income',
    amount: totalAmount,
    date: date || nowIso,
    jalaliDate: jalaliDate || '',
    categoryId: buffetCat.id,
    categoryName: buffetCat.name,
    toAccountId: targetAccount?.id,
    toAccountName: targetAccount?.name,
    personId: person?.id,
    personName: person?.name,
    description: `فروش بوفه (${receiptItems.map((i) => `${i.productName} × ${i.quantity}`).join(' + ')})${paymentNote}`,
    receiptItems,
    createdBy: 'اپراتور',
    createdAt: nowIso,
  };

  db.transactions.unshift(tx);
  logAudit(db, 'product', tx.id, 'create', `فروش بوفه: ${totalAmount} تومان${paymentNote}`);
  saveDatabase(db);

  res.status(201).json({ success: true, transaction: tx, products: db.products });
});

// Restock
app.post('/api/buffet/restock', (req: Request, res: Response) => {
  const { productId, quantity, costPerUnit, accountId, date, jalaliDate } = req.body;
  const numQty = Number(quantity);
  const numCost = Number(costPerUnit);
  if (!productId || isNaN(numQty) || numQty <= 0) {
    res.status(400).json({ error: 'اطلاعات شارژ نامعتبر است' });
    return;
  }
  const db = loadDatabase();
  const prod = db.products.find((p) => p.id === productId);
  if (!prod) {
    res.status(404).json({ error: 'کالا یافت نشد' });
    return;
  }

  const totalExpense = (numCost || prod.purchasePrice) * numQty;
  prod.stock += numQty;
  if (numCost > 0) prod.purchasePrice = numCost;

  let acc: Account | undefined;
  if (accountId) {
    acc = db.accounts.find((a) => a.id === accountId);
    if (acc) acc.balance -= totalExpense;
  }

  const nowIso = new Date().toISOString();
  const restockCat = getCategoryForSection(db, 'expense', 'buffet_restock', ['بوفه', 'خرید']);
  const tx: Transaction = {
    id: `tx_rstk_${Date.now()}`,
    type: 'expense',
    amount: totalExpense,
    date: date || nowIso,
    jalaliDate: jalaliDate || '',
    categoryId: restockCat.id,
    categoryName: restockCat.name,
    fromAccountId: acc?.id,
    fromAccountName: acc?.name,
    description: `خرید و شارژ ${prod.name} (${numQty} ${prod.unit})`,
    createdBy: 'مدیر',
    createdAt: nowIso,
  };
  db.transactions.unshift(tx);

  db.inventoryLogs.unshift({
    id: `inv_rstk_${Date.now()}`,
    productId: prod.id,
    productName: prod.name,
    type: 'restock',
    quantity: numQty,
    costPerUnit: numCost || prod.purchasePrice,
    reason: 'شارژ موجودی انبار',
    transactionId: tx.id,
    date: date || nowIso,
    createdAt: nowIso,
  });

  logAudit(db, 'product', prod.id, 'update', `شارژ انبار ${prod.name} به تعداد ${numQty}`);
  saveDatabase(db);

  res.status(201).json({ success: true, product: prod, transaction: tx });
});

// Waste
app.post('/api/buffet/waste', (req: Request, res: Response) => {
  const { productId, quantity, reason } = req.body;
  const numQty = Number(quantity);
  if (!productId || isNaN(numQty) || numQty <= 0) {
    res.status(400).json({ error: 'مقدار ضایعات نامعتبر است' });
    return;
  }
  const db = loadDatabase();
  const prod = db.products.find((p) => p.id === productId);
  if (!prod) {
    res.status(404).json({ error: 'کالا یافت نشد' });
    return;
  }
  if (prod.stock < numQty) {
    res.status(400).json({ error: 'تعداد ضایعات از موجودی فعلی بیشتر است' });
    return;
  }

  prod.stock -= numQty;
  const nowIso = new Date().toISOString();

  db.inventoryLogs.unshift({
    id: `inv_wst_${Date.now()}`,
    productId: prod.id,
    productName: prod.name,
    type: 'waste',
    quantity: numQty,
    costPerUnit: prod.purchasePrice,
    reason: reason || 'ضایعات',
    date: nowIso,
    createdAt: nowIso,
  });

  logAudit(db, 'product', prod.id, 'update', `ثبت ضایعات ${prod.name}: ${numQty} به علت: ${reason}`);
  saveDatabase(db);

  res.json({ success: true, product: prod });
});

function getJalaliDateStringServer(d = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    if (y && m && day) return `${y}/${m}/${day}`;
  } catch {
    // fallback
  }
  return '';
}

function checkAndAutoOpenDueReservations(
  db: DatabaseSchema,
  clientJalaliDate?: string,
  clientTime?: string
): { openedCount: number; openedTabs: OpenTab[] } {
  const now = new Date();
  const todayJalali = clientJalaliDate || getJalaliDateStringServer(now);
  const currentTime =
    clientTime ||
    `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  if (!todayJalali) return { openedCount: 0, openedTabs: [] };

  const openedTabs: OpenTab[] = [];
  const nowIso = now.toISOString();

  if (!Array.isArray(db.reservations)) db.reservations = [];
  if (!Array.isArray(db.openTabs)) db.openTabs = [];

  for (const resv of db.reservations) {
    if (resv.status !== 'confirmed' && resv.status !== 'pending') continue;
    if (!resv.startTime) continue;

    const resvDate = resv.date || todayJalali;
    const isPastDate = resvDate < todayJalali;
    const isTodayDue = resvDate === todayJalali && currentTime >= resv.startTime;

    if (isPastDate || isTodayDue) {
      let person = resv.personId ? db.persons.find((p) => p.id === resv.personId) : undefined;
      if (!person) {
        person = db.persons.find(
          (p) => p.name === resv.customerName || (resv.customerPhone && p.phone === resv.customerPhone)
        );
      }

      const newTab: OpenTab = {
        id: `tab_auto_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        title: resv.title,
        personId: person?.id,
        personName: resv.customerName,
        items: [],
        totalAmount: 0,
        paidAmount: 0,
        discount: 0,
        finalAmount: 0,
        depositAmount: Number(resv.depositAmount) || 0,
        reservationId: resv.id,
        notes: `بازگشایی خودکار نوبت رزرو (ساعت ${resv.startTime})${resv.depositAmount > 0 ? ` [بیعانه: ${resv.depositAmount.toLocaleString('fa-IR')} ت]` : ''}${resv.notes ? ` - ${resv.notes}` : ''}`,
        startedAt: nowIso,
        status: 'open',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      db.openTabs.unshift(newTab);
      resv.status = 'completed';
      openedTabs.push(newTab);

      logAudit(
        db,
        'tab',
        newTab.id,
        'create',
        `بازگشایی خودکار میز ${resv.title} برای ${resv.customerName} به دلیل فرارسیدن زمان رزرو (${resv.startTime})`
      );
    }
  }

  if (openedTabs.length > 0) {
    saveDatabase(db);
  }

  return { openedCount: openedTabs.length, openedTabs };
}

// Helper to auto-create customer in db.persons whenever manually entered
function findOrCreateCustomer(db: DatabaseSchema, name?: string, phone?: string): Person | undefined {
  if (!name || !name.trim()) return undefined;
  const cleanName = name.trim();
  const cleanPhone = phone?.trim() || undefined;

  const existing = db.persons.find((p) => {
    const nameMatch = p.name.trim().toLowerCase() === cleanName.toLowerCase();
    const phoneMatch = cleanPhone && p.phone && p.phone.trim() === cleanPhone;
    return nameMatch || phoneMatch;
  });

  if (existing) {
    if (cleanPhone && !existing.phone) {
      existing.phone = cleanPhone;
    }
    return existing;
  }

  const newPerson: Person = {
    id: `per_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: cleanName,
    phone: cleanPhone,
    type: 'customer',
    currentBalance: 0,
    maxCreditLimit: 500000,
    createdAt: new Date().toISOString(),
  };

  db.persons.unshift(newPerson);
  logAudit(db, 'person', newPerson.id, 'create', `ثبت خودکار مشتری جدید: ${cleanName}${cleanPhone ? ` (${cleanPhone})` : ''}`);
  return newPerson;
}

// ======================== OPEN TABS / GAMING SESSIONS ========================

// Open running orders for gamers, tables, consoles, VIP rooms
app.get('/api/tabs', (_req: Request, res: Response) => {
  const db = loadDatabase();
  checkAndAutoOpenDueReservations(db);
  res.json({ tabs: db.openTabs || [] });
});

app.post('/api/tabs', (req: Request, res: Response) => {
  const { title, personId, customerName, customerPhone, notes } = req.body;
  if (!title) {
    res.status(400).json({ error: 'نام میز یا اتاق الزامی است' });
    return;
  }
  const db = loadDatabase();
  let person = personId ? db.persons.find((p) => p.id === personId) : undefined;
  if (!person && customerName) {
    person = findOrCreateCustomer(db, customerName, customerPhone);
  }
  const nowIso = new Date().toISOString();

  const newTab: OpenTab = {
    id: `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: title.trim(),
    personId: person?.id,
    personName: person?.name || customerName?.trim() || undefined,
    items: [],
    totalAmount: 0,
    notes: notes?.trim(),
    startedAt: nowIso,
    status: 'open',
    createdAt: nowIso,
  };

  db.openTabs.unshift(newTab);
  logAudit(db, 'tab', newTab.id, 'create', `باز کردن حساب میز: ${newTab.title}${person ? ` برای ${person.name}` : ''}`);
  saveDatabase(db);
  res.status(201).json({ ...newTab, persons: db.persons });
});

// Edit or update an open tab (title, notes, person)
app.put('/api/tabs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, personId, customerName, customerPhone, notes, items } = req.body;
  const db = loadDatabase();
  const tab = db.openTabs.find((t) => t.id === id);
  if (!tab) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  if (title !== undefined) tab.title = title.trim();
  if (notes !== undefined) tab.notes = notes.trim();
  if (personId !== undefined || customerName !== undefined) {
    let person = personId ? db.persons.find((p) => p.id === personId) : undefined;
    if (!person && customerName) {
      person = findOrCreateCustomer(db, customerName, customerPhone);
    }
    tab.personId = person?.id;
    tab.personName = person?.name || (customerName ? customerName.trim() : undefined);
  }
  if (items && Array.isArray(items)) {
    tab.items = items;
    tab.totalAmount = items.reduce((sum: number, it: OpenTabItem) => sum + (it.totalPrice || it.unitPrice * it.quantity), 0);
  }
  tab.updatedAt = new Date().toISOString();
  logAudit(db, 'tab', id, 'update', `ویرایش میز: ${tab.title}${tab.personName ? ` برای ${tab.personName}` : ''}`);
  saveDatabase(db);
  res.json({ ...tab, persons: db.persons });
});

// Add item(s) to open tab
app.post('/api/tabs/:id/items', (req: Request, res: Response) => {
  const { id } = req.params;
  const { productId, productName, quantity, unitPrice } = req.body;
  const db = loadDatabase();
  const tab = db.openTabs.find((t) => t.id === id);
  if (!tab) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  const qty = Number(quantity) || 1;
  let finalName = productName;
  let finalUnitPrice = Number(unitPrice) || 0;

  if (productId) {
    const prod = db.products.find((p) => p.id === productId);
    if (prod) {
      finalName = prod.name;
      finalUnitPrice = prod.sellPrice;
    }
  }

  const newItem: OpenTabItem = {
    id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    productId: productId || undefined,
    productName: finalName || 'سفارش بوفه',
    quantity: qty,
    unitPrice: finalUnitPrice,
    totalPrice: finalUnitPrice * qty,
    addedAt: new Date().toISOString(),
  };

  tab.items.push(newItem);
  tab.totalAmount = tab.items.reduce((sum, it) => sum + it.totalPrice, 0);
  tab.updatedAt = new Date().toISOString();
  logAudit(db, 'tab', id, 'update', `افزودن ${newItem.productName} (تعداد ${qty}) به ${tab.title}`);
  saveDatabase(db);

  res.json(tab);
});

// Remove item from open tab
app.delete('/api/tabs/:id/items/:itemId', (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const db = loadDatabase();
  const tab = db.openTabs.find((t) => t.id === id);
  if (!tab) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  tab.items = tab.items.filter((it) => it.id !== itemId);
  tab.totalAmount = tab.items.reduce((sum, it) => sum + it.totalPrice, 0);
  tab.updatedAt = new Date().toISOString();
  saveDatabase(db);
  res.json(tab);
});

// Final Checkout / Settlement of open tab
app.post('/api/tabs/:id/checkout', (req: Request, res: Response) => {
  const { id } = req.params;
  const { paymentMethod, accountId, personId, customerName, customerPhone, date, jalaliDate } = req.body;
  const db = loadDatabase();
  const tabIndex = db.openTabs.findIndex((t) => t.id === id);
  if (tabIndex === -1) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  const tab = db.openTabs[tabIndex];
  if (tab.items.length === 0) {
    res.status(400).json({ error: 'حساب این میز خالی است' });
    return;
  }

  const totalAmount = tab.totalAmount;
  const nowIso = new Date().toISOString();

  // Deduct stock for inventory products
  const receiptItems = [];
  for (const item of tab.items) {
    if (item.productId) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        db.inventoryLogs.unshift({
          id: `inv_tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: prod.id,
          productName: prod.name,
          type: 'sale_deduction',
          quantity: item.quantity,
          costPerUnit: prod.purchasePrice,
          reason: `تسویه میز: ${tab.title}`,
          date: date || nowIso,
          createdAt: nowIso,
        });
      }
    }
    receiptItems.push({
      productId: item.productId,
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    });
  }

  // Deduct advance deposit (بیعانه رزرو) from checkout payment
  const depositPaid = Number(tab.depositAmount) || 0;
  const finalPayable = Math.max(0, totalAmount - depositPaid);

  let walletDeducted = 0;
  let cashOrPosPaid = 0;
  let isCredit = false;

  if (paymentMethod === 'wallet') {
    const wAmt = Number(req.body.walletAmount);
    walletDeducted = !isNaN(wAmt) && wAmt > 0 ? Math.min(wAmt, finalPayable) : finalPayable;
    cashOrPosPaid = Math.max(0, finalPayable - walletDeducted);
  } else if (paymentMethod === 'split') {
    walletDeducted = Math.min(Number(req.body.walletAmount) || 0, finalPayable);
    cashOrPosPaid = Math.max(0, finalPayable - walletDeducted);
  } else if (paymentMethod === 'credit') {
    isCredit = true;
  } else {
    cashOrPosPaid = finalPayable;
  }

  // Account update (only add the net cash/pos portion since deposit was already received)
  let targetAccount: Account | undefined;
  if (cashOrPosPaid > 0 && accountId) {
    targetAccount = db.accounts.find((a) => a.id === accountId);
    if (targetAccount) {
      targetAccount.balance += cashOrPosPaid;
    }
  }

  // Person update (Wallet deduction or credit debt)
  let targetPerson: Person | undefined;
  const finalPersonId = personId || tab.personId;
  if (finalPersonId) {
    targetPerson = db.persons.find((p) => p.id === finalPersonId);
  } else if (customerName) {
    targetPerson = findOrCreateCustomer(db, customerName, customerPhone);
  }

  if (targetPerson) {
    if (walletDeducted > 0) {
      targetPerson.currentBalance += walletDeducted;
    }
    if (isCredit && finalPayable > 0) {
      targetPerson.currentBalance += finalPayable;
    }
  }

  // Create income transaction for the settled table
  const descSuffix = depositPaid > 0 
    ? ` (کل فاکتور: ${totalAmount.toLocaleString('fa-IR')} ت - کسر بیعانه: ${depositPaid.toLocaleString('fa-IR')} ت = پرداختی: ${finalPayable.toLocaleString('fa-IR')} ت)`
    : '';

  let paymentNote = '';
  if (walletDeducted > 0 && cashOrPosPaid > 0) {
    paymentNote = ` [ترکیبی: کیف پول + واریزی]`;
  } else if (walletDeducted > 0) {
    paymentNote = ` [کیف پول]`;
  } else if (isCredit) {
    paymentNote = ` [نسیه]`;
  } else {
    paymentNote = '';
  }

  const gamingCat = getCategoryForSection(db, 'income', 'gaming', ['میز', 'گیمینگ', 'کنسول', 'بازی']);
  const tx: Transaction = {
    id: `tx_tab_${Date.now()}`,
    type: 'income',
    amount: finalPayable,
    date: date || nowIso,
    jalaliDate: jalaliDate || '',
    categoryId: gamingCat.id,
    categoryName: gamingCat.name,
    toAccountId: targetAccount?.id,
    toAccountName: targetAccount?.name,
    personId: targetPerson?.id,
    personName: targetPerson?.name,
    description: `تسویه ${tab.title} (${tab.items.map((i) => `${i.productName} × ${i.quantity}`).join(' + ')})${descSuffix}${paymentNote}`,
    tabId: tab.id,
    receiptItems,
    createdBy: 'اپراتور',
    createdAt: nowIso,
  };

  db.transactions.unshift(tx);

  // Close tab and link transaction id
  tab.status = 'closed';
  tab.checkoutTransactionId = tx.id;
  tab.updatedAt = nowIso;

  logAudit(db, 'tab', id, 'checkout', `تسویه حساب میز ${tab.title}: کل ${totalAmount} ت (بیعانه ${depositPaid} ت، کیف پول ${walletDeducted} ت، نقد/پوز ${cashOrPosPaid} ت)`);
  saveDatabase(db);

  res.json({ success: true, transaction: tx, message: 'میز با موفقیت تسویه شد', persons: db.persons });
});

// Update item quantity in open tab (increase/decrease)
app.post('/api/tabs/:id/items/:itemId/quantity', (req: Request, res: Response) => {
  const { id, itemId } = req.params;
  const { delta, quantity } = req.body;
  const db = loadDatabase();
  const tab = db.openTabs.find((t) => t.id === id);
  if (!tab) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  const itemIndex = tab.items.findIndex((it) => it.id === itemId);
  if (itemIndex === -1) {
    res.status(404).json({ error: 'آیتم مورد نظر یافت نشد' });
    return;
  }

  const item = tab.items[itemIndex];
  if (quantity !== undefined) {
    item.quantity = Math.max(0, Number(quantity));
  } else if (delta !== undefined) {
    item.quantity = Math.max(0, item.quantity + Number(delta));
  }

  if (item.quantity <= 0) {
    tab.items.splice(itemIndex, 1);
  } else {
    item.totalPrice = item.unitPrice * item.quantity;
  }

  tab.totalAmount = tab.items.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
  tab.updatedAt = new Date().toISOString();
  saveDatabase(db);
  res.json({ success: true, tab });
});

// Reopen a closed desk/tab for corrections (Rolls back previous checkout transaction and restores stock)
app.post('/api/tabs/:id/reopen', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const tab = db.openTabs.find((t) => t.id === id);
  if (!tab) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  // 1. Find previous checkout transaction reliably by ID, tabId, or title match
  const txIndex = db.transactions.findIndex(
    (t) =>
      (tab.checkoutTransactionId && t.id === tab.checkoutTransactionId) ||
      t.tabId === tab.id ||
      (t.id.startsWith('tx_tab_') && t.description.includes(tab.title))
  );

  if (txIndex !== -1) {
    const oldTx = db.transactions[txIndex];

    // Revert account balance
    if (oldTx.toAccountId) {
      const acc = db.accounts.find((a) => a.id === oldTx.toAccountId);
      if (acc) {
        acc.balance = Math.max(0, acc.balance - oldTx.amount);
      }
    }

    // Revert customer credit balance if credit
    if (oldTx.personId && (oldTx.description.includes('[نسیه]') || !oldTx.toAccountId)) {
      const person = db.persons.find((p) => p.id === oldTx.personId);
      if (person) {
        person.currentBalance = Math.max(0, person.currentBalance - oldTx.amount);
      }
    }

    // Restore inventory stock that was deducted on checkout
    if (oldTx.receiptItems && Array.isArray(oldTx.receiptItems)) {
      for (const item of oldTx.receiptItems) {
        if (item.productId) {
          const prod = db.products.find((p) => p.id === item.productId);
          if (prod) {
            prod.stock += item.quantity;
            db.inventoryLogs.unshift({
              id: `inv_restore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              productId: prod.id,
              productName: prod.name,
              type: 'manual_correction',
              quantity: item.quantity,
              costPerUnit: prod.purchasePrice,
              reason: `بازگشت به انبار به علت بازگشایی و اصلاح میز: ${tab.title}`,
              date: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Remove the old transaction
    db.transactions.splice(txIndex, 1);
  } else {
    // Fallback: If old transaction was not found (e.g. legacy demo data),
    // restore stock using tab's items so closing again doesn't double-deduct stock
    for (const item of tab.items) {
      if (item.productId) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) {
          prod.stock += item.quantity;
          db.inventoryLogs.unshift({
            id: `inv_restore_fallback_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            productId: prod.id,
            productName: prod.name,
            type: 'manual_correction',
            quantity: item.quantity,
            costPerUnit: prod.purchasePrice,
            reason: `بازگشت به انبار به علت بازگشایی میز: ${tab.title}`,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  tab.status = 'open';
  tab.checkoutTransactionId = undefined;
  tab.updatedAt = new Date().toISOString();

  logAudit(
    db,
    'tab',
    id,
    'update',
    `بازگشایی مجدد میز ${tab.title} و لغو تسویه قبلی جهت اصلاح اقلام`
  );
  saveDatabase(db);
  res.json({
    success: true,
    tab,
    accounts: db.accounts,
    products: db.products,
    message: 'میز بازگشایی شد و تسویه قبلی لغو گردید',
  });
});

// Void / Cancel / Delete open or closed tab (with complete accounting & inventory rollback)
app.delete('/api/tabs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const index = db.openTabs.findIndex((t) => t.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }
  const deleted = db.openTabs.splice(index, 1)[0];

  // 1. Rollback checkout transactions and financial effects if tab was settled / closed
  const relatedTxs = db.transactions.filter(
    (t) =>
      (deleted.checkoutTransactionId && t.id === deleted.checkoutTransactionId) ||
      t.tabId === deleted.id ||
      (t.id.startsWith('tx_tab_') && t.description.includes(deleted.title)) ||
      (t.id.startsWith('tx_pos_') && t.description.includes(deleted.title)) ||
      (t.id.startsWith('tx_unified_') && (t.tabId === deleted.id || t.description.includes(deleted.title)))
  );

  let revertedTxAmount = 0;
  for (const oldTx of relatedTxs) {
    revertedTxAmount += oldTx.amount;

    // Deduct from account balance if deposited into an account
    if (oldTx.toAccountId) {
      const acc = db.accounts.find((a) => a.id === oldTx.toAccountId);
      if (acc) {
        acc.balance = Math.max(0, acc.balance - oldTx.amount);
      }
    }

    // Revert customer credit debt or wallet deduction
    if (oldTx.personId) {
      const person = db.persons.find((p) => p.id === oldTx.personId);
      if (person) {
        if (oldTx.description.includes('[نسیه]') || !oldTx.toAccountId) {
          person.currentBalance = Math.max(0, person.currentBalance - oldTx.amount);
        } else if (oldTx.description.includes('[کیف پول]') || oldTx.description.includes('کیف پول')) {
          person.currentBalance -= oldTx.amount;
        }
      }
    }

    // Remove the transaction from db
    const txIdx = db.transactions.indexOf(oldTx);
    if (txIdx !== -1) {
      db.transactions.splice(txIdx, 1);
    }
  }

  // 2. Restore any inventory items from the deleted tab ONLY if tab was closed/settled
  if (deleted.status === 'closed') {
    for (const item of deleted.items || []) {
      if (item.productId) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) {
          prod.stock += item.quantity;
          db.inventoryLogs.unshift({
            id: `inv_restore_del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            productId: prod.id,
            productName: prod.name,
            type: 'manual_correction',
            quantity: item.quantity,
            costPerUnit: prod.purchasePrice,
            reason: `بازگشت به انبار به علت حذف فاکتور / میز: ${deleted.title}`,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  logAudit(
    db,
    'tab',
    id,
    'delete',
    `حذف فاکتور میز ${deleted.title}${revertedTxAmount > 0 ? ` و لغو سند مالی به مبلغ ${revertedTxAmount.toLocaleString('fa-IR')} تومان` : ''}`
  );
  saveDatabase(db);
  res.json({
    success: true,
    message: 'میز با موفقیت حذف شد و حساب و کتاب مالی و انبار اصلاح گردید',
    revertedAmount: revertedTxAmount,
  });
});

// ======================== RESERVATIONS / BOOKINGS ========================

app.get('/api/reservations', (_req: Request, res: Response) => {
  const db = loadDatabase();
  checkAndAutoOpenDueReservations(db);
  res.json({ reservations: db.reservations || [] });
});

app.post('/api/reservations/check-auto-open', (req: Request, res: Response) => {
  const { clientJalaliDate, clientTime } = req.body;
  const db = loadDatabase();
  const result = checkAndAutoOpenDueReservations(db, clientJalaliDate, clientTime);
  res.json(result);
});

app.post('/api/reservations', (req: Request, res: Response) => {
  const {
    title,
    customerName,
    customerPhone,
    personId,
    date,
    startTime,
    endTime,
    depositAmount,
    depositAccountId,
    notes,
    tableCount,
  } = req.body;

  if (!title || !customerName || !startTime) {
    res.status(400).json({ error: 'نام میز/دستگاه، نام مشتری و ساعت شروع الزامی است' });
    return;
  }

  const db = loadDatabase();
  const nowIso = new Date().toISOString();
  const numDeposit = Number(depositAmount) || 0;
  const count = Math.min(10, Math.max(1, Number(tableCount) || 1));

  // Automatically find or create customer in db.persons so manual customers appear in Contacts/Persons list
  let targetPerson = personId ? db.persons.find((p) => p.id === personId) : undefined;
  if (!targetPerson) {
    targetPerson = findOrCreateCustomer(db, customerName, customerPhone);
  }
  const finalPersonId = targetPerson?.id || undefined;
  const finalCustomerName = targetPerson?.name || customerName.trim();
  const finalCustomerPhone = customerPhone?.trim() || targetPerson?.phone || undefined;

  // If deposit provided and account specified, record financial transaction once for the customer
  if (numDeposit > 0 && depositAccountId) {
    const acc = db.accounts.find((a) => a.id === depositAccountId);
    if (acc) {
      acc.balance += numDeposit;
      const tx: Transaction = {
        id: `tx_dep_${Date.now()}`,
        type: 'income',
        amount: numDeposit,
        date: nowIso,
        jalaliDate: date || '',
        toAccountId: acc.id,
        toAccountName: acc.name,
        personId: finalPersonId,
        personName: finalCustomerName,
        description:
          count > 1
            ? `بیعانه رزرو گروهی ${count} دستگاه (${title.trim()}) - ${finalCustomerName}`
            : `بیعانه رزرو نوبت ${title.trim()} - ${finalCustomerName}`,
        createdBy: 'اپراتور',
        createdAt: nowIso,
      };
      db.transactions.unshift(tx);
    }
  }

  const groupId = count > 1 ? `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}` : undefined;
  const createdReservations: Reservation[] = [];

  // Split deposit across tables equally
  const perTableDeposit = count > 1 ? Math.floor(numDeposit / count) : numDeposit;
  const remainderDeposit = count > 1 ? numDeposit - perTableDeposit * count : 0;

  for (let i = 1; i <= count; i++) {
    const tableTitle =
      count > 1
        ? `${title.trim()} (میز ${i} از ${count})`
        : title.trim();

    const tableDeposit = i === 1 ? perTableDeposit + remainderDeposit : perTableDeposit;

    const resv: Reservation = {
      id: `res_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      title: tableTitle,
      customerName: finalCustomerName,
      customerPhone: finalCustomerPhone,
      personId: finalPersonId,
      groupId,
      tableCount: count,
      date: date?.trim() || '',
      startTime: startTime.trim(),
      endTime: endTime?.trim() || undefined,
      depositAmount: tableDeposit,
      depositAccountId: depositAccountId || undefined,
      status: 'confirmed',
      notes:
        count > 1
          ? `${notes?.trim() ? `${notes.trim()} - ` : ''}رزرو گروهی (${count} دستگاه برای ${finalCustomerName})`
          : notes?.trim() || undefined,
      createdAt: nowIso,
    };

    createdReservations.push(resv);
    db.reservations.unshift(resv);
  }

  logAudit(
    db,
    'settings',
    createdReservations[0].id,
    'create',
    count > 1
      ? `ثبت رزرو گروهی ${count} دستگاه برای ${finalCustomerName} (${title.trim()})`
      : `ثبت رزرو نوبت: ${title.trim()} برای ${finalCustomerName}`
  );

  saveDatabase(db);
  res.status(201).json({
    ...createdReservations[0],
    createdPerson: targetPerson,
    persons: db.persons,
  });
});

app.put('/api/reservations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, customerName, customerPhone, date, startTime, endTime, depositAmount, status, notes } = req.body;
  const db = loadDatabase();
  const resv = db.reservations.find((r) => r.id === id);
  if (!resv) {
    res.status(404).json({ error: 'رزرو یافت نشد' });
    return;
  }

  if (title !== undefined) resv.title = title.trim();
  if (customerName !== undefined) resv.customerName = customerName.trim();
  if (customerPhone !== undefined) resv.customerPhone = customerPhone.trim();
  if (date !== undefined) resv.date = date.trim();
  if (startTime !== undefined) resv.startTime = startTime.trim();
  if (endTime !== undefined) resv.endTime = endTime.trim();
  if (depositAmount !== undefined) resv.depositAmount = Number(depositAmount);
  if (status !== undefined) resv.status = status;
  if (notes !== undefined) resv.notes = notes.trim();

  logAudit(db, 'settings', id, 'update', `ویرایش رزرو نوبت: ${resv.title} (${resv.status})`);
  saveDatabase(db);
  res.json(resv);
});

app.delete('/api/reservations/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const index = db.reservations.findIndex((r) => r.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'رزرو یافت نشد' });
    return;
  }
  const deleted = db.reservations.splice(index, 1)[0];
  logAudit(db, 'settings', id, 'delete', `حذف رزرو نوبت: ${deleted.title}`);
  saveDatabase(db);
  res.json({ success: true, message: 'رزرو حذف شد' });
});

// Convert reservation to active table tab
app.post('/api/reservations/:id/convert-to-tab', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const resv = db.reservations.find((r) => r.id === id);
  if (!resv) {
    res.status(404).json({ error: 'رزرو یافت نشد' });
    return;
  }

  const nowIso = new Date().toISOString();
  // Find or create person
  let person = db.persons.find(
    (p) => p.name === resv.customerName || (resv.customerPhone && p.phone === resv.customerPhone)
  );

  const newTab: OpenTab = {
    id: `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: resv.title,
    personId: person?.id,
    personName: resv.customerName,
    items: [],
    totalAmount: 0,
    depositAmount: Number(resv.depositAmount) || 0,
    reservationId: resv.id,
    notes: `از رزرو ساعت ${resv.startTime}${resv.depositAmount > 0 ? ` (بیعانه: ${resv.depositAmount} تومان)` : ''} ${resv.notes ? `- ${resv.notes}` : ''}`,
    startedAt: nowIso,
    status: 'open',
    createdAt: nowIso,
  };

  db.openTabs.unshift(newTab);
  resv.status = 'completed';

  logAudit(db, 'tab', newTab.id, 'create', `تبدیل رزرو ${resv.title} به میز فعال برای ${resv.customerName}`);
  saveDatabase(db);
  res.status(201).json({ success: true, tab: newTab, reservation: resv });
});

// Contacts & Debts/Receivables Routes (with Edit & Delete support)
app.get('/api/contacts', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ persons: db.persons });
});

app.post('/api/contacts', (req: Request, res: Response) => {
  const { name, phone, type, initialBalance, maxCreditLimit, debtDueDate, smartLaunchId, nationalId, notes } = req.body;
  if (!name || !type) {
    res.status(400).json({ error: 'نام و نوع شخص الزامی است' });
    return;
  }
  const db = loadDatabase();
  const newPerson: Person = {
    id: `per_${Date.now()}`,
    name: name.trim(),
    phone: phone?.trim(),
    type,
    currentBalance: Number(initialBalance) || 0,
    maxCreditLimit: Number(maxCreditLimit) || 500000,
    debtDueDate: debtDueDate?.trim(),
    smartLaunchId: smartLaunchId?.trim() || undefined,
    nationalId: nationalId?.trim() || undefined,
    notes: notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  db.persons.push(newPerson);
  logAudit(db, 'person', newPerson.id, 'create', `ثبت شخص جدید: ${newPerson.name} ${newPerson.smartLaunchId ? `(SmartLaunch: ${newPerson.smartLaunchId})` : ''}`);
  saveDatabase(db);
  res.status(201).json(newPerson);
});

app.put('/api/contacts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, phone, type, currentBalance, maxCreditLimit, debtDueDate, smartLaunchId, nationalId, notes } = req.body;
  const db = loadDatabase();
  const person = db.persons.find((p) => p.id === id);
  if (!person) {
    res.status(404).json({ error: 'شخص یافت نشد' });
    return;
  }
  if (name !== undefined) person.name = name.trim();
  if (phone !== undefined) person.phone = phone.trim();
  if (type !== undefined) person.type = type;
  if (currentBalance !== undefined && !isNaN(Number(currentBalance))) person.currentBalance = Number(currentBalance);
  if (maxCreditLimit !== undefined && !isNaN(Number(maxCreditLimit))) person.maxCreditLimit = Number(maxCreditLimit);
  if (debtDueDate !== undefined) person.debtDueDate = debtDueDate.trim();
  if (smartLaunchId !== undefined) person.smartLaunchId = smartLaunchId.trim() || undefined;
  if (nationalId !== undefined) person.nationalId = nationalId.trim() || undefined;
  if (notes !== undefined) person.notes = notes.trim() || undefined;
  logAudit(db, 'person', id, 'update', `ویرایش مشخصات شخص: ${person.name}`);
  saveDatabase(db);
  res.json(person);
});

app.delete('/api/contacts/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const index = db.persons.findIndex((p) => p.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'شخص یافت نشد' });
    return;
  }
  const deleted = db.persons.splice(index, 1)[0];
  logAudit(db, 'person', id, 'delete', `حذف شخص: ${deleted.name}`);
  saveDatabase(db);
  res.json({ success: true, message: 'شخص با موفقیت حذف شد' });
});

// Settle debt or receive payment
app.post('/api/contacts/:id/settle', (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, actionType, accountId, date, jalaliDate, description } = req.body;
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'مبلغ تسویه نامعتبر است' });
    return;
  }
  const db = loadDatabase();
  const person = db.persons.find((p) => p.id === id);
  if (!person) {
    res.status(404).json({ error: 'شخص یافت نشد' });
    return;
  }
  const account = db.accounts.find((a) => a.id === accountId);
  if (!account) {
    res.status(404).json({ error: 'حساب انتخاب شده یافت نشد' });
    return;
  }

  const nowIso = new Date().toISOString();
  let txType: TransactionType;

  if (actionType === 'collect') {
    person.currentBalance -= numAmount;
    account.balance += numAmount;
    txType = 'receivable_collection';
  } else {
    person.currentBalance += numAmount;
    account.balance -= numAmount;
    txType = 'debt_settlement';
  }

  const tx: Transaction = {
    id: `tx_stl_${Date.now()}`,
    type: txType,
    amount: numAmount,
    date: date || nowIso,
    jalaliDate: jalaliDate || '',
    fromAccountId: actionType === 'pay' ? account.id : undefined,
    fromAccountName: actionType === 'pay' ? account.name : undefined,
    toAccountId: actionType === 'collect' ? account.id : undefined,
    toAccountName: actionType === 'collect' ? account.name : undefined,
    personId: person.id,
    personName: person.name,
    description:
      description ||
      (actionType === 'collect'
        ? `دریافت طلب از ${person.name}`
        : `تسویه بدهی به ${person.name}`),
    createdBy: 'مدیر',
    createdAt: nowIso,
  };

  db.transactions.unshift(tx);
  logAudit(db, 'person', person.id, 'update', `تسویه مالی ${person.name}: مبلغ ${numAmount} تومان`);
  saveDatabase(db);

  res.json({ success: true, person, account, transaction: tx });
});

// Wallet & Balance Management (شارژ کیف پول، کسر موجودی، تراز مانده مثبت/منفی سینک با حساب‌ها)
app.post('/api/contacts/:id/wallet', (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, amount, targetBalance, accountId, date, jalaliDate, description } = req.body;
  const db = loadDatabase();
  const person = db.persons.find((p) => p.id === id);
  if (!person) {
    res.status(404).json({ error: 'مشتری یا طرف حساب یافت نشد' });
    return;
  }

  const nowIso = new Date().toISOString();
  let tx: Transaction | null = null;
  const account = accountId ? db.accounts.find((a) => a.id === accountId) : undefined;

  if (action === 'charge') {
    // افزایش موجودی کیف پول / دریافت وجه از مشتری
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'مبلغ شارژ باید بزرگتر از صفر باشد' });
      return;
    }
    if (!account) {
      res.status(400).json({ error: 'انتخاب حساب/صندوق جهت دریافت وجه الزامی است' });
      return;
    }
    // In our accounting: negative balance means customer is creditor (has wallet credit), positive means debtor (owes us)
    person.currentBalance -= numAmount;
    account.balance += numAmount;

    tx = {
      id: `tx_wlt_${Date.now()}`,
      type: 'receivable_collection',
      amount: numAmount,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      toAccountId: account.id,
      toAccountName: account.name,
      personId: person.id,
      personName: person.name,
      description: description || `شارژ کیف پول ${person.name} ${person.smartLaunchId ? `[آیدی SmartLaunch: ${person.smartLaunchId}]` : ''}`,
      createdBy: 'مدیر',
      createdAt: nowIso,
    };
    db.transactions.unshift(tx);
    logAudit(db, 'person', person.id, 'update', `شارژ کیف پول ${person.name}: ${numAmount} تومان به حساب ${account.name}`);
  } else if (action === 'deduct') {
    // کسر از موجودی کیف پول / عودت وجه یا اعمال بدهی دستی
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'مبلغ کسر باید بزرگتر از صفر باشد' });
      return;
    }
    person.currentBalance += numAmount;
    if (account) {
      account.balance -= numAmount;
    }

    tx = {
      id: `tx_wlt_${Date.now()}`,
      type: 'debt_settlement',
      amount: numAmount,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      fromAccountId: account?.id,
      fromAccountName: account?.name,
      personId: person.id,
      personName: person.name,
      description: description || `کسر از حساب / برداشت از کیف پول ${person.name}`,
      createdBy: 'مدیر',
      createdAt: nowIso,
    };
    db.transactions.unshift(tx);
    logAudit(db, 'person', person.id, 'update', `کسر از کیف پول ${person.name}: ${numAmount} تومان`);
  } else if (action === 'adjust') {
    // تراز مستقیم و تنظیم مانده حساب (مثبت یا منفی کردن مستقیم مانده)
    const newBal = Number(targetBalance);
    if (isNaN(newBal)) {
      res.status(400).json({ error: 'مانده هدف نامعتبر است' });
      return;
    }
    const oldBal = person.currentBalance;
    const diff = newBal - oldBal;
    person.currentBalance = newBal;

    if (account && diff !== 0) {
      if (diff < 0) {
        // Balance decreased (customer gained credit / paid debt) -> money received into account
        account.balance += Math.abs(diff);
        tx = {
          id: `tx_wlt_${Date.now()}`,
          type: 'receivable_collection',
          amount: Math.abs(diff),
          date: date || nowIso,
          jalaliDate: jalaliDate || '',
          toAccountId: account.id,
          toAccountName: account.name,
          personId: person.id,
          personName: person.name,
          description: description || `تراز مانده کیف پول و دریافت وجه از ${person.name}`,
          createdBy: 'مدیر',
          createdAt: nowIso,
        };
        db.transactions.unshift(tx);
      } else {
        // Balance increased (debt increased) -> money paid out
        account.balance -= diff;
        tx = {
          id: `tx_wlt_${Date.now()}`,
          type: 'debt_settlement',
          amount: diff,
          date: date || nowIso,
          jalaliDate: jalaliDate || '',
          fromAccountId: account.id,
          fromAccountName: account.name,
          personId: person.id,
          personName: person.name,
          description: description || `تراز مانده و پرداخت وجه به ${person.name}`,
          createdBy: 'مدیر',
          createdAt: nowIso,
        };
        db.transactions.unshift(tx);
      }
    }
    logAudit(db, 'person', person.id, 'update', `تعدیل مستقیم مانده حساب ${person.name} از ${oldBal} به ${newBal} تومان`);
  } else {
    res.status(400).json({ error: 'نوع عملیات کیف پول نامعتبر است' });
    return;
  }

  saveDatabase(db);
  res.json({ success: true, person, account, transaction: tx });
});

// Staff & Payroll Routes (with Edit & Delete support)
app.get('/api/staff', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ staff: db.staff, payrollRecords: db.payrollRecords });
});

app.post('/api/staff', (req: Request, res: Response) => {
  const { fullName, phone, roleTitle, monthlySalary, hireDate, notes } = req.body;
  if (!fullName || !monthlySalary) {
    res.status(400).json({ error: 'نام و حقوق ماهانه پرسنل الزامی است' });
    return;
  }
  const db = loadDatabase();
  const newStaff: Staff = {
    id: `stf_${Date.now()}`,
    fullName: fullName.trim(),
    phone: phone?.trim() || '',
    roleTitle: roleTitle?.trim() || 'اپراتور',
    monthlySalary: Number(monthlySalary),
    active: true,
    hireDate: hireDate?.trim() || '',
    notes: notes?.trim(),
  };
  db.staff.push(newStaff);
  logAudit(db, 'staff', newStaff.id, 'create', `ثبت پرسنل: ${newStaff.fullName}`);
  saveDatabase(db);
  res.status(201).json(newStaff);
});

app.put('/api/staff/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { fullName, phone, roleTitle, monthlySalary, active, hireDate, notes } = req.body;
  const db = loadDatabase();
  const stf = db.staff.find((s) => s.id === id);
  if (!stf) {
    res.status(404).json({ error: 'پرسنل یافت نشد' });
    return;
  }
  if (fullName !== undefined) stf.fullName = fullName.trim();
  if (phone !== undefined) stf.phone = phone.trim();
  if (roleTitle !== undefined) stf.roleTitle = roleTitle.trim();
  if (monthlySalary !== undefined && !isNaN(Number(monthlySalary))) stf.monthlySalary = Number(monthlySalary);
  if (active !== undefined) {
    if (typeof active === 'boolean') {
      stf.active = active;
    } else {
      stf.active = active === 'true' || active === 1 || active === '1';
    }
  }
  if (hireDate !== undefined) stf.hireDate = hireDate.trim();
  if (notes !== undefined) stf.notes = notes.trim();
  logAudit(db, 'staff', id, 'update', `ویرایش پرسنل: ${stf.fullName} (وضعیت: ${stf.active ? 'فعال' : 'غیرفعال'})`);
  saveDatabase(db);
  res.json(stf);
});

app.delete('/api/staff/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const index = db.staff.findIndex((s) => s.id === id);
  if (index === -1) {
    res.status(404).json({ error: 'پرسنل یافت نشد' });
    return;
  }
  const deleted = db.staff.splice(index, 1)[0];
  logAudit(db, 'staff', id, 'delete', `حذف پرسنل: ${deleted.fullName}`);
  saveDatabase(db);
  res.json({ success: true, message: 'پرسنل حذف شد' });
});

// Pay staff salary
app.post('/api/staff/pay', (req: Request, res: Response) => {
  const { staffId, amount, period, accountId, date, jalaliDate, notes } = req.body;
  const numAmount = Number(amount);
  if (!staffId || !accountId || isNaN(numAmount) || numAmount <= 0) {
    res.status(400).json({ error: 'اطلاعات پرداخت حقوق نامعتبر است' });
    return;
  }
  const db = loadDatabase();
  const stf = db.staff.find((s) => s.id === staffId);
  const acc = db.accounts.find((a) => a.id === accountId);
  if (!stf || !acc) {
    res.status(404).json({ error: 'پرسنل یا حساب یافت نشد' });
    return;
  }

  acc.balance -= numAmount;
  const nowIso = new Date().toISOString();
  const salaryCat = getCategoryForSection(db, 'expense', 'salary', ['حقوق', 'دستمزد', 'پرسنل']);

  const tx: Transaction = {
    id: `tx_pay_${Date.now()}`,
    type: 'expense',
    amount: numAmount,
    date: date || nowIso,
    jalaliDate: jalaliDate || '',
    categoryId: salaryCat.id,
    categoryName: salaryCat.name,
    fromAccountId: acc.id,
    fromAccountName: acc.name,
    description: `پرداخت حقوق ${period || ''} به ${stf.fullName}`,
    createdBy: 'مدیر',
    createdAt: nowIso,
  };
  db.transactions.unshift(tx);

  const payroll: PayrollRecord = {
    id: `pyr_${Date.now()}`,
    staffId: stf.id,
    staffName: stf.fullName,
    amount: numAmount,
    period: period || 'حقوق ماهانه',
    accountId: acc.id,
    accountName: acc.name,
    paymentDate: date || nowIso,
    jalaliDate: jalaliDate || '',
    transactionId: tx.id,
    notes,
    createdAt: nowIso,
  };
  db.payrollRecords.unshift(payroll);

  logAudit(db, 'staff', stf.id, 'create', `پرداخت حقوق ${numAmount} به ${stf.fullName}`);
  saveDatabase(db);

  res.status(201).json({ success: true, payroll, transaction: tx, account: acc });
});

// Reports & PnL
app.get('/api/reports/pnl', (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const db = loadDatabase();
  const start = startDate ? new Date(startDate as string) : new Date(0);
  const end = endDate ? new Date(endDate as string) : new Date();

  let totalIncome = 0;
  let totalExpense = 0;
  const incomeCategories: Record<string, number> = {};
  const expenseCategories: Record<string, number> = {};

  db.transactions.forEach((tx) => {
    const txDate = new Date(tx.date);
    if (txDate >= start && txDate <= end) {
      if (tx.type === 'income' || tx.type === 'receivable_collection') {
        totalIncome += tx.amount;
        const name = tx.categoryName || 'سایر';
        incomeCategories[name] = (incomeCategories[name] || 0) + tx.amount;
      } else if (tx.type === 'expense' || tx.type === 'debt_settlement') {
        totalExpense += tx.amount;
        const name = tx.categoryName || 'سایر';
        expenseCategories[name] = (expenseCategories[name] || 0) + tx.amount;
      }
    }
  });

  const netProfit = totalIncome - totalExpense;

  res.json({
    totalIncome,
    totalExpense,
    netProfit,
    incomeCategories,
    expenseCategories,
  });
});

// ======================== UNIFIED INSTANT CHECKOUT API ========================
// Handles console rent + buffet items simultaneously with table info & closed invoice creation
app.post('/api/checkout/unified', (req: Request, res: Response) => {
  const {
    cart,
    tableOption,
    tableTitle,
    existingTabId,
    amount,
    accountId,
    personId,
    paymentMethod,
    walletAmount,
    cashOrPosAmount,
    description,
    categoryId,
    date,
    jalaliDate,
  } = req.body;

  const db = loadDatabase();
  const nowIso = new Date().toISOString();

  const items = Array.isArray(cart) ? cart : [];
  let calculatedTotal = 0;
  const receiptItems: ReceiptItem[] = [];

  for (const item of items) {
    const qty = Number(item.quantity) || 1;
    const unitPrice = Number(item.unitPrice) || 0;
    const itemTotal = unitPrice * qty;
    calculatedTotal += itemTotal;

    if (item.productId) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - qty);
        db.inventoryLogs.unshift({
          id: `inv_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: prod.id,
          productName: prod.name,
          type: 'sale_deduction',
          quantity: qty,
          costPerUnit: prod.purchasePrice,
          reason: 'فروش بوفه (تسویه درجا)',
          date: date || nowIso,
          createdAt: nowIso,
        });
      }
    }

    receiptItems.push({
      productId: item.productId,
      productName: item.name,
      quantity: qty,
      unitPrice,
      totalPrice: itemTotal,
    });
  }

  // If amount was passed directly and no cart items, use amount
  const finalAmount = calculatedTotal > 0 ? calculatedTotal : (Number(amount) || 0);
  if (finalAmount <= 0) {
    res.status(400).json({ error: 'مبلغ کل فاکتور نامعتبر است' });
    return;
  }

  // Handle payments & accounts
  let targetAccount = db.accounts.find((a) => a.id === accountId);
  let person = personId ? db.persons.find((p) => p.id === personId) : undefined;
  if (!person && (req.body.customerName || req.body.newCustomerName)) {
    person = findOrCreateCustomer(
      db,
      req.body.customerName || req.body.newCustomerName,
      req.body.customerPhone || req.body.newCustomerPhone
    );
  }

  let walletDeducted = 0;
  let cashOrPosPaid = 0;
  let isCredit = false;

  if (paymentMethod === 'wallet') {
    const wAmt = Number(walletAmount);
    walletDeducted = !isNaN(wAmt) && wAmt > 0 ? Math.min(wAmt, finalAmount) : finalAmount;
    cashOrPosPaid = Math.max(0, finalAmount - walletDeducted);
  } else if (paymentMethod === 'split') {
    walletDeducted = Math.min(Number(walletAmount) || 0, finalAmount);
    cashOrPosPaid = Math.max(0, finalAmount - walletDeducted);
  } else if (paymentMethod === 'credit') {
    isCredit = true;
  } else {
    cashOrPosPaid = finalAmount;
  }

  // Apply money to cash / POS account
  if (cashOrPosPaid > 0 && targetAccount) {
    targetAccount.balance += cashOrPosPaid;
  }

  // Apply wallet or debt to customer
  if (person) {
    if (walletDeducted > 0) {
      person.currentBalance += walletDeducted;
    }
    if (isCredit) {
      person.currentBalance += finalAmount;
    }
  }

  // Description without redundant "[نقدی]" or "[کارتخوان]" as requested in user prompt
  let paymentNote = '';
  if (walletDeducted > 0 && cashOrPosPaid > 0) {
    paymentNote = ` [ترکیبی: کیف پول + ${targetAccount ? targetAccount.name : 'واریزی'}]`;
  } else if (walletDeducted > 0) {
    paymentNote = ` [کیف پول]`;
  } else if (isCredit) {
    paymentNote = ` [نسیه]`;
  }

  // Calculate gaming vs buffet items for intelligent accounting category breakdown
  const gamingItems = items.filter((it) => !it.productId || it.isBuffet === false);
  const buffetItems = items.filter((it) => !!it.productId || it.isBuffet === true);
  const gamingTotal = gamingItems.reduce((acc, it) => acc + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1), 0);
  const buffetTotal = buffetItems.reduce((acc, it) => acc + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1), 0);

  const shouldSplitMixed = (!categoryId || categoryId === 'auto') && gamingTotal > 0 && buffetTotal > 0;
  const createdTxs: Transaction[] = [];

  if (shouldSplitMixed) {
    const gamingCat = db.categories.find((c) => c.section === 'gaming' || c.id === 'cat_ps5') || db.categories.find((c) => c.type === 'income');
    const buffetCat = db.categories.find((c) => c.section === 'buffet' || c.id === 'cat_buffet_inc') || db.categories.find((c) => c.type === 'income');

    const txGaming: Transaction = {
      id: `tx_unified_${Date.now()}_game`,
      type: 'income',
      amount: gamingTotal,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      categoryId: gamingCat?.id || 'cat_ps5',
      categoryName: gamingCat?.name || 'درآمد گیم‌نت',
      toAccountId: targetAccount?.id,
      toAccountName: targetAccount?.name,
      personId: person?.id,
      personName: person?.name,
      description: `فروش (ساعت گیمینگ): ${gamingItems.map((it) => `${it.name} × ${it.quantity}`).join(' + ')}${person ? ` (${person.name})` : ''}${paymentNote}`,
      receiptItems: gamingItems.map((it) => ({
        productId: it.productId,
        productName: it.name,
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        totalPrice: (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1),
      })),
      createdBy: 'اپراتور',
      createdAt: nowIso,
    };

    const txBuffet: Transaction = {
      id: `tx_unified_${Date.now()}_buf`,
      type: 'income',
      amount: buffetTotal,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      categoryId: buffetCat?.id || 'cat_buffet_inc',
      categoryName: buffetCat?.name || 'فروش بوفه و کافه',
      toAccountId: targetAccount?.id,
      toAccountName: targetAccount?.name,
      personId: person?.id,
      personName: person?.name,
      description: `فروش (بوفه و کافه): ${buffetItems.map((it) => `${it.name} × ${it.quantity}`).join(' + ')}${person ? ` (${person.name})` : ''}${paymentNote}`,
      receiptItems: buffetItems.map((it) => ({
        productId: it.productId,
        productName: it.name,
        quantity: Number(it.quantity) || 1,
        unitPrice: Number(it.unitPrice) || 0,
        totalPrice: (Number(it.unitPrice) || 0) * (Number(it.quantity) || 1),
      })),
      createdBy: 'اپراتور',
      createdAt: nowIso,
    };

    createdTxs.push(txGaming, txBuffet);
  } else {
    // Explicit single category or single section
    let cat = categoryId && categoryId !== 'auto' ? db.categories.find((c) => c.id === categoryId) : undefined;
    if (!cat) {
      if (gamingTotal > 0 && buffetTotal === 0) {
        cat = db.categories.find((c) => c.section === 'gaming' || c.id === 'cat_ps5') || db.categories.find((c) => c.type === 'income');
      } else if (buffetTotal > 0 && gamingTotal === 0) {
        cat = db.categories.find((c) => c.section === 'buffet' || c.id === 'cat_buffet_inc') || db.categories.find((c) => c.type === 'income');
      } else {
        cat = db.categories.find((c) => c.section === 'gaming' || c.section === 'buffet') || db.categories.find((c) => c.type === 'income');
      }
    }

    const itemsDesc = items.length > 0
      ? items.map((it) => `${it.name} × ${it.quantity}`).join(' + ')
      : 'درآمد متفرقه';

    const txDesc = description && description.trim()
      ? `${description.trim()}${paymentNote}`
      : `فروش: ${itemsDesc}${person ? ` (${person.name})` : ''}${paymentNote}`;

    const tx: Transaction = {
      id: `tx_unified_${Date.now()}`,
      type: 'income',
      amount: finalAmount,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      categoryId: cat?.id || 'cat_ps5',
      categoryName: cat?.name || 'درآمد گیم‌نت',
      toAccountId: targetAccount?.id,
      toAccountName: targetAccount?.name,
      personId: person?.id,
      personName: person?.name,
      description: txDesc,
      receiptItems,
      createdBy: 'اپراتور',
      createdAt: nowIso,
    };

    createdTxs.push(tx);
  }

  // Primary transaction ID for tab linkage
  const primaryTxId = createdTxs[0].id;

  // Create or attach to Table Tab so it appears in "میزها و فاکتورهای قبلی تسویه شده"
  let attachedTab: OpenTab | undefined;
  if (existingTabId && tableOption === 'existing') {
    const existing = db.openTabs.find((t) => t.id === existingTabId);
    if (existing) {
      existing.status = 'closed';
      existing.closedAt = date || nowIso;
      existing.checkoutTransactionId = primaryTxId;
      existing.totalAmount += finalAmount;
      existing.paidAmount = existing.totalAmount;
      existing.finalAmount = existing.totalAmount;
      if (items.length > 0) {
        items.forEach((it, idx) => {
          existing.items.push({
            id: `item_${Date.now()}_${idx}`,
            productId: it.productId,
            productName: it.name,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: (it.unitPrice || 0) * it.quantity,
            addedAt: date || nowIso,
          });
        });
      } else {
        existing.items.push({
          id: `item_${Date.now()}_0`,
          productName: description && description.trim() ? description.trim() : 'درآمد دستی',
          quantity: 1,
          unitPrice: finalAmount,
          totalPrice: finalAmount,
          addedAt: date || nowIso,
        });
      }
      existing.updatedAt = nowIso;
      attachedTab = existing;
    }
  }

  if (!attachedTab) {
    const deskTitle = tableTitle && tableTitle.trim() ? tableTitle.trim() : 'میز تسویه درجا';
    const tabItemsList =
      items.length > 0
        ? items.map((it, idx) => ({
            id: `item_quick_${Date.now()}_${idx}`,
            productId: it.productId,
            productName: it.name,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            totalPrice: (it.unitPrice || 0) * it.quantity,
            addedAt: date || nowIso,
          }))
        : [
            {
              id: `item_quick_${Date.now()}_0`,
              productName: description && description.trim() ? description.trim() : 'درآمد دستی',
              quantity: 1,
              unitPrice: finalAmount,
              totalPrice: finalAmount,
              addedAt: date || nowIso,
            },
          ];

    const closedTab: OpenTab = {
      id: `tab_quick_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: deskTitle,
      personId: person?.id,
      personName: person?.name,
      startedAt: date || nowIso,
      closedAt: date || nowIso,
      status: 'closed',
      items: tabItemsList,
      totalAmount: finalAmount,
      paidAmount: finalAmount,
      discount: 0,
      finalAmount: finalAmount,
      checkoutTransactionId: primaryTxId,
      createdAt: date || nowIso,
      updatedAt: nowIso,
    };
    db.openTabs.unshift(closedTab);
    attachedTab = closedTab;
  }

  // Link transactions to tab and unshift to DB
  for (const t of createdTxs) {
    t.tabId = attachedTab.id;
    db.transactions.unshift(t);
  }

  logAudit(db, 'transaction', primaryTxId, 'create', `تسویه فاکتور سریع: ${finalAmount} تومان (${createdTxs.map((t) => t.categoryName).join(' + ')})`);
  saveDatabase(db);

  res.status(201).json({
    success: true,
    transaction: createdTxs[0],
    transactions: createdTxs,
    tab: attachedTab,
    products: db.products,
    persons: db.persons,
  });
});

// Settings & Backup/Restore
app.get('/api/settings', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ settings: db.settings });
});

app.put('/api/settings', (req: Request, res: Response) => {
  const db = loadDatabase();
  db.settings = { ...db.settings, ...req.body };
  logAudit(db, 'settings', 'sys', 'update', 'به‌روزرسانی تنظیمات عمومی سیستم');
  saveDatabase(db);
  res.json({ settings: db.settings });
});

app.get('/api/audit-logs', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ auditLogs: db.auditLogs });
});

// Full Backup Download (JSON)
app.get('/api/backup/download', (_req: Request, res: Response) => {
  const db = loadDatabase();
  const safeName = (db.settings.name || 'GameNet').replace(/[^a-zA-Z0-9_\u0600-\u06FF]/g, '_');
  res.setHeader('Content-Disposition', `attachment; filename=${safeName}_backup_${Date.now()}.json`);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

// Restore from JSON Backup
app.post('/api/backup/restore', (req: Request, res: Response) => {
  const backupData = req.body;
  if (!backupData || !backupData.accounts || !backupData.transactions) {
    res.status(400).json({ error: 'فایل پشتیبان نامعتبر است' });
    return;
  }
  saveDatabase(backupData);
  res.json({ success: true, message: 'اطلاعات با موفقیت بازیابی شد' });
});

// Reset or Clean Zero Data for Client Handover with Granular Selection
app.post('/api/reset-data', (req: Request, res: Response) => {
  const { clean } = req.query;
  const options = req.body?.options;
  const isCustomClean = options && typeof options === 'object' && Object.keys(options).length > 0;

  if (isCustomClean) {
    const db = loadDatabase();

    if (options.transactions) {
      db.transactions = [];
    }
    if (options.tabs) {
      db.openTabs = [];
    }
    if (options.accounts) {
      db.accounts.forEach((acc) => {
        acc.balance = 0;
        acc.initialBalance = 0;
      });
    }
    if (options.debtBalances) {
      db.persons.forEach((p) => {
        p.currentBalance = 0;
      });
    }
    if (options.persons) {
      db.persons = [];
    }
    if (options.staffPayroll) {
      db.payrollRecords = [];
    }
    if (options.reservations) {
      db.reservations = [];
    }
    if (options.inventoryLogs) {
      db.inventoryLogs = [];
    }
    if (options.auditLogs) {
      db.auditLogs = [];
    }
    if (options.stockQuantities) {
      db.products.forEach((p) => {
        p.stock = 0;
      });
    }

    logAudit(db, 'settings', 'sys', 'update', 'صفر کردن انتخابی داده‌ها جهت تحویل سیستم به مشتری');
    saveDatabase(db);
    res.json({ success: true, message: 'بخش‌های انتخاب‌شده با موفقیت پاک‌سازی و صفر شدند' });
    return;
  }

  if (clean === 'true' || clean === '1') {
    // Zero out all test data for clean handover to client
    const fresh = getInitialData();
    fresh.transactions = [];
    fresh.openTabs = [];
    fresh.payrollRecords = [];
    fresh.inventoryLogs = [];
    fresh.reservations = [];
    fresh.auditLogs = [
      {
        id: `aud_init_${Date.now()}`,
        entityType: 'settings',
        entityId: 'sys',
        action: 'create',
        userId: 'usr_admin',
        userName: 'مدیر کل',
        details: 'صفر کردن کلیه داده‌ها جهت تحویل سیستم به مشتری',
        timestamp: new Date().toISOString(),
      },
    ];
    // Zero account balances
    fresh.accounts.forEach((acc) => {
      acc.balance = 0;
      acc.initialBalance = 0;
    });
    // Zero person debts
    fresh.persons.forEach((p) => {
      p.currentBalance = 0;
    });
    saveDatabase(fresh);
    res.json({ success: true, message: 'کلیه داده‌ها، تراکنش‌ها و حساب‌ها با موفقیت صفر شدند' });
    return;
  }

  const fresh = getInitialData();
  saveDatabase(fresh);
  res.json({ success: true, message: 'داده‌ها به حالت اولیه دمو بازنشانی شدند' });
});

// Serve frontend in development via Vite middleware or production static
async function startServer() {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  // Clean up any stale temp files from previous abrupt shutdowns
  cleanupOrphanedTempFiles();

  // Eagerly load and validate database into authoritative memory state
  try {
    const initialDb = loadDatabase();
    console.log(`[Database] Initialized successfully. Loaded ${initialDb.users.length} users, ${initialDb.transactions.length} transactions, ${initialDb.accounts.length} accounts.`);
  } catch (dbErr) {
    console.error('[Database] Failed eager database startup verification:', dbErr);
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXUS GameNet Accounting Server running on http://0.0.0.0:${PORT}`);
  });

  // Background worker: Automatically check and open due reservations every 20 seconds
  setInterval(() => {
    try {
      const db = loadDatabase();
      checkAndAutoOpenDueReservations(db);
    } catch {
      // ignore
    }
  }, 20000);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use.`);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
