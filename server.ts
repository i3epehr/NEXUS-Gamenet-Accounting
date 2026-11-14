// NEXUS GameNet Backend Server - v2.4.1
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { AsyncLocalStorage } from 'async_hooks';

const execAsync = promisify(exec);
let isSystemUpdating = false;
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
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

const SESSION_TTL_DEFAULT_MS = 12 * 60 * 60 * 1000; // 12 hours
const SESSION_TTL_REMEMBER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

interface ServerSession {
  token: string;
  userId: string;
  ip: string;
  userAgent: string;
  rememberMe: boolean;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
}

interface AuthedRequest extends Request {
  authUser?: User;
  authSession?: ServerSession;
}

const authContextStorage = new AsyncLocalStorage<User>();
const activeSessions = new Map<string, ServerSession>();
const loginAttempts = new Map<string, { count: number; firstAttemptAt: number }>();
let lastSessionSaveAt = 0;

function getClientIp(req: Request): string {
  return (req.ip || req.socket?.remoteAddress || 'unknown').toString();
}

function loadSessionsFromFile() {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
    if (Array.isArray(raw)) {
      const now = Date.now();
      for (const s of raw) {
        if (s && typeof s.token === 'string' && typeof s.userId === 'string' && Date.parse(s.expiresAt) > now) {
          activeSessions.set(s.token, s);
        }
      }
    }
  } catch (err) {
    console.error('[Auth] Failed to load sessions file:', err);
  }
}

function saveSessionsToFile(force = false) {
  const now = Date.now();
  if (!force && now - lastSessionSaveAt < 60000) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(activeSessions.values()).filter((s) => Date.parse(s.expiresAt) > now);
    const tmp = `${SESSIONS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmp, SESSIONS_FILE);
    lastSessionSaveAt = now;
  } catch (err) {
    console.error('[Auth] Failed to save sessions file:', err);
  }
}

function pruneExpiredSessions() {
  const now = Date.now();
  let removed = false;
  for (const [token, session] of activeSessions.entries()) {
    if (Date.parse(session.expiresAt) <= now) {
      activeSessions.delete(token);
      removed = true;
    }
  }
  if (removed) {
    saveSessionsToFile(true);
  }
}

function createServerSession(user: User, req: Request, rememberMe = false): ServerSession {
  pruneExpiredSessions();
  const now = Date.now();
  const ttl = rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_DEFAULT_MS;
  const session: ServerSession = {
    token: crypto.randomBytes(32).toString('hex'),
    userId: user.id,
    ip: getClientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    rememberMe: !!rememberMe,
    createdAt: new Date(now).toISOString(),
    lastActiveAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString(),
  };
  activeSessions.set(session.token, session);
  saveSessionsToFile(true);
  return session;
}

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice(7).trim();
    if (t.length >= 32) return t;
  }
  const altHeader = req.headers['x-auth-token'];
  if (typeof altHeader === 'string' && altHeader.trim().length >= 32) {
    return altHeader.trim();
  }
  return null;
}

function getValidSessionAndUser(req: Request, db: DatabaseSchema): { session: ServerSession; user: User } | null {
  const token = extractBearerToken(req);
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;
  const now = Date.now();
  if (Date.parse(session.expiresAt) <= now) {
    activeSessions.delete(token);
    saveSessionsToFile(true);
    return null;
  }
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || user.active === false) {
    activeSessions.delete(token);
    saveSessionsToFile(true);
    return null;
  }
  session.lastActiveAt = new Date(now).toISOString();
  saveSessionsToFile(false);
  return { session, user };
}

function revokeSessionToken(token: string) {
  if (activeSessions.delete(token)) {
    saveSessionsToFile(true);
  }
}

function revokeUserSessions(userId: string, excludeToken?: string) {
  let changed = false;
  for (const [token, session] of activeSessions.entries()) {
    if (session.userId === userId && token !== excludeToken) {
      activeSessions.delete(token);
      changed = true;
    }
  }
  if (changed) {
    saveSessionsToFile(true);
  }
}

function sanitizeUser(user: User): Omit<User, 'password'> {
  const { password: _removed, ...safe } = user;
  return safe;
}

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(plain: string, stored: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt:')) {
    const parts = stored.split(':');
    if (parts.length !== 3) return false;
    const [, salt, hexHash] = parts;
    try {
      const derived = crypto.scryptSync(plain, salt, 64);
      const storedBuf = Buffer.from(hexHash, 'hex');
      if (derived.length !== storedBuf.length) return false;
      return crypto.timingSafeEqual(derived, storedBuf);
    } catch {
      return false;
    }
  }
  const a = Buffer.from(plain, 'utf8');
  const b = Buffer.from(stored, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hasPerm(user: User | undefined, ...required: string[]): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const perms = user.permissions || [];
  if (perms.includes('all')) return true;
  return required.some((p) => perms.includes(p));
}

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
      password: hashPassword('admin'),
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
      password: hashPassword('123'),
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
      password: hashPassword('123'),
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
      warehouseStock: 24,
      fridgeStock: 8,
      packageUnit: 'باکس',
      unitsPerPackage: 24,
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
      warehouseStock: 30,
      fridgeStock: 10,
      packageUnit: 'باکس',
      unitsPerPackage: 24,
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
      warehouseStock: 10,
      fridgeStock: 4,
      packageUnit: 'کارتن',
      unitsPerPackage: 14,
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
      warehouseStock: 70,
      fridgeStock: 20,
      packageUnit: 'بسته دان قهوه',
      unitsPerPackage: 50,
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
      warehouseStock: 2,
      fridgeStock: 6,
      packageUnit: 'بسته',
      unitsPerPackage: 10,
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
      warehouseStock: 33,
      fridgeStock: 12,
      packageUnit: 'شیرینگ',
      unitsPerPackage: 12,
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

  // Gracefully migrate legacy products to two-tier warehouse/fridge stock model
  obj.products.forEach((prod) => {
    if (typeof prod.stock !== 'number' || isNaN(prod.stock)) {
      prod.stock = 0;
    }
    const hasWarehouse = typeof prod.warehouseStock === 'number' && !isNaN(prod.warehouseStock);
    const hasFridge = typeof prod.fridgeStock === 'number' && !isNaN(prod.fridgeStock);

    if (!hasWarehouse && !hasFridge) {
      // Legacy product without separate fields: assign 30% to fridge (or up to 10), rest to warehouse
      const estFridge = Math.min(prod.stock, Math.max(0, Math.round(prod.stock * 0.3)));
      prod.fridgeStock = estFridge;
      prod.warehouseStock = Math.max(0, prod.stock - estFridge);
    } else if (!hasWarehouse) {
      prod.warehouseStock = Math.max(0, prod.stock - (prod.fridgeStock || 0));
    } else if (!hasFridge) {
      prod.fridgeStock = Math.max(0, prod.stock - (prod.warehouseStock || 0));
    }

    // Keep overall stock strictly synchronized
    prod.stock = Math.max(0, (prod.warehouseStock || 0) + (prod.fridgeStock || 0));

    if (!prod.packageUnit) {
      prod.packageUnit = prod.category === 'نوشیدنی خنک' ? 'باکس' : 'کارتن';
    }
    if (!prod.unitsPerPackage || prod.unitsPerPackage <= 0) {
      prod.unitsPerPackage = prod.category === 'نوشیدنی خنک' ? 24 : 12;
    }
  });

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
  if (memoryDb && fs.existsSync(DB_FILE)) {
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
  userName?: string
) {
  const ctxUser = authContextStorage.getStore();
  db.auditLogs.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    entityType,
    entityId,
    action,
    userId: ctxUser?.id || 'usr_admin',
    userName: userName || ctxUser?.fullName || 'مدیر',
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

// ======================== PUBLIC ROUTES ========================

// Health & System Info
app.get('/api/health', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({
    status: 'ok',
    system: `${db.settings.name || 'GameNet'} Accounting System`,
    timestamp: new Date().toISOString(),
  });
});

// Public minimal branding for Login Screen (no sensitive settings exposed)
app.get('/api/public/branding', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({
    name: db.settings.name,
    currency: db.settings.currency,
    theme: db.settings.theme,
  });
});

// Auth & Session Lifecycle
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password, rememberMe } = req.body || {};
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const inputPassword = String(password || '').trim();
  const clientIp = getClientIp(req);
  const rateKey = `${clientIp}:${normalizedUsername}`;

  // Brute-force protection
  const nowMs = Date.now();
  const attempt = loginAttempts.get(rateKey);
  if (attempt) {
    if (nowMs - attempt.firstAttemptAt > LOGIN_WINDOW_MS) {
      loginAttempts.delete(rateKey);
    } else if (attempt.count >= LOGIN_MAX_FAILS) {
      res.status(429).json({
        error: 'تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً ۲ دقیقه دیگر مجدداً تلاش کنید.',
      });
      return;
    }
  }

  const db = loadDatabase();
  const user = db.users.find((u) => u.username.toLowerCase() === normalizedUsername);

  const recordFailedAttempt = () => {
    const prev = loginAttempts.get(rateKey);
    if (!prev || nowMs - prev.firstAttemptAt > LOGIN_WINDOW_MS) {
      loginAttempts.set(rateKey, { count: 1, firstAttemptAt: nowMs });
    } else {
      prev.count += 1;
    }
  };

  if (!user) {
    recordFailedAttempt();
    res.status(401).json({ error: 'کاربری با این نام کاربری یافت نشد' });
    return;
  }

  if (user.active === false) {
    res.status(403).json({ error: 'حساب کاربری شما غیرفعال شده است' });
    return;
  }

  const storedPassword = user.password || '123456';
  const isPasswordValid = verifyPassword(inputPassword, storedPassword);

  if (!isPasswordValid) {
    recordFailedAttempt();
    res.status(401).json({ error: 'رمز عبور وارد شده اشتباه است' });
    return;
  }

  // Valid login -> reset rate limiter
  loginAttempts.delete(rateKey);

  // Transparently upgrade legacy plaintext password to scrypt hash
  if (!user.password || !user.password.startsWith('scrypt:')) {
    user.password = hashPassword(inputPassword);
  }

  const session = createServerSession(user, req, !!rememberMe);
  logAudit(db, 'auth', user.id, 'login', `ورود کاربر ${user.fullName} به سیستم (${session.ip})`, user.fullName);
  saveDatabase(db);

  res.json({
    token: session.token,
    user: sanitizeUser(user),
    expiresAt: session.expiresAt,
  });
});

app.post('/api/auth/logout', (req: Request, res: Response) => {
  const token = extractBearerToken(req);
  if (token) {
    const db = loadDatabase();
    const session = activeSessions.get(token);
    if (session) {
      const user = db.users.find((u) => u.id === session.userId);
      if (user) {
        logAudit(db, 'auth', user.id, 'login', `خروج کاربر ${user.fullName} از سیستم`, user.fullName);
        saveDatabase(db);
      }
      revokeSessionToken(token);
    }
  }
  res.json({ success: true });
});

app.get('/api/auth/me', (req: Request, res: Response) => {
  const db = loadDatabase();
  const auth = getValidSessionAndUser(req, db);
  if (auth) {
    res.json({ user: sanitizeUser(auth.user) });
    return;
  }
  res.json({ user: null });
});

// ======================== AUTH MIDDLEWARE ========================
// Locks EVERY /api/* route defined below behind valid server-side session token
app.use('/api', (req: AuthedRequest, res: Response, next: NextFunction) => {
  const db = loadDatabase();
  const auth = getValidSessionAndUser(req, db);
  if (!auth) {
    res.status(401).json({ error: 'نشست کاربری معتبر نیست یا منقضی شده است. لطفاً مجدداً وارد شوید.' });
    return;
  }
  req.authUser = auth.user;
  req.authSession = auth.session;
  authContextStorage.run(auth.user, () => next());
});

// Users Management (Passwords are ALWAYS stripped from responses and stored hashed)
app.get('/api/users', (_req: Request, res: Response) => {
  const db = loadDatabase();
  res.json({ users: db.users.map(sanitizeUser) });
});

app.post('/api/users', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_users')) {
    res.status(403).json({ error: 'شما مجوز مدیریت کاربران را ندارید' });
    return;
  }
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

  const rawPassword = (password || '123456').trim();
  const newUser: User = {
    id: `usr_${Date.now()}`,
    username: username.trim(),
    fullName: fullName.trim(),
    role: role || 'operator',
    permissions: Array.isArray(permissions) ? permissions : ['manage_tabs', 'manage_buffet'],
    active: true,
    phone: phone?.trim(),
    password: hashPassword(rawPassword),
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  logAudit(db, 'user', newUser.id, 'create', `ایجاد کاربر: ${newUser.fullName} (${newUser.role})`);
  saveDatabase(db);
  res.status(201).json(sanitizeUser(newUser));
});

app.put('/api/users/:id', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_users')) {
    res.status(403).json({ error: 'شما مجوز ویرایش کاربران را ندارید' });
    return;
  }
  const { id } = req.params;
  const { fullName, role, permissions, active, phone, password } = req.body;
  const db = loadDatabase();
  const user = db.users.find((u) => u.id === id);
  if (!user) {
    res.status(404).json({ error: 'کاربر یافت نشد' });
    return;
  }

  const passwordChanged = !!(password && password.trim());
  const deactivated = active === false && user.active !== false;

  if (fullName !== undefined) user.fullName = fullName.trim();
  if (role !== undefined) user.role = role;
  if (permissions !== undefined) user.permissions = permissions;
  if (active !== undefined) user.active = active;
  if (phone !== undefined) user.phone = phone.trim();
  if (passwordChanged) user.password = hashPassword(password.trim());

  if (deactivated) {
    revokeUserSessions(id);
  } else if (passwordChanged) {
    // Keep current admin's active token if editing self, kick all other sessions for that user
    revokeUserSessions(id, req.authSession?.token);
  }

  logAudit(db, 'user', id, 'update', `ویرایش کاربر: ${user.fullName}`);
  saveDatabase(db);
  res.json(sanitizeUser(user));
});

app.delete('/api/users/:id', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_users')) {
    res.status(403).json({ error: 'شما مجوز حذف کاربران را ندارید' });
    return;
  }
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
  revokeUserSessions(id);
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
    const isCreditTx =
      tx.paymentMethod === 'credit' ||
      (tx as any).isCredit ||
      (!tx.toAccountId && (tx.description?.includes('نسیه') || tx.description?.includes('[نسیه]')));

    if ((tx.type === 'income' && !isCreditTx) || tx.type === 'receivable_collection') {
      if (txDate >= todayStart) todayIncome += tx.amount;
      if (txDate >= monthStart) {
        monthIncome += tx.amount;
        const cat = tx.categoryName || 'سایر';
        categoryIncomeMap[cat] = (categoryIncomeMap[cat] || 0) + tx.amount;
      }
    } else if (tx.type === 'expense' || tx.type === 'debt_settlement') {
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
        const isCreditTx =
          tx.paymentMethod === 'credit' ||
          (tx as any).isCredit ||
          (!tx.toAccountId && (tx.description?.includes('نسیه') || tx.description?.includes('[نسیه]')));

        if ((tx.type === 'income' && !isCreditTx) || tx.type === 'receivable_collection') inc += tx.amount;
        else if (tx.type === 'expense' || tx.type === 'debt_settlement') exp += tx.amount;
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
  }
  if (!person && (req.body.customerName || req.body.personName || req.body.smartLaunchId)) {
    person = findOrCreateCustomer(
      db,
      req.body.customerName || req.body.personName,
      req.body.customerPhone,
      req.body.smartLaunchId
    );
  } else if (person && req.body.smartLaunchId && !person.smartLaunchId) {
    person.smartLaunchId = req.body.smartLaunchId.trim();
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
    paymentMethod: paymentMethod as any,
    isCredit: paymentMethod === 'credit',
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
app.delete('/api/transactions/:id', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'delete_transactions')) {
    res.status(403).json({ error: 'شما مجوز حذف تراکنش‌ها را ندارید' });
    return;
  }
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

  // Rollback credit debt balance if this was a credit/debt sale
  if ((tx.isCredit || tx.paymentMethod === 'credit' || (!tx.toAccountId && tx.description?.includes('[نسیه]'))) && tx.personId) {
    const p = db.persons.find((item) => item.id === tx.personId);
    if (p) p.currentBalance = Math.max(0, p.currentBalance - tx.amount);
  }

  // Rollback desk tab if linked
  if (tx.tabId || tx.id.startsWith('tx_tab_')) {
    const linkedTab = db.openTabs.find(
      (t) => (t.checkoutTransactionId && t.id === tx.tabId) || t.checkoutTransactionId === tx.id || t.id === tx.tabId
    );
    if (linkedTab) {
      linkedTab.checkoutTransactionId = undefined;
      linkedTab.checkoutPaymentMethod = undefined;
      linkedTab.checkoutAccountName = undefined;
      linkedTab.status = 'open';
      linkedTab.closedAt = undefined;
    }
  }

  // Restore inventory items if this transaction had deducted items
  if (tx.receiptItems && Array.isArray(tx.receiptItems) && tx.receiptItems.length > 0) {
    const nowIso = new Date().toISOString();
    for (const item of tx.receiptItems) {
      if (item.productId) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) {
          restoreProductStock(prod, item.quantity, {
            deductedFromFridge: item.deductedFromFridge,
            deductedFromWarehouse: item.deductedFromWarehouse,
          });
          db.inventoryLogs.unshift({
            id: `inv_restore_tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            productId: prod.id,
            productName: prod.name,
            type: 'manual_correction',
            quantity: item.quantity,
            costPerUnit: prod.purchasePrice,
            reason: `بازگشت به انبار به علت حذف تراکنش: ${tx.description}`,
            date: nowIso,
            createdAt: nowIso,
          });
        }
      }
    }
  }

  db.transactions.splice(txIndex, 1);
  // Keep payroll history synced if the deleted transaction was a salary payment
  db.payrollRecords = db.payrollRecords.filter((p) => p.transactionId !== tx.id);
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
  const {
    name,
    category,
    purchasePrice,
    sellPrice,
    stock,
    warehouseStock,
    fridgeStock,
    packageUnit,
    unitsPerPackage,
    minStockAlert,
    unit,
    barcode,
  } = req.body;

  if (!name || !sellPrice) {
    res.status(400).json({ error: 'نام کالا و قیمت فروش الزامی است' });
    return;
  }

  const db = loadDatabase();
  const numWarehouse = Number(warehouseStock) || 0;
  const numFridge = Number(fridgeStock) || 0;
  const numExplicitStock = Number(stock);
  const finalStock = !isNaN(numExplicitStock) && numExplicitStock > 0
    ? numExplicitStock
    : Math.max(0, numWarehouse + numFridge);

  const newProduct: Product = {
    id: `prod_${Date.now()}`,
    name: name.trim(),
    category: category?.trim() || 'سایر',
    purchasePrice: Number(purchasePrice) || 0,
    sellPrice: Number(sellPrice) || 0,
    stock: finalStock,
    warehouseStock: numWarehouse,
    fridgeStock: numFridge,
    packageUnit: packageUnit?.trim() || 'باکس',
    unitsPerPackage: Number(unitsPerPackage) || 24,
    minStockAlert: Number(minStockAlert) || 5,
    unit: unit?.trim() || 'عدد',
    barcode: barcode?.trim(),
    createdAt: new Date().toISOString(),
  };

  db.products.push(newProduct);
  logAudit(db, 'product', newProduct.id, 'create', `ثبت کالای بوفه: ${newProduct.name} (انبار: ${numWarehouse}، یخچال: ${numFridge})`);
  saveDatabase(db);
  res.status(201).json(newProduct);
});

app.put('/api/buffet/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    category,
    purchasePrice,
    sellPrice,
    stock,
    warehouseStock,
    fridgeStock,
    packageUnit,
    unitsPerPackage,
    minStockAlert,
    unit,
    barcode,
  } = req.body;

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
  if (warehouseStock !== undefined) prod.warehouseStock = Math.max(0, Number(warehouseStock) || 0);
  if (fridgeStock !== undefined) prod.fridgeStock = Math.max(0, Number(fridgeStock) || 0);

  // If warehouseStock or fridgeStock changed, automatically sync total stock
  if (warehouseStock !== undefined || fridgeStock !== undefined) {
    prod.stock = (prod.warehouseStock || 0) + (prod.fridgeStock || 0);
  } else if (stock !== undefined) {
    prod.stock = Math.max(0, Number(stock) || 0);
  }

  if (packageUnit !== undefined) prod.packageUnit = packageUnit.trim();
  if (unitsPerPackage !== undefined) prod.unitsPerPackage = Math.max(1, Number(unitsPerPackage) || 1);
  if (minStockAlert !== undefined) prod.minStockAlert = Number(minStockAlert);
  if (unit !== undefined) prod.unit = unit.trim();
  if (barcode !== undefined) prod.barcode = barcode.trim();

  logAudit(db, 'product', id, 'update', `ویرایش کالا: ${prod.name} (موجودی: ${prod.stock} - انبار: ${prod.warehouseStock}، یخچال: ${prod.fridgeStock})`);
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

// Helper function for deducting stock: priority to fridgeStock, then warehouseStock
function deductProductStock(
  prod: Product,
  qty: number
): { deductedFromFridge: number; deductedFromWarehouse: number } {
  // Ensure fields exist
  if (typeof prod.warehouseStock !== 'number' || isNaN(prod.warehouseStock)) {
    prod.warehouseStock = Math.max(0, prod.stock || 0);
  }
  if (typeof prod.fridgeStock !== 'number' || isNaN(prod.fridgeStock)) {
    prod.fridgeStock = 0;
  }

  const fridgeDeduct = Math.min(prod.fridgeStock, qty);
  const remaining = qty - fridgeDeduct;
  const warehouseDeduct = Math.min(prod.warehouseStock, remaining);

  prod.fridgeStock = Math.max(0, prod.fridgeStock - fridgeDeduct);
  prod.warehouseStock = Math.max(0, prod.warehouseStock - warehouseDeduct);
  prod.stock = Math.max(0, prod.fridgeStock + prod.warehouseStock);

  return { deductedFromFridge: fridgeDeduct, deductedFromWarehouse: warehouseDeduct };
}

// Helper function for restoring product stock back to warehouse/fridge
function restoreProductStock(
  prod: Product,
  qty: number,
  exactDeductions?: { deductedFromFridge?: number; deductedFromWarehouse?: number }
): void {
  if (typeof prod.warehouseStock !== 'number' || isNaN(prod.warehouseStock)) {
    prod.warehouseStock = Math.max(0, prod.stock || 0);
  }
  if (typeof prod.fridgeStock !== 'number' || isNaN(prod.fridgeStock)) {
    prod.fridgeStock = 0;
  }
  if (
    exactDeductions &&
    (exactDeductions.deductedFromFridge !== undefined || exactDeductions.deductedFromWarehouse !== undefined)
  ) {
    const fromFridge = Math.max(0, Number(exactDeductions.deductedFromFridge) || 0);
    const fromWarehouse = Math.max(0, Number(exactDeductions.deductedFromWarehouse) || 0);
    prod.fridgeStock += fromFridge;
    prod.warehouseStock += fromWarehouse;
  } else {
    // Priority to fridgeStock (restoring immediate sales items), preserving warehouse stock
    prod.fridgeStock += qty;
  }
  prod.stock = Math.max(0, prod.fridgeStock + prod.warehouseStock);
}

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
      res.status(400).json({ error: `موجودی کل کالای "${prod.name}" کافی نیست (موجودی فعلی: ${prod.stock} - یخچال: ${prod.fridgeStock || 0}، انبار: ${prod.warehouseStock || 0})` });
      return;
    }

    const { deductedFromFridge, deductedFromWarehouse } = deductProductStock(prod, qty);

    const unitPrice = Number(item.unitPrice) || prod.sellPrice;
    const itemTotal = unitPrice * qty;
    totalAmount += itemTotal;

    receiptItems.push({
      productId: prod.id,
      productName: prod.name,
      quantity: qty,
      unitPrice,
      totalPrice: itemTotal,
      deductedFromFridge,
      deductedFromWarehouse,
    });

    const deductDetail = deductedFromFridge > 0 && deductedFromWarehouse > 0
      ? ` (${deductedFromFridge} از یخچال + ${deductedFromWarehouse} از انبار)`
      : deductedFromFridge > 0
      ? ` (از یخچال)`
      : ` (از انبار)`;

    db.inventoryLogs.unshift({
      id: `inv_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      productId: prod.id,
      productName: prod.name,
      type: 'sale_deduction',
      quantity: qty,
      costPerUnit: prod.purchasePrice,
      sourceLocation: deductedFromFridge > 0 && deductedFromWarehouse > 0 ? 'both' : deductedFromFridge > 0 ? 'fridge' : 'warehouse',
      reason: `فروش مستقیم بوفه${deductDetail}`,
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

// Restock / Wholesale purchase with destination options (warehouse, fridge, or split)
app.post('/api/buffet/restock', (req: Request, res: Response) => {
  const {
    productId,
    quantity,
    costPerUnit,
    accountId,
    date,
    jalaliDate,
    destination,
    fridgeQuantity,
    warehouseQuantity,
    isPackageMode,
    packageCount,
  } = req.body;

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

  if (typeof prod.warehouseStock !== 'number') prod.warehouseStock = Math.max(0, prod.stock || 0);
  if (typeof prod.fridgeStock !== 'number') prod.fridgeStock = 0;

  // Destination distribution
  let toFridge = 0;
  let toWarehouse = 0;

  if (destination === 'fridge') {
    toFridge = numQty;
    toWarehouse = 0;
  } else if (destination === 'split') {
    const fQty = Math.max(0, Number(fridgeQuantity) || 0);
    const wQty = Math.max(0, Number(warehouseQuantity) || 0);
    if (fQty + wQty !== numQty) {
      toFridge = Math.min(numQty, fQty);
      toWarehouse = Math.max(0, numQty - toFridge);
    } else {
      toFridge = fQty;
      toWarehouse = wQty;
    }
  } else {
    // Default: 'warehouse' (انبار مرکزی)
    toWarehouse = numQty;
    toFridge = 0;
  }

  prod.warehouseStock += toWarehouse;
  prod.fridgeStock += toFridge;
  prod.stock = prod.warehouseStock + prod.fridgeStock;

  if (numCost > 0) prod.purchasePrice = numCost;

  const totalExpense = (numCost || prod.purchasePrice) * numQty;

  let acc: Account | undefined;
  if (accountId) {
    acc = db.accounts.find((a) => a.id === accountId);
    if (acc) acc.balance -= totalExpense;
  }

  const nowIso = new Date().toISOString();
  const restockCat = getCategoryForSection(db, 'expense', 'buffet_restock', ['بوفه', 'خرید']);
  const packageNote = isPackageMode && packageCount
    ? ` [خرید ${packageCount} ${prod.packageUnit || 'باکس'}]`
    : '';
  const distNote = toFridge > 0 && toWarehouse > 0
    ? ` (${toFridge} در یخچال + ${toWarehouse} در انبار مرکزی)`
    : toFridge > 0
    ? ` (چیدمان مستقیم در یخچال)`
    : ` (تخلیه در انبار مرکزی)`;

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
    description: `خرید و شارژ ${prod.name} (${numQty} ${prod.unit})${packageNote}${distNote}`,
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
    targetLocation: toFridge > 0 && toWarehouse === 0 ? 'fridge' : toWarehouse > 0 && toFridge === 0 ? 'warehouse' : undefined,
    reason: `شارژ موجودی${packageNote}${distNote}`,
    transactionId: tx.id,
    date: date || nowIso,
    createdAt: nowIso,
  });

  logAudit(
    db,
    'product',
    prod.id,
    'update',
    `شارژ ${prod.name}: ${numQty} عدد (انبار: +${toWarehouse}، یخچال: +${toFridge})${packageNote}`
  );
  saveDatabase(db);

  res.status(201).json({ success: true, product: prod, transaction: tx });
});

// Transfer from Warehouse to Fridge (شارژ سریع یخچال بوفه)
app.post('/api/buffet/transfer-to-fridge', (req: Request, res: Response) => {
  const { productId, quantity, date, jalaliDate, note } = req.body;
  const numQty = Number(quantity);
  if (!productId || isNaN(numQty) || numQty <= 0) {
    res.status(400).json({ error: 'تعداد انتقال نامعتبر است' });
    return;
  }

  const db = loadDatabase();
  const prod = db.products.find((p) => p.id === productId);
  if (!prod) {
    res.status(404).json({ error: 'کالا یافت نشد' });
    return;
  }

  if (typeof prod.warehouseStock !== 'number') prod.warehouseStock = Math.max(0, prod.stock || 0);
  if (typeof prod.fridgeStock !== 'number') prod.fridgeStock = 0;

  if (prod.warehouseStock < numQty) {
    res.status(400).json({
      error: `موجودی انبار مرکزی برای انتقال کافی نیست (موجودی انبار: ${prod.warehouseStock} ${prod.unit})`,
    });
    return;
  }

  prod.warehouseStock -= numQty;
  prod.fridgeStock += numQty;
  prod.stock = prod.warehouseStock + prod.fridgeStock;

  const nowIso = new Date().toISOString();
  db.inventoryLogs.unshift({
    id: `inv_trf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    productId: prod.id,
    productName: prod.name,
    type: 'fridge_transfer',
    quantity: numQty,
    costPerUnit: prod.purchasePrice,
    sourceLocation: 'warehouse',
    targetLocation: 'fridge',
    reason: note || `انتقال ${numQty} ${prod.unit} از انبار مرکزی به یخچال/پیشخوان فروش`,
    date: date || nowIso,
    createdAt: nowIso,
  });

  logAudit(
    db,
    'product',
    prod.id,
    'update',
    `انتقال به یخچال: ${numQty} ${prod.unit} از ${prod.name} (مانده انبار: ${prod.warehouseStock}، یخچال: ${prod.fridgeStock})`
  );
  saveDatabase(db);

  res.json({ success: true, product: prod });
});

// Waste (with location support: warehouse, fridge, or overall)
app.post('/api/buffet/waste', (req: Request, res: Response) => {
  const { productId, quantity, reason, location } = req.body;
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

  if (typeof prod.warehouseStock !== 'number') prod.warehouseStock = Math.max(0, prod.stock || 0);
  if (typeof prod.fridgeStock !== 'number') prod.fridgeStock = 0;

  if (location === 'fridge') {
    if (prod.fridgeStock < numQty) {
      res.status(400).json({ error: `تعداد ضایعات از موجودی یخچال (${prod.fridgeStock}) بیشتر است` });
      return;
    }
    prod.fridgeStock -= numQty;
  } else if (location === 'warehouse') {
    if (prod.warehouseStock < numQty) {
      res.status(400).json({ error: `تعداد ضایعات از موجودی انبار (${prod.warehouseStock}) بیشتر است` });
      return;
    }
    prod.warehouseStock -= numQty;
  } else {
    // Default: prioritize fridge, then warehouse
    if (prod.stock < numQty) {
      res.status(400).json({ error: 'تعداد ضایعات از کل موجودی بیشتر است' });
      return;
    }
    deductProductStock(prod, numQty);
  }

  prod.stock = Math.max(0, prod.warehouseStock + prod.fridgeStock);
  const nowIso = new Date().toISOString();

  db.inventoryLogs.unshift({
    id: `inv_wst_${Date.now()}`,
    productId: prod.id,
    productName: prod.name,
    type: 'waste',
    quantity: numQty,
    costPerUnit: prod.purchasePrice,
    sourceLocation: location || 'fridge',
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

      const ctxUser = authContextStorage.getStore();
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
        openedByUserId: resv.createdByUserId || ctxUser?.id,
        openedByName: resv.createdByName || ctxUser?.fullName || ctxUser?.username || 'سیستم (رزرو)',
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

// Helper to auto-create customer in db.persons whenever manually entered or entered by SmartLaunch ID
function findOrCreateCustomer(
  db: DatabaseSchema,
  name?: string,
  phone?: string,
  smartLaunchId?: string
): Person | undefined {
  const cleanSmartLaunch = smartLaunchId?.trim() || undefined;
  const cleanName = name?.trim() || (cleanSmartLaunch ? `کاربر ${cleanSmartLaunch}` : undefined);
  const cleanPhone = phone?.trim() || undefined;

  if (!cleanName && !cleanSmartLaunch && !cleanPhone) return undefined;

  const existing = db.persons.find((p) => {
    const slMatch = cleanSmartLaunch && p.smartLaunchId && p.smartLaunchId.trim().toLowerCase() === cleanSmartLaunch.toLowerCase();
    const nameMatch = cleanName && p.name.trim().toLowerCase() === cleanName.toLowerCase();
    const phoneMatch = cleanPhone && p.phone && p.phone.trim() === cleanPhone;
    return slMatch || nameMatch || phoneMatch;
  });

  if (existing) {
    if (cleanSmartLaunch && !existing.smartLaunchId) {
      existing.smartLaunchId = cleanSmartLaunch;
    }
    if (cleanPhone && !existing.phone) {
      existing.phone = cleanPhone;
    }
    return existing;
  }

  const newPerson: Person = {
    id: `per_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: cleanName || `کاربر ${cleanSmartLaunch}`,
    phone: cleanPhone,
    smartLaunchId: cleanSmartLaunch,
    type: 'customer',
    currentBalance: 0,
    maxCreditLimit: 500000,
    createdAt: new Date().toISOString(),
  };

  db.persons.unshift(newPerson);
  logAudit(
    db,
    'person',
    newPerson.id,
    'create',
    `ثبت خودکار مشتری جدید: ${newPerson.name}${cleanSmartLaunch ? ` [آیدی: ${cleanSmartLaunch}]` : ''}${cleanPhone ? ` (${cleanPhone})` : ''}`
  );
  return newPerson;
}

// ======================== OPEN TABS / GAMING SESSIONS ========================

// Open running orders for gamers, tables, consoles, VIP rooms
app.get('/api/tabs', (_req: Request, res: Response) => {
  const db = loadDatabase();
  checkAndAutoOpenDueReservations(db);
  res.json({ tabs: db.openTabs || [] });
});

app.post('/api/tabs', (req: AuthedRequest, res: Response) => {
  const { title, personId, customerName, customerPhone, notes } = req.body;
  if (!title) {
    res.status(400).json({ error: 'نام میز یا اتاق الزامی است' });
    return;
  }
  const db = loadDatabase();
  let person = personId ? db.persons.find((p) => p.id === personId) : undefined;
  if (!person && customerName) {
    if (customerPhone || req.body.smartLaunchId) {
      person = findOrCreateCustomer(db, customerName, customerPhone, req.body.smartLaunchId);
    }
  }
  const nowIso = new Date().toISOString();

  const newTab: OpenTab = {
    id: `tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    title: title.trim(),
    personId: person?.id,
    personName: person?.name || (customerName ? customerName.trim() : undefined),
    items: [],
    totalAmount: 0,
    notes: notes?.trim(),
    startedAt: nowIso,
    status: 'open',
    openedByUserId: req.authUser?.id,
    openedByName: req.authUser?.fullName || req.authUser?.username,
    createdAt: nowIso,
  };

  db.openTabs.unshift(newTab);
  logAudit(db, 'tab', newTab.id, 'create', `باز کردن حساب میز: ${newTab.title}${newTab.personName ? ` برای ${newTab.personName}` : ''}`);
  saveDatabase(db);
  res.status(201).json({ ...newTab, persons: db.persons });
});

// Edit or update an open tab (title, notes, person, gaming timer)
app.put('/api/tabs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    title,
    personId,
    customerName,
    customerPhone,
    notes,
    items,
    hourlyRate,
    timerStartedAt,
    isTimerActive,
    timerStoppedAt,
    timerCalculatedCost,
  } = req.body;
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
    if (!person && customerName && customerPhone) {
      person = findOrCreateCustomer(db, customerName, customerPhone);
    }
    tab.personId = person?.id;
    tab.personName = person?.name || (customerName ? customerName.trim() : undefined);
  }
  if (items && Array.isArray(items)) {
    tab.items = items;
    tab.totalAmount = items.reduce((sum: number, it: OpenTabItem) => sum + (it.totalPrice || it.unitPrice * it.quantity), 0);
  }
  if (hourlyRate !== undefined) tab.hourlyRate = Number(hourlyRate);
  if (timerStartedAt !== undefined) tab.timerStartedAt = timerStartedAt;
  if (isTimerActive !== undefined) tab.isTimerActive = isTimerActive;
  if (timerStoppedAt !== undefined) tab.timerStoppedAt = timerStoppedAt;
  if (timerCalculatedCost !== undefined) tab.timerCalculatedCost = Number(timerCalculatedCost);

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
    if (!prod) {
      res.status(404).json({ error: 'کالای مورد نظر در سیستم یافت نشد' });
      return;
    }
    const currentOnTab = tab.items
      .filter((it) => it.productId === productId)
      .reduce((sum, it) => sum + it.quantity, 0);
    if (currentOnTab + qty > prod.stock) {
      res.status(400).json({
        error: `موجودی کالای «${prod.name}» کافی نیست. موجودی انبار و یخچال: ${prod.stock} عدد (در حال حاضر ${currentOnTab} عدد روی میز قرار دارد)`
      });
      return;
    }
    finalName = prod.name;
    finalUnitPrice = prod.sellPrice;
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

// Helper function: Execute full table checkout with stock deduction, financial transaction, and optional SmartLaunch timer closure
function executeTabCheckout(
  db: DatabaseSchema,
  tab: OpenTab,
  options: {
    paymentMethod?: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
    accountId?: string;
    personId?: string;
    customerName?: string;
    customerPhone?: string;
    smartLaunchId?: string;
    walletAmount?: number;
    cashOrPosAmount?: number;
    date?: string;
    jalaliDate?: string;
    categoryId?: string;
    settleScope?: 'all' | 'buffet' | 'custom_amount';
    customAmount?: number;
    smartLaunchSettlement?: {
      amount: number;
      durationMinutes: number;
      hourlyRate: number;
      smartLaunchId?: string;
    };
  }
): { transaction: Transaction; tab: OpenTab } {
  const {
    paymentMethod = 'pos',
    accountId,
    personId,
    customerName,
    customerPhone,
    smartLaunchId,
    date,
    jalaliDate,
    categoryId,
    settleScope = 'all',
    customAmount,
    smartLaunchSettlement,
  } = options;

  const nowIso = new Date().toISOString();
  const receiptItems: ReceiptItem[] = [];

  let itemsToSettle: OpenTabItem[] = [];
  let totalAmount = 0;
  let depositDeduction = 0;

  if (settleScope === 'buffet') {
    // Settle only buffet / product items on the table
    itemsToSettle = tab.items.filter((it) => !!it.productId);
    if (itemsToSettle.length === 0) {
      itemsToSettle = [...tab.items]; // fallback if no specific productId
    }
    totalAmount = itemsToSettle.reduce((sum, it) => sum + it.totalPrice, 0);
  } else if (settleScope === 'custom_amount') {
    totalAmount = Math.max(0, Number(customAmount) || 0);
  } else {
    // Settle all
    itemsToSettle = [...tab.items];
    totalAmount = tab.totalAmount;
    depositDeduction = Number(tab.depositAmount) || 0;
  }

  // Deduct stock for inventory products being settled
  if (itemsToSettle.length > 0) {
    for (const item of itemsToSettle) {
      let deductedFromFridge = 0;
      let deductedFromWarehouse = 0;
      if (item.productId) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) {
          const res = deductProductStock(prod, item.quantity);
          deductedFromFridge = res.deductedFromFridge;
          deductedFromWarehouse = res.deductedFromWarehouse;
          item.deductedFromFridge = deductedFromFridge;
          item.deductedFromWarehouse = deductedFromWarehouse;

          const detail = deductedFromFridge > 0 && deductedFromWarehouse > 0
            ? ` (${deductedFromFridge} از یخچال + ${deductedFromWarehouse} از انبار)`
            : deductedFromFridge > 0
            ? ` (از یخچال)`
            : ` (از انبار)`;

          db.inventoryLogs.unshift({
            id: `inv_tab_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            productId: prod.id,
            productName: prod.name,
            type: 'sale_deduction',
            quantity: item.quantity,
            costPerUnit: prod.purchasePrice,
            sourceLocation: deductedFromFridge > 0 && deductedFromWarehouse > 0 ? 'both' : deductedFromFridge > 0 ? 'fridge' : 'warehouse',
            reason: `تسویه ${settleScope === 'buffet' ? 'بوفه ' : ''}میز: ${tab.title}${detail}`,
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
        deductedFromFridge,
        deductedFromWarehouse,
      });
    }
  }

  const finalPayable = Math.max(0, totalAmount - depositDeduction);

  let walletDeducted = 0;
  let cashOrPosPaid = 0;
  let isCredit = false;

  if (paymentMethod === 'wallet') {
    const wAmt = Number(options.walletAmount);
    walletDeducted = !isNaN(wAmt) && wAmt > 0 ? Math.min(wAmt, finalPayable) : finalPayable;
    cashOrPosPaid = Math.max(0, finalPayable - walletDeducted);
  } else if (paymentMethod === 'split') {
    walletDeducted = Math.min(Number(options.walletAmount) || 0, finalPayable);
    cashOrPosPaid = Math.max(0, finalPayable - walletDeducted);
  } else if (paymentMethod === 'credit') {
    isCredit = true;
  } else {
    cashOrPosPaid = finalPayable;
  }

  // Account update (only add the net cash/pos portion since deposit was already received)
  let targetAccount: Account | undefined;
  if (cashOrPosPaid > 0) {
    if (accountId) {
      targetAccount = db.accounts.find((a) => a.id === accountId);
    }
    if (!targetAccount) {
      targetAccount =
        db.accounts.find((a) => a.isDefault && (a.type === 'pos' || a.type === 'bank')) ||
        db.accounts.find((a) => a.type === 'pos' || a.type === 'bank' || a.type === 'cash') ||
        db.accounts[0];
    }
    if (targetAccount) {
      targetAccount.balance += cashOrPosPaid;
    }
  }

  // Person update (Wallet deduction or credit debt)
  let targetPerson: Person | undefined;
  const finalPersonId = personId || tab.personId;
  if (finalPersonId) {
    targetPerson = db.persons.find((p) => p.id === finalPersonId);
  }
  if (!targetPerson && (customerName || smartLaunchId)) {
    targetPerson = findOrCreateCustomer(db, customerName, customerPhone, smartLaunchId);
  } else if (targetPerson && smartLaunchId && !targetPerson.smartLaunchId) {
    targetPerson.smartLaunchId = smartLaunchId.trim();
  }

  if (targetPerson) {
    if (walletDeducted > 0) {
      targetPerson.currentBalance += walletDeducted;
    }
    if (isCredit && finalPayable > 0) {
      targetPerson.currentBalance += finalPayable;
    }
  }

  let paymentNote = '';
  if (walletDeducted > 0 && cashOrPosPaid > 0) {
    paymentNote = ` [ترکیبی: کیف پول + واریزی]`;
  } else if (walletDeducted > 0) {
    paymentNote = ` [کیف پول]`;
  } else if (isCredit) {
    paymentNote = ` [نسیه${targetPerson?.smartLaunchId ? ` - آیدی: ${targetPerson.smartLaunchId}` : ''}]`;
  } else {
    paymentNote = '';
  }

  // Calculate buffet portion vs gaming portion for intelligent separation
  const buffetItems = itemsToSettle.filter((it) => !!it.productId);
  const buffetItemsTotal = buffetItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
  const gamingItems = itemsToSettle.filter((it) => !it.productId);
  const gamingItemsTotal = gamingItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
  const gamingTimerTotal =
    (Number(tab.timerCalculatedCost) || 0) +
    (smartLaunchSettlement ? Number(smartLaunchSettlement.amount) || 0 : 0);
  let rawGamingTotal = gamingItemsTotal + gamingTimerTotal;

  if (rawGamingTotal === 0 && buffetItemsTotal === 0 && totalAmount > 0) {
    rawGamingTotal = totalAmount;
  }

  // Deduct deposit from gaming portion first, then buffet
  let netGaming = rawGamingTotal;
  let netBuffet = buffetItemsTotal;
  if (depositDeduction > 0) {
    const deductFromGaming = Math.min(rawGamingTotal, depositDeduction);
    netGaming = Math.max(0, rawGamingTotal - deductFromGaming);
    const remDeposit = depositDeduction - deductFromGaming;
    netBuffet = Math.max(0, buffetItemsTotal - remDeposit);
  }

  // Determine Buffet Category
  const buffetCat =
    db.categories.find((c) => c.type === 'income' && (c.id === 'cat_buffet_inc' || c.section === 'buffet')) ||
    db.categories.find((c) => c.type === 'income' && (c.name.includes('بوفه') || c.name.includes('کافه'))) ||
    db.categories.find((c) => c.type === 'income');

  // Determine Gaming Category
  const titleLower = (tab.title || '').toLowerCase();
  let gamingCat: Category | undefined;
  if (titleLower.includes('pc') || titleLower.includes('سیستم') || titleLower.includes('کامپیوتر')) {
    gamingCat = db.categories.find((c) => c.type === 'income' && (c.id === 'cat_pc' || c.name.toLowerCase().includes('pc') || c.name.includes('سیستم')));
  } else if (titleLower.includes('vip') || titleLower.includes('وی آی پی') || titleLower.includes('اتاق')) {
    gamingCat = db.categories.find((c) => c.type === 'income' && (c.id === 'cat_vip' || c.name.toLowerCase().includes('vip') || c.name.includes('وی آی پی')));
  } else if (titleLower.includes('ps4') || titleLower.includes('پی اس ۴')) {
    gamingCat = db.categories.find((c) => c.type === 'income' && c.name.toLowerCase().includes('ps4'));
  } else if (titleLower.includes('بیلیارد') || titleLower.includes('billiard')) {
    gamingCat = db.categories.find((c) => c.type === 'income' && (c.id === 'cat_billiard' || c.name.includes('بیلیارد')));
  }
  if (!gamingCat) {
    gamingCat =
      db.categories.find((c) => c.type === 'income' && (c.id === 'cat_ps5' || c.name.toLowerCase().includes('ps5') || c.name.includes('کنسول'))) ||
      db.categories.find((c) => c.type === 'income' && c.section === 'gaming') ||
      db.categories[0];
  }

  const createdTransactions: Transaction[] = [];

  if (settleScope === 'all' && netGaming > 0 && netBuffet > 0) {
    // Intelligent Separation: Split gaming revenue and buffet revenue into separate transactions!
    const txGaming: Transaction = {
      id: `tx_tab_${Date.now()}_game`,
      type: 'income',
      amount: netGaming,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      categoryId: gamingCat?.id || 'cat_ps5',
      categoryName: gamingCat?.name || 'کرایه دستگاه',
      toAccountId: targetAccount?.id,
      toAccountName: targetAccount?.name,
      personId: targetPerson?.id,
      personName: targetPerson?.name,
      description: `تسویه تایم/دستگاه ${tab.title}${targetPerson ? ` (${targetPerson.name})` : ''}${paymentNote}`,
      paymentMethod: paymentMethod,
      isCredit: isCredit,
      tabId: tab.id,
      createdBy: 'اپراتور',
      createdAt: nowIso,
    };

    const buffetReceiptItems = receiptItems.filter((i) => !!i.productId);
    const txBuffet: Transaction = {
      id: `tx_tab_${Date.now()}_buf`,
      type: 'income',
      amount: netBuffet,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      categoryId: buffetCat?.id || 'cat_buffet_inc',
      categoryName: buffetCat?.name || 'فروش بوفه و کافه',
      toAccountId: targetAccount?.id,
      toAccountName: targetAccount?.name,
      personId: targetPerson?.id,
      personName: targetPerson?.name,
      description: `تسویه سفارشات بوفه ${tab.title} (${buffetReceiptItems.map((i) => `${i.productName} × ${i.quantity}`).join(' + ')})${targetPerson ? ` (${targetPerson.name})` : ''}${paymentNote}`,
      paymentMethod: paymentMethod,
      isCredit: isCredit,
      tabId: tab.id,
      receiptItems: buffetReceiptItems,
      createdBy: 'اپراتور',
      createdAt: nowIso,
    };

    db.transactions.unshift(txBuffet);
    db.transactions.unshift(txGaming);
    createdTransactions.push(txGaming, txBuffet);
  } else {
    // Single transaction (only buffet, only gaming, or custom scope)
    const isBuffetOnly = (netBuffet > 0 && netGaming === 0) || settleScope === 'buffet';
    const chosenCat = isBuffetOnly ? buffetCat : gamingCat;

    let desc = '';
    if (settleScope === 'buffet') {
      desc = `تسویه بوفه ${tab.title} (${itemsToSettle.map((i) => `${i.productName} × ${i.quantity}`).join(' + ')})${paymentNote}`;
    } else if (settleScope === 'custom_amount') {
      desc = `تسویه علی‌الحساب مبلغ ${finalPayable.toLocaleString('fa-IR')} ت از ${tab.title}${paymentNote}`;
    } else {
      const descSuffix = depositDeduction > 0
        ? ` (کل فاکتور: ${totalAmount.toLocaleString('fa-IR')} ت - کسر بیعانه: ${depositDeduction.toLocaleString('fa-IR')} ت = پرداختی: ${finalPayable.toLocaleString('fa-IR')} ت)`
        : '';
      desc = `تسویه ${tab.title}${itemsToSettle.length > 0 ? ` (${itemsToSettle.map((i) => `${i.productName} × ${i.quantity}`).join(' + ')})` : ''}${descSuffix}${paymentNote}`;
    }

    const tx: Transaction = {
      id: `tx_tab_${Date.now()}`,
      type: 'income',
      amount: finalPayable,
      date: date || nowIso,
      jalaliDate: jalaliDate || '',
      categoryId: chosenCat?.id || 'cat_ps5',
      categoryName: chosenCat?.name || 'درآمد گیم‌نت',
      toAccountId: targetAccount?.id,
      toAccountName: targetAccount?.name,
      personId: targetPerson?.id,
      personName: targetPerson?.name,
      description: desc,
      paymentMethod: paymentMethod,
      isCredit: isCredit,
      tabId: tab.id,
      receiptItems: itemsToSettle.length > 0 ? receiptItems : undefined,
      createdBy: 'اپراتور',
      createdAt: nowIso,
    };

    db.transactions.unshift(tx);
    createdTransactions.push(tx);
  }

  const tx = createdTransactions[0];

  // Tab updates based on scope
  if (settleScope === 'buffet') {
    const settledIds = new Set(itemsToSettle.map((it) => it.id));
    tab.items = tab.items.filter((it) => !settledIds.has(it.id));
    tab.totalAmount = tab.items.reduce((sum, it) => sum + (it.totalPrice || 0), 0);
    tab.updatedAt = nowIso;
    // Tab remains open for gaming timer!
  } else if (settleScope === 'custom_amount') {
    tab.paidAmount = (tab.paidAmount || 0) + finalPayable;
    tab.updatedAt = nowIso;
    // Tab remains open!
  } else {
    // Close tab and link transaction id & settlement details
    tab.status = 'closed';
    tab.closedAt = nowIso;
    tab.checkoutTransactionId = tx.id;
    tab.checkoutPaymentMethod = paymentMethod;
    tab.checkoutAccountName = targetAccount?.name;
    tab.updatedAt = nowIso;

    // Handle SmartLaunch timer closure
    if (smartLaunchSettlement) {
      tab.isTimerActive = false;
      tab.timerStoppedAt = nowIso;
      tab.smartLaunchSettled = {
        settledAt: nowIso,
        durationMinutes: Number(smartLaunchSettlement.durationMinutes) || 0,
        hourlyRate: Number(smartLaunchSettlement.hourlyRate) || 0,
        amount: Number(smartLaunchSettlement.amount) || 0,
        smartLaunchId: smartLaunchSettlement.smartLaunchId ? String(smartLaunchSettlement.smartLaunchId).trim() : undefined,
        customerName: customerName || tab.personName || undefined,
      };
      if (smartLaunchSettlement.smartLaunchId && targetPerson) {
        targetPerson.smartLaunchId = smartLaunchSettlement.smartLaunchId.trim();
      }
    } else if (tab.isTimerActive) {
      tab.isTimerActive = false;
      tab.timerStoppedAt = nowIso;
    }
  }

  logAudit(
    db,
    'tab',
    tab.id,
    'checkout',
    `${settleScope === 'buffet' ? 'تسویه بوفه' : settleScope === 'custom_amount' ? 'تسویه علی‌الحساب' : 'تسویه کامل'} میز ${tab.title}: مبلغ ${finalPayable} ت (${createdTransactions.map((t) => t.categoryName).filter(Boolean).join(' + ')})`
  );

  return { transaction: tx, tab };
}

// Final Checkout / Settlement of open tab
app.post('/api/tabs/:id/checkout', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const tab = db.openTabs.find((t) => t.id === id);
  if (!tab) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  const { settleScope = 'all', customAmount } = req.body;
  if (settleScope === 'all' && tab.items.length === 0 && !tab.isTimerActive && (!tab.timerCalculatedCost || tab.timerCalculatedCost <= 0)) {
    res.status(400).json({ error: 'حساب این میز خالی است' });
    return;
  }
  if (settleScope === 'buffet' && tab.items.length === 0) {
    res.status(400).json({ error: 'هیچ آیتم بوفه‌ای برای تسویه روی این میز وجود ندارد' });
    return;
  }
  if (settleScope === 'custom_amount' && (!customAmount || Number(customAmount) <= 0)) {
    res.status(400).json({ error: 'لطفاً مبلغ معتبری برای تسویه وارد کنید' });
    return;
  }

  const { transaction } = executeTabCheckout(db, tab, { ...req.body, categoryId: req.body.categoryId });
  saveDatabase(db);

  res.json({
    success: true,
    transaction,
    tab,
    message: settleScope === 'buffet' ? 'اقلام بوفه با موفقیت تسویه شدند (میز باز ماند)' : 'تسویه با موفقیت انجام شد',
    persons: db.persons,
  });
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
  const newQty = quantity !== undefined ? Math.max(0, Number(quantity)) : Math.max(0, item.quantity + Number(delta));

  // Check available stock if quantity is being increased
  if (item.productId && newQty > item.quantity) {
    const prod = db.products.find((p) => p.id === item.productId);
    if (prod) {
      const otherOnTab = tab.items
        .filter((it) => it.id !== itemId && it.productId === item.productId)
        .reduce((sum, it) => sum + it.quantity, 0);
      if (otherOnTab + newQty > prod.stock) {
        res.status(400).json({
          error: `موجودی کالای «${prod.name}» کافی نیست. موجودی انبار و یخچال: ${prod.stock} عدد`
        });
        return;
      }
    }
  }

  item.quantity = newQty;
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

// Close table or stop gaming timer with SmartLaunch settlement
app.post('/api/tabs/:id/close-smartlaunch', (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    amount,
    durationMinutes,
    hourlyRate,
    smartLaunchId,
    customerName,
    personId,
    action, // 'close_tab' | 'stop_timer_only'
    paymentMethod,
    accountId,
    walletAmount,
    date,
    jalaliDate,
  } = req.body;

  const db = loadDatabase();
  const tab = db.openTabs.find((t) => t.id === id);
  if (!tab) {
    res.status(404).json({ error: 'میز یافت نشد' });
    return;
  }

  const nowIso = new Date().toISOString();

  // If customer has a smartLaunchId passed or updated, update the person
  const targetPersonId = personId || tab.personId;
  if (targetPersonId && smartLaunchId) {
    const person = db.persons.find((p) => p.id === targetPersonId);
    if (person && (!person.smartLaunchId || person.smartLaunchId !== smartLaunchId.trim())) {
      person.smartLaunchId = smartLaunchId.trim();
    }
  }

  if (action === 'stop_timer_only') {
    tab.isTimerActive = false;
    tab.timerStoppedAt = nowIso;
    tab.timerCalculatedCost = Number(amount) || 0;
    tab.updatedAt = nowIso;
    logAudit(
      db,
      'tab',
      id,
      'update',
      `توقف تایمر میز ${tab.title} جهت کسر ${(amount || 0).toLocaleString('fa-IR')} تومان از اسمارت‌لانچ`
    );
    saveDatabase(db);
    res.json({ success: true, tab, message: 'تایمر با موفقیت متوقف شد' });
    return;
  }

  // If table has ordered items, execute complete checkout for items (stock deduction, financial ledger, account update)
  let transaction: Transaction | undefined;
  if (tab.items.length > 0) {
    const result = executeTabCheckout(db, tab, {
      paymentMethod: paymentMethod || 'pos',
      accountId,
      personId: targetPersonId,
      customerName: customerName || tab.personName,
      walletAmount,
      date,
      jalaliDate,
      smartLaunchSettlement: {
        amount: Number(amount) || 0,
        durationMinutes: Number(durationMinutes) || 0,
        hourlyRate: Number(hourlyRate) || 0,
        smartLaunchId: smartLaunchId ? smartLaunchId.trim() : undefined,
      },
    });
    transaction = result.transaction;
  } else {
    // Only timer on this table, no buffet items
    tab.status = 'closed';
    tab.closedAt = nowIso;
    tab.isTimerActive = false;
    tab.timerStoppedAt = nowIso;
    tab.smartLaunchSettled = {
      settledAt: nowIso,
      durationMinutes: Number(durationMinutes) || 0,
      hourlyRate: Number(hourlyRate) || 0,
      amount: Number(amount) || 0,
      smartLaunchId: smartLaunchId ? smartLaunchId.trim() : undefined,
      customerName: customerName || tab.personName || undefined,
    };
    tab.updatedAt = nowIso;

    logAudit(
      db,
      'tab',
      id,
      'checkout',
      `بستن میز ${tab.title} خارج از دخل (تسویه اسمارت‌لانچ: ${(amount || 0).toLocaleString('fa-IR')} تومان${smartLaunchId ? ` - آیدی: ${smartLaunchId}` : ''})`
    );
  }

  saveDatabase(db);
  res.json({
    success: true,
    tab,
    transaction,
    persons: db.persons,
    message: tab.items.length > 0 ? 'اقلام میز در حسابداری تسویه و تایمر کسر شد' : 'میز با موفقیت بسته شد',
  });
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

  // 1. Find all previous checkout transactions linked to this desk (supports split gaming + buffet txs)
  const relatedTxs = db.transactions.filter(
    (t) =>
      (tab.checkoutTransactionId && t.id === tab.checkoutTransactionId) ||
      t.tabId === tab.id ||
      (t.id.startsWith('tx_tab_') && t.description.includes(tab.title))
  );

  let restoredAnyStock = false;

  if (relatedTxs.length > 0) {
    for (const oldTx of relatedTxs) {
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
              restoreProductStock(prod, item.quantity, {
                deductedFromFridge: item.deductedFromFridge,
                deductedFromWarehouse: item.deductedFromWarehouse,
              });
              restoredAnyStock = true;
              db.inventoryLogs.unshift({
                id: `inv_restore_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                productId: prod.id,
                productName: prod.name,
                type: 'manual_correction',
                quantity: item.quantity,
                costPerUnit: prod.purchasePrice,
                reason: `بازگشت به یخچال/انبار به علت بازگشایی و اصلاح میز: ${tab.title}`,
                date: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      }

      // Remove the old transaction
      const idx = db.transactions.indexOf(oldTx);
      if (idx !== -1) {
        db.transactions.splice(idx, 1);
      }
    }
  }

  // Fallback: If no receiptItems were in transactions or old transactions were missing
  if (!restoredAnyStock) {
    for (const item of tab.items) {
      if (item.productId) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) {
          restoreProductStock(prod, item.quantity, {
            deductedFromFridge: item.deductedFromFridge,
            deductedFromWarehouse: item.deductedFromWarehouse,
          });
          db.inventoryLogs.unshift({
            id: `inv_restore_fallback_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            productId: prod.id,
            productName: prod.name,
            type: 'manual_correction',
            quantity: item.quantity,
            costPerUnit: prod.purchasePrice,
            reason: `بازگشت به یخچال/انبار به علت بازگشایی میز: ${tab.title}`,
            date: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  tab.status = 'open';
  tab.closedAt = undefined;
  tab.checkoutTransactionId = undefined;
  tab.checkoutPaymentMethod = undefined;
  tab.checkoutAccountName = undefined;
  tab.smartLaunchSettled = undefined;
  tab.isTimerActive = false;
  tab.timerStartedAt = undefined;
  tab.timerStoppedAt = undefined;
  tab.timerCalculatedCost = undefined;
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
  let stockRestoredFromTx = false;

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

    // Restore stock from transaction's receiptItems
    if (oldTx.receiptItems && Array.isArray(oldTx.receiptItems)) {
      for (const item of oldTx.receiptItems) {
        if (item.productId) {
          const prod = db.products.find((p) => p.id === item.productId);
          if (prod) {
            restoreProductStock(prod, item.quantity, {
              deductedFromFridge: item.deductedFromFridge,
              deductedFromWarehouse: item.deductedFromWarehouse,
            });
            stockRestoredFromTx = true;
            db.inventoryLogs.unshift({
              id: `inv_restore_del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              productId: prod.id,
              productName: prod.name,
              type: 'manual_correction',
              quantity: item.quantity,
              costPerUnit: prod.purchasePrice,
              reason: `بازگشت به یخچال/انبار به علت حذف فاکتور / میز: ${deleted.title}`,
              date: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    // Remove the transaction from db
    const txIdx = db.transactions.indexOf(oldTx);
    if (txIdx !== -1) {
      db.transactions.splice(txIdx, 1);
    }
  }

  // 2. Restore any inventory items from the deleted tab ONLY if tab was closed/settled and not already restored from tx
  if (deleted.status === 'closed' && !stockRestoredFromTx) {
    for (const item of deleted.items || []) {
      if (item.productId) {
        const prod = db.products.find((p) => p.id === item.productId);
        if (prod) {
          restoreProductStock(prod, item.quantity, {
            deductedFromFridge: item.deductedFromFridge,
            deductedFromWarehouse: item.deductedFromWarehouse,
          });
          db.inventoryLogs.unshift({
            id: `inv_restore_del_fb_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            productId: prod.id,
            productName: prod.name,
            type: 'manual_correction',
            quantity: item.quantity,
            costPerUnit: prod.purchasePrice,
            reason: `بازگشت به یخچال/انبار به علت حذف فاکتور / میز: ${deleted.title}`,
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

app.post('/api/reservations', (req: AuthedRequest, res: Response) => {
  const {
    title,
    customerName,
    customerPhone,
    smartLaunchId,
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
    targetPerson = findOrCreateCustomer(db, customerName, customerPhone, smartLaunchId);
  } else if (smartLaunchId && !targetPerson.smartLaunchId) {
    targetPerson.smartLaunchId = smartLaunchId.trim();
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
      createdByUserId: req.authUser?.id,
      createdByName: req.authUser?.fullName || req.authUser?.username,
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
app.post('/api/reservations/:id/convert-to-tab', (req: AuthedRequest, res: Response) => {
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
    openedByUserId: req.authUser?.id || resv.createdByUserId,
    openedByName: req.authUser?.fullName || req.authUser?.username || resv.createdByName,
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
      paymentMethod: 'wallet_charge',
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
      paymentMethod: 'wallet_deduct',
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
          paymentMethod: 'wallet_charge',
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
          paymentMethod: 'wallet_deduct',
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

// Delete payroll record & safely roll back linked accounting transaction if still present
app.delete('/api/staff/payroll/:id', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_staff')) {
    res.status(403).json({ error: 'شما مجوز حذف فیش‌های حقوق پرسنل را ندارید' });
    return;
  }
  const { id } = req.params;
  const db = loadDatabase();
  const idx = db.payrollRecords.findIndex((p) => p.id === id);
  if (idx === -1) {
    res.status(404).json({ error: 'فیش حقوقی مورد نظر یافت نشد' });
    return;
  }

  const payroll = db.payrollRecords[idx];
  let refunded = false;

  if (payroll.transactionId) {
    const txIdx = db.transactions.findIndex((t) => t.id === payroll.transactionId);
    if (txIdx !== -1) {
      const tx = db.transactions[txIdx];
      if (tx.fromAccountId) {
        const acc = db.accounts.find((a) => a.id === tx.fromAccountId);
        if (acc) acc.balance += tx.amount;
      }
      db.transactions.splice(txIdx, 1);
      refunded = true;
    }
  }

  db.payrollRecords.splice(idx, 1);
  logAudit(
    db,
    'staff',
    payroll.staffId,
    'delete',
    refunded
      ? `حذف فیش پرداخت حقوق ${payroll.staffName} (${payroll.amount} تومان) و بازگشت مبلغ به حساب`
      : `حذف سابقه فیش حقوق ${payroll.staffName} (تراکنش مالی قبلاً حذف شده بود)`
  );
  saveDatabase(db);
  res.json({
    success: true,
    refunded,
    message: refunded
      ? 'فیش حقوقی و تراکنش مالی مرتبط حذف و مبلغ به حساب برگشت داده شد'
      : 'سابقه فیش حقوقی حذف شد (تراکنش مالی قبلاً از دفتر تراکنش‌ها حذف شده بود)',
  });
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
app.post('/api/checkout/unified', (req: AuthedRequest, res: Response) => {
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

    let deductedFromFridge = 0;
    let deductedFromWarehouse = 0;

    if (item.productId) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod) {
        const res = deductProductStock(prod, qty);
        deductedFromFridge = res.deductedFromFridge;
        deductedFromWarehouse = res.deductedFromWarehouse;
        const detail = deductedFromFridge > 0 && deductedFromWarehouse > 0
          ? ` (${deductedFromFridge} از یخچال + ${deductedFromWarehouse} از انبار)`
          : deductedFromFridge > 0
          ? ` (از یخچال)`
          : ` (از انبار)`;

        db.inventoryLogs.unshift({
          id: `inv_log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          productId: prod.id,
          productName: prod.name,
          type: 'sale_deduction',
          quantity: qty,
          costPerUnit: prod.purchasePrice,
          sourceLocation: deductedFromFridge > 0 && deductedFromWarehouse > 0 ? 'both' : deductedFromFridge > 0 ? 'fridge' : 'warehouse',
          reason: `فروش بوفه (تسویه درجا)${detail}`,
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
      deductedFromFridge,
      deductedFromWarehouse,
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
  if (!person && (req.body.customerName || req.body.newCustomerName || req.body.smartLaunchId)) {
    person = findOrCreateCustomer(
      db,
      req.body.customerName || req.body.newCustomerName,
      req.body.customerPhone || req.body.newCustomerPhone,
      req.body.smartLaunchId
    );
  } else if (person && req.body.smartLaunchId && !person.smartLaunchId) {
    person.smartLaunchId = req.body.smartLaunchId.trim();
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
    paymentNote = ` [نسیه${person?.smartLaunchId ? ` - آیدی: ${person.smartLaunchId}` : ''}]`;
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
      paymentMethod: paymentMethod,
      isCredit: paymentMethod === 'credit',
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
      openedByUserId: req.authUser?.id,
      openedByName: req.authUser?.fullName || req.authUser?.username,
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

app.put('/api/settings', (req: AuthedRequest, res: Response) => {
  const keys = Object.keys(req.body || {});
  const isOnlyBuffetCats = keys.length > 0 && keys.every((k) => k === 'buffetCategories');
  if (isOnlyBuffetCats) {
    if (!hasPerm(req.authUser, 'manage_settings', 'manage_buffet')) {
      res.status(403).json({ error: 'شما مجوز ویرایش دسته‌بندی بوفه را ندارید' });
      return;
    }
  } else if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ error: 'شما مجوز تغییر تنظیمات سیستم را ندارید' });
    return;
  }
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
app.get('/api/backup/download', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ error: 'شما مجوز دانلود فایل پشتیبان را ندارید' });
    return;
  }
  const db = loadDatabase();
  const ts = Date.now();
  const asciiName =
    (db.settings.name || 'NexusGameNet')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'nexus_gamenet';
  const utf8Name = (db.settings.name || 'GameNet').replace(/[^a-zA-Z0-9_\u0600-\u06FF-]/g, '_');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}_backup_${ts}.json"; filename*=UTF-8''${encodeURIComponent(`${utf8Name}_backup_${ts}.json`)}`
  );
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(db, null, 2));
});

// Restore from JSON Backup
app.post('/api/backup/restore', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ error: 'شما مجوز بازیابی فایل پشتیبان را ندارید' });
    return;
  }
  const backupData = req.body;
  if (!backupData || !backupData.accounts || !backupData.transactions) {
    res.status(400).json({ error: 'فایل پشتیبان نامعتبر است' });
    return;
  }
  saveDatabase(backupData);
  res.json({ success: true, message: 'اطلاعات با موفقیت بازیابی شد' });
});

// Reset or Clean Zero Data for Client Handover with Granular Selection
app.post('/api/reset-data', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ error: 'شما مجوز بازنشانی یا صفر کردن داده‌ها را ندارید' });
    return;
  }
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

// ==========================================
// System Update & PM2 Management API Routes
// ==========================================

/**
 * Automatically derives the live application version from package.json base version
 * plus the number of commits applied since that version was introduced in Git.
 * Starting at 2.4.1, each subsequent commit on main advances the patch automatically
 * (2.4.1 -> 2.4.2 -> 2.4.3 ...) without needing manual version bumps.
 */
async function resolveAppVersion(gitRef = 'HEAD'): Promise<string> {
  let baseVersion = '2.4.1';
  try {
    if (gitRef === 'HEAD') {
      const pkgPath = path.join(__dirname, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.version) baseVersion = String(pkg.version).trim();
      }
    } else {
      const { stdout: pkgText } = await execAsync(`git show ${gitRef}:package.json`, {
        cwd: __dirname,
        timeout: 5000,
      });
      const pkg = JSON.parse(pkgText);
      if (pkg.version) baseVersion = String(pkg.version).trim();
    }
  } catch {
    return baseVersion;
  }

  const isGitRepo = fs.existsSync(path.join(__dirname, '.git'));
  if (!isGitRepo) return baseVersion;

  try {
    const { stdout: hashesOut } = await execAsync(`git log -n 30 --format=%H ${gitRef} -- package.json`, {
      cwd: __dirname,
      timeout: 5000,
    });
    const hashes = hashesOut.trim().split('\n').filter(Boolean);
    let introCommit: string | null = null;

    for (const h of hashes) {
      try {
        const { stdout: pastPkgText } = await execAsync(`git show ${h}:package.json`, {
          cwd: __dirname,
          timeout: 5000,
        });
        const pastPkg = JSON.parse(pastPkgText);
        if (String(pastPkg.version || '').trim() === baseVersion) {
          introCommit = h;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    if (!introCommit) {
      return baseVersion;
    }

    const { stdout: countOut } = await execAsync(`git rev-list --count ${introCommit}..${gitRef}`, {
      cwd: __dirname,
      timeout: 5000,
    });
    const extraCommits = parseInt(countOut.trim(), 10) || 0;
    if (extraCommits <= 0) return baseVersion;

    const parts = baseVersion.split('.').map((n) => parseInt(n, 10));
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      return `${parts[0]}.${parts[1]}.${parts[2] + extraCommits}`;
    }
    return `${baseVersion}.${extraCommits}`;
  } catch {
    return baseVersion;
  }
}

app.get('/api/system/update-status', async (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ error: 'شما مجوز مشاهده وضعیت بروزرسانی سرور را ندارید' });
    return;
  }
  const isGitRepo = fs.existsSync(path.join(__dirname, '.git'));
  let currentCommit = 'unknown';
  let currentBranch = 'main';
  let lastCommitMessage = '';
  let lastCommitDate = '';
  let remoteUrl = '';

  if (isGitRepo) {
    try {
      const { stdout: commitOut } = await execAsync('git rev-parse --short HEAD', { cwd: __dirname, timeout: 5000 });
      currentCommit = commitOut.trim();
    } catch {
      // ignore
    }

    try {
      const { stdout: branchOut } = await execAsync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, timeout: 5000 });
      currentBranch = branchOut.trim();
    } catch {
      // ignore
    }

    try {
      const { stdout: msgOut } = await execAsync('git log -1 --pretty=%B', { cwd: __dirname, timeout: 5000 });
      lastCommitMessage = msgOut.trim().split('\n')[0];
    } catch {
      // ignore
    }

    try {
      const { stdout: dateOut } = await execAsync('git log -1 --format=%cd --date=format:"%Y/%m/%d %H:%M"', { cwd: __dirname, timeout: 5000 });
      lastCommitDate = dateOut.trim();
    } catch {
      // ignore
    }

    try {
      const { stdout: remoteOut } = await execAsync('git remote get-url origin', { cwd: __dirname, timeout: 5000 });
      remoteUrl = remoteOut.trim();
    } catch {
      // ignore
    }
  }

  // Check last backup file
  let lastBackupFile: string | undefined;
  const backupDir = path.join(__dirname, 'backups');
  if (fs.existsSync(backupDir)) {
    try {
      const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.bak')).sort().reverse();
      if (files.length > 0) lastBackupFile = files[0];
    } catch {
      // ignore
    }
  }

  const packageVersion = await resolveAppVersion('HEAD');
  const pm2Managed = process.env.pm_id !== undefined || process.env.PM2_HOME !== undefined;

  res.json({
    isGitRepo,
    currentCommit,
    currentBranch,
    lastCommitMessage,
    lastCommitDate,
    remoteUrl,
    packageVersion,
    pm2Managed,
    pm2Id: process.env.pm_id,
    isUpdating: isSystemUpdating,
    lastBackupFile,
    nodeVersion: process.version,
    platform: process.platform,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

app.post('/api/system/check-updates', async (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ success: false, error: 'شما مجوز بررسی بروزرسانی سرور را ندارید' });
    return;
  }
  const isGitRepo = fs.existsSync(path.join(__dirname, '.git'));
  if (!isGitRepo) {
    res.status(400).json({ success: false, error: 'پروژه جاری به عنوان مخزن گیت شناسایی نشد.' });
    return;
  }

  try {
    // 1. Fetch remote changes
    await execAsync('git fetch origin main', { cwd: __dirname, timeout: 20000 });

    // 2. Compare local HEAD with remote origin/main
    const { stdout: localHead } = await execAsync('git rev-parse HEAD', { cwd: __dirname, timeout: 5000 });
    const { stdout: remoteHead } = await execAsync('git rev-parse origin/main', { cwd: __dirname, timeout: 5000 });

    const currentVersion = await resolveAppVersion('HEAD');
    const isDifferent = localHead.trim() !== remoteHead.trim();

    if (!isDifferent) {
      res.json({
        success: true,
        hasUpdate: false,
        behindCount: 0,
        commits: [],
        currentVersion,
        remoteVersion: currentVersion,
        message: `برنامه شما کاملاً بروز است (نسخه v${currentVersion}).`,
      });
      return;
    }

    // 3. Count commits behind, get titles and target remote version
    let behindCount = 1;
    try {
      const { stdout: countOut } = await execAsync('git rev-list --count HEAD..origin/main', { cwd: __dirname, timeout: 5000 });
      behindCount = parseInt(countOut.trim(), 10) || 1;
    } catch {
      // ignore
    }

    let commits: string[] = [];
    try {
      const { stdout: logsOut } = await execAsync('git log HEAD..origin/main --pretty=format:"%h - %s" -n 10', { cwd: __dirname, timeout: 5000 });
      commits = logsOut.trim().split('\n').filter(Boolean);
    } catch {
      // ignore
    }

    const remoteVersion = await resolveAppVersion('origin/main');

    res.json({
      success: true,
      hasUpdate: true,
      behindCount,
      commits,
      currentVersion,
      remoteVersion,
      message: `نسخه جدید v${remoteVersion} در گیت‌هاب موجود است (${behindCount} بروزرسانی جدید).`,
    });
  } catch (err: any) {
    console.error('[Check Updates Error]:', err);
    res.status(500).json({
      success: false,
      error: 'خطا در اتصال به مخزن گیت‌هاب! لطفاً اتصال اینترنت سرور یا دسترسی به گیت‌هاب را بررسی کنید.',
      details: err?.message || String(err),
    });
  }
});

app.post('/api/system/trigger-update', async (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ success: false, error: 'شما مجوز اجرای بروزرسانی سرور را ندارید' });
    return;
  }
  if (isSystemUpdating) {
    res.status(409).json({ error: 'یک فرآیند بروزرسانی در حال اجرا است. لطفاً شکیبا باشید.' });
    return;
  }

  const isGitRepo = fs.existsSync(path.join(__dirname, '.git'));
  if (!isGitRepo) {
    res.status(400).json({ error: 'پوشه مخزن گیت (.git) یافت نشد.' });
    return;
  }

  isSystemUpdating = true;
  const logs: string[] = [];

  try {
    logs.push(`[${new Date().toLocaleTimeString('fa-IR')}] شروع فرآیند خودکار بروزرسانی...`);

    // Step 1: Pre-update Safety Backup of Database
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `nexus_db_before_update_${timestamp}.bak`;
    const backupFilePath = path.join(backupDir, backupFileName);

    if (fs.existsSync(DB_FILE)) {
      fs.copyFileSync(DB_FILE, backupFilePath);
      logs.push(`[پشتیبان‌گیری] دیتابیس فعلی با موفقیت در backups/${backupFileName} ذخیره شد.`);
    }

    // Step 2: Git Pull
    logs.push('[گیت‌هاب] در حال دریافت کدهای جدید از مخزن گیت‌هاب...');
    try {
      const { stdout: pullOut } = await execAsync('git pull origin main', { cwd: __dirname, timeout: 45000 });
      logs.push(`[گیت‌هاب]: ${pullOut.trim()}`);
    } catch (pullErr: any) {
      logs.push(`[هشدار گیت]: ${pullErr?.message || String(pullErr)}`);
      await execAsync('git fetch origin main && git reset --hard origin/main', { cwd: __dirname, timeout: 30000 });
      logs.push('[گیت‌هاب]: همگام‌سازی کامل با شاخه اصلی گیت‌هاب انجام شد.');
    }

    // Step 3: npm install
    logs.push('[پکیج‌ها] بررسی و نصب وابستگی‌های جدید (npm install)...');
    try {
      const { stdout: npmOut } = await execAsync('npm install --legacy-peer-deps --no-audit', { cwd: __dirname, timeout: 120000 });
      if (npmOut) logs.push(`[npm]: ${npmOut.slice(0, 300)}...`);
    } catch (npmErr: any) {
      logs.push(`[هشدار npm]: ${npmErr?.message || String(npmErr)}`);
    }

    // Step 4: npm run build
    logs.push('[کامپایل] بیلد نهایی پروژه با Vite...');
    await execAsync('npm run build', { cwd: __dirname, timeout: 60000 });
    logs.push('[کامپایل]: بیلد با موفقیت ایجاد شد.');

    const newVersion = await resolveAppVersion('HEAD');

    // Step 5: Audit Log in DB
    const db = loadDatabase();
    logAudit(db, 'settings', 'sys', 'update', `بروزرسانی موفق سیستم به نسخه v${newVersion} از طریق پنل تنظیمات`);
    saveDatabase(db);

    logs.push('====================================================');
    logs.push(`آپدیت به نسخه v${newVersion} با موفقیت نصب شد و دیتابیس کاملاً حفظ گردید!`);
    logs.push('سرور تا ۲ ثانیه دیگر به صورت خودکار مجدداً راه‌اندازی (Restart) می‌شود...');

    // Respond immediately before restarting server
    res.json({
      success: true,
      newVersion,
      message: `بروزرسانی به نسخه v${newVersion} با موفقیت انجام شد! سرور در حال راه‌اندازی مجدد است.`,
      logs,
      restarting: true,
    });

    // Step 6: Trigger Server Restart after delay
    setTimeout(() => {
      console.log('[System Update] Restarting server process...');
      exec('pm2 reload nexus-server || pm2 restart nexus-server', (pm2Err) => {
        if (pm2Err) {
          console.log('[System Update] PM2 CLI not found or standalone, exiting to restart:', pm2Err.message);
          process.exit(0);
        } else {
          console.log('[System Update] PM2 successfully reloaded.');
        }
      });
    }, 2000);
  } catch (err: any) {
    console.error('[Trigger Update Error]:', err);
    logs.push(`[خطای غیرمنتظره]: ${err?.message || String(err)}`);
    res.status(500).json({
      success: false,
      error: 'خطا در فرآیند بروزرسانی سیستم',
      details: err?.message || String(err),
      logs,
    });
  } finally {
    isSystemUpdating = false;
  }
});

app.post('/api/system/restart', (req: AuthedRequest, res: Response) => {
  if (!hasPerm(req.authUser, 'manage_settings')) {
    res.status(403).json({ success: false, error: 'شما مجوز راه‌اندازی مجدد سرور را ندارید' });
    return;
  }
  res.json({
    success: true,
    message: 'دستور راه‌اندازی مجدد سرور صادر شد. صفحه تا ۳ ثانیه دیگر خودکار بازیابی می‌شود.',
  });

  setTimeout(() => {
    console.log('[System Restart] Triggering process restart...');
    exec('pm2 reload nexus-server || pm2 restart nexus-server', (err) => {
      if (err) {
        process.exit(0);
      }
    });
  }, 1500);
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

  // Eagerly load active server sessions and validate database into authoritative memory state
  loadSessionsFromFile();
  try {
    const initialDb = loadDatabase();
    console.log(`[Database] Initialized successfully. Loaded ${initialDb.users.length} users, ${initialDb.transactions.length} transactions, ${initialDb.accounts.length} accounts. Active sessions: ${activeSessions.size}`);
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
