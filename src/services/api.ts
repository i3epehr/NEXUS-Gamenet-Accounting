import {
  Account,
  AuditLog,
  Category,
  DashboardStats,
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
  ResetOptions,
  Staff,
  Transaction,
  TransactionType,
  User,
} from '../types/index.ts';

const AUTH_TOKEN_KEY = 'nexus_auth_token';
const LEGACY_USER_ID_KEY = 'nexus_user_id';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    localStorage.removeItem(LEGACY_USER_ID_KEY);
    return sessionStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

function setAuthToken(token: string, rememberMe: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_ID_KEY);
    if (rememberMe) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch {
    // ignore storage quota errors
  }
}

function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(LEGACY_USER_ID_KEY);
  } catch {
    // ignore
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401 && !url.includes('/api/auth/login')) {
      clearAuthToken();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nexus:unauthorized'));
      }
    }
    let errorMsg = `خطای سرور (${res.status})`;
    try {
      const data = await res.json();
      if (data.error) errorMsg = data.error;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  return res.json();
}

export const api = {
  // Public Branding (safe for login page)
  async getPublicBranding(): Promise<{ name?: string; currency?: string; theme?: 'dark' | 'light' }> {
    return fetchJson('/api/public/branding');
  },

  // Auth & Users
  async login(
    credentialsOrUsername: { username: string; password?: string; rememberMe?: boolean } | string,
    passwordParam?: string
  ): Promise<{ token: string; user: User; expiresAt?: string }> {
    const previousToken = getAuthToken();
    const username = typeof credentialsOrUsername === 'object' ? credentialsOrUsername.username : credentialsOrUsername;
    const password = typeof credentialsOrUsername === 'object' ? credentialsOrUsername.password : passwordParam;
    const rememberMe = typeof credentialsOrUsername === 'object' ? !!credentialsOrUsername.rememberMe : false;

    const result = await fetchJson<{ token: string; user: User; expiresAt?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, rememberMe }),
    });
    if (result?.token) {
      setAuthToken(result.token, rememberMe);
    }
    // If user was switching accounts cleanly, invalidate previous token on server
    if (previousToken && previousToken !== result?.token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${previousToken}` },
      }).catch(() => {});
    }
    return result;
  },

  async logout(): Promise<void> {
    const token = getAuthToken();
    clearAuthToken();
    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // ignore network errors on logout
      }
    }
  },

  async getCurrentUser(): Promise<{ user: User | null }> {
    if (!getAuthToken()) {
      return { user: null };
    }
    return fetchJson('/api/auth/me');
  },

  async getUsers(): Promise<{ users: User[] }> {
    return fetchJson('/api/users');
  },

  async createUser(data: Partial<User>): Promise<User> {
    return fetchJson('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateUser(id: string, data: Partial<User>): Promise<User> {
    return fetchJson(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteUser(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  // Dashboard
  async getDashboard(): Promise<DashboardStats> {
    return fetchJson<DashboardStats>('/api/dashboard');
  },

  // Accounts
  async getAccounts(): Promise<{ accounts: Account[] }> {
    return fetchJson('/api/accounts');
  },

  async createAccount(data: Partial<Account>): Promise<Account> {
    return fetchJson('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateAccount(id: string, data: Partial<Account>): Promise<Account> {
    return fetchJson(`/api/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteAccount(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/accounts/${id}`, {
      method: 'DELETE',
    });
  },

  async transferFunds(data: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    description?: string;
    date?: string;
    jalaliDate?: string;
  }): Promise<{ transaction: Transaction; fromAccount: Account; toAccount: Account }> {
    return fetchJson('/api/accounts/transfer', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Transactions
  async getTransactions(params?: {
    type?: string;
    accountId?: string;
    categoryId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{ transactions: Transaction[] }> {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.type) searchParams.append('type', params.type);
      if (params.accountId) searchParams.append('accountId', params.accountId);
      if (params.categoryId) searchParams.append('categoryId', params.categoryId);
      if (params.search) searchParams.append('search', params.search);
      if (params.startDate) searchParams.append('startDate', params.startDate);
      if (params.endDate) searchParams.append('endDate', params.endDate);
    }
    const query = searchParams.toString();
    return fetchJson(`/api/transactions${query ? `?${query}` : ''}`);
  },

  async createTransaction(data: {
    type: TransactionType;
    amount: number;
    date: string;
    jalaliDate: string;
    categoryId?: string;
    accountId?: string;
    personId?: string;
    description: string;
    receiptItems?: ReceiptItem[];
    paymentMethod?: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
    walletAmount?: number;
    cashOrPosAmount?: number;
  }): Promise<Transaction> {
    return fetchJson('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTransaction(
    id: string,
    data: Partial<Transaction> & { accountId?: string }
  ): Promise<Transaction> {
    return fetchJson(`/api/transactions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteTransaction(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/transactions/${id}`, {
      method: 'DELETE',
    });
  },

  // Categories
  async getCategories(): Promise<{ categories: Category[] }> {
    return fetchJson('/api/categories');
  },

  async createCategory(data: Partial<Category>): Promise<Category> {
    return fetchJson('/api/categories', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCategory(id: string, data: Partial<Category>): Promise<Category> {
    return fetchJson(`/api/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteCategory(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/categories/${id}`, {
      method: 'DELETE',
    });
  },

  // Buffet / Inventory
  async getBuffet(): Promise<{
    products: Product[];
    inventoryLogs: InventoryLog[];
    gamingServices?: GamingServiceItem[];
  }> {
    return fetchJson('/api/buffet/products');
  },

  async createProduct(data: Partial<Product>): Promise<Product> {
    return fetchJson('/api/buffet/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateProduct(id: string, data: Partial<Product>): Promise<Product> {
    return fetchJson(`/api/buffet/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteProduct(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/buffet/products/${id}`, {
      method: 'DELETE',
    });
  },

  // Gaming Services (Console Time Rental & ID / Account Recharges)
  async getGamingServices(): Promise<{ services: GamingServiceItem[] }> {
    return fetchJson('/api/gaming-services');
  },

  async createGamingService(data: Partial<GamingServiceItem>): Promise<GamingServiceItem> {
    return fetchJson('/api/gaming-services', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateGamingService(id: string, data: Partial<GamingServiceItem>): Promise<GamingServiceItem> {
    return fetchJson(`/api/gaming-services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteGamingService(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/gaming-services/${id}`, {
      method: 'DELETE',
    });
  },

  async sellBuffet(data: {
    items: { productId: string; quantity: number; unitPrice?: number }[];
    accountId?: string;
    personId?: string;
    paymentMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
    walletAmount?: number;
    cashOrPosAmount?: number;
    date: string;
    jalaliDate: string;
  }): Promise<{ success: boolean; transaction: Transaction; products: Product[] }> {
    return fetchJson('/api/buffet/sale', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async restockProduct(data: {
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
  }): Promise<{ success: boolean; product: Product; transaction: Transaction }> {
    return fetchJson('/api/buffet/restock', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async transferToFridge(data: {
    productId: string;
    quantity: number;
    date?: string;
    jalaliDate?: string;
    note?: string;
  }): Promise<{ success: boolean; product: Product }> {
    return fetchJson('/api/buffet/transfer-to-fridge', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async wasteProduct(data: {
    productId: string;
    quantity: number;
    reason: string;
    location?: 'warehouse' | 'fridge' | 'overall';
  }): Promise<{ success: boolean; product: Product }> {
    return fetchJson('/api/buffet/waste', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Open Tabs (Gaming Sessions / Running Table Orders)
  async getTabs(): Promise<{ tabs: OpenTab[] }> {
    return fetchJson('/api/tabs');
  },

  async createTab(data: {
    title: string;
    personId?: string;
    customerName?: string;
    customerPhone?: string;
    smartLaunchId?: string;
    notes?: string;
  }): Promise<OpenTab & { persons?: Person[] }> {
    return fetchJson('/api/tabs', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateTab(
    id: string,
    data: Partial<OpenTab> & { customerName?: string; customerPhone?: string }
  ): Promise<OpenTab & { persons?: Person[] }> {
    return fetchJson(`/api/tabs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async addItemToTab(
    tabId: string,
    data: { productId?: string; productName?: string; quantity: number; unitPrice?: number }
  ): Promise<OpenTab> {
    return fetchJson(`/api/tabs/${tabId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async removeItemFromTab(tabId: string, itemId: string): Promise<OpenTab> {
    return fetchJson(`/api/tabs/${tabId}/items/${itemId}`, {
      method: 'DELETE',
    });
  },

  async updateTabItemQuantity(
    tabId: string,
    itemId: string,
    data: { delta?: number; quantity?: number }
  ): Promise<{ success: boolean; tab: OpenTab }> {
    return fetchJson(`/api/tabs/${tabId}/items/${itemId}/quantity`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async checkoutTab(
    id: string,
    data: {
      paymentMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
      accountId?: string;
      personId?: string;
      customerName?: string;
      customerPhone?: string;
      smartLaunchId?: string;
      walletAmount?: number;
      cashOrPosAmount?: number;
      date: string;
      jalaliDate: string;
      settleScope?: 'all' | 'buffet' | 'custom_amount';
      customAmount?: number;
      smartLaunchSettlement?: {
        amount: number;
        durationMinutes: number;
        hourlyRate: number;
        smartLaunchId?: string;
      };
    }
  ): Promise<{ success: boolean; transaction: Transaction; tab?: OpenTab; message: string; persons?: Person[] }> {
    return fetchJson(`/api/tabs/${id}/checkout`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async closeTabSmartLaunch(
    id: string,
    data: {
      amount: number;
      durationMinutes: number;
      hourlyRate: number;
      smartLaunchId?: string;
      customerName?: string;
      personId?: string;
      action?: 'close_tab' | 'stop_timer_only';
      paymentMethod?: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
      accountId?: string;
      walletAmount?: number;
      date?: string;
      jalaliDate?: string;
    }
  ): Promise<{ success: boolean; tab: OpenTab; transaction?: Transaction; persons?: Person[]; message?: string }> {
    return fetchJson(`/api/tabs/${id}/close-smartlaunch`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async deleteTab(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/tabs/${id}`, {
      method: 'DELETE',
    });
  },

  async reopenTab(id: string): Promise<{ success: boolean; tab: OpenTab; accounts?: Account[]; products?: Product[] }> {
    return fetchJson(`/api/tabs/${id}/reopen`, {
      method: 'POST',
    });
  },

  // Reservations
  async getReservations(): Promise<{ reservations: Reservation[] }> {
    return fetchJson('/api/reservations');
  },

  async createReservation(data: Partial<Reservation> & { tableCount?: number }): Promise<Reservation> {
    return fetchJson('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateReservation(id: string, data: Partial<Reservation>): Promise<Reservation> {
    return fetchJson(`/api/reservations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteReservation(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/reservations/${id}`, {
      method: 'DELETE',
    });
  },

  async convertReservationToTab(id: string): Promise<{ success: boolean; tab: OpenTab; reservation: Reservation }> {
    return fetchJson(`/api/reservations/${id}/convert-to-tab`, {
      method: 'POST',
    });
  },

  async checkAutoOpenReservations(clientJalaliDate?: string, clientTime?: string): Promise<{ openedCount: number; openedTabs: OpenTab[] }> {
    return fetchJson('/api/reservations/check-auto-open', {
      method: 'POST',
      body: JSON.stringify({ clientJalaliDate, clientTime }),
    });
  },

  // Contacts
  async getContacts(): Promise<{ persons: Person[] }> {
    return fetchJson('/api/contacts');
  },

  async createContact(data: Partial<Person>): Promise<Person> {
    return fetchJson('/api/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateContact(id: string, data: Partial<Person>): Promise<Person> {
    return fetchJson(`/api/contacts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteContact(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/contacts/${id}`, {
      method: 'DELETE',
    });
  },

  async settleContact(
    id: string,
    data: {
      amount: number;
      actionType: 'collect' | 'pay';
      accountId: string;
      date: string;
      jalaliDate: string;
      description?: string;
    }
  ): Promise<{ success: boolean; person: Person; account: Account; transaction: Transaction }> {
    return fetchJson(`/api/contacts/${id}/settle`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async manageWallet(
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
  ): Promise<{ success: boolean; person: Person; account?: Account; transaction?: Transaction }> {
    return fetchJson(`/api/contacts/${id}/wallet`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Staff
  async getStaff(): Promise<{ staff: Staff[]; payrollRecords: PayrollRecord[] }> {
    return fetchJson('/api/staff');
  },

  async createStaff(data: Partial<Staff>): Promise<Staff> {
    return fetchJson('/api/staff', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateStaff(id: string, data: Partial<Staff>): Promise<Staff> {
    return fetchJson(`/api/staff/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteStaff(id: string): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/staff/${id}`, {
      method: 'DELETE',
    });
  },

  async payStaff(data: {
    staffId: string;
    amount: number;
    period: string;
    accountId: string;
    date: string;
    jalaliDate: string;
    notes?: string;
  }): Promise<{ success: boolean; payroll: PayrollRecord; transaction: Transaction; account: Account }> {
    return fetchJson('/api/staff/pay', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Reports
  async getPnL(params?: { startDate?: string; endDate?: string }): Promise<{
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
    incomeCategories: Record<string, number>;
    expenseCategories: Record<string, number>;
  }> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);
    return fetchJson(`/api/reports/pnl?${searchParams.toString()}`);
  },

  // Settings & System
  async getSettings(): Promise<{ settings: GameNetSettings }> {
    return fetchJson('/api/settings');
  },

  async updateSettings(data: Partial<GameNetSettings>): Promise<{ settings: GameNetSettings }> {
    return fetchJson('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async getAuditLogs(): Promise<{ auditLogs: AuditLog[] }> {
    return fetchJson('/api/audit-logs');
  },

  async downloadBackup(): Promise<void> {
    const token = getAuthToken();
    const res = await fetch('/api/backup/download', {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      let errorMsg = `خطای سرور (${res.status})`;
      try {
        const data = await res.json();
        if (data.error) errorMsg = data.error;
      } catch {
        // ignore
      }
      throw new Error(errorMsg);
    }
    const disposition = res.headers.get('Content-Disposition') || '';
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
    const filename = utf8Match
      ? decodeURIComponent(utf8Match[1].trim())
      : asciiMatch
      ? asciiMatch[1].trim()
      : `nexus_backup_${Date.now()}.json`;

    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  },

  async restoreBackup(data: unknown): Promise<{ success: boolean; message: string }> {
    return fetchJson('/api/backup/restore', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async resetData(
    clean = false,
    options?: ResetOptions
  ): Promise<{ success: boolean; message: string }> {
    return fetchJson(`/api/reset-data${clean ? '?clean=true' : ''}`, {
      method: 'POST',
      body: options ? JSON.stringify({ options }) : undefined,
    });
  },

  // Unified sales checkout (supporting simultaneous console rent + buffet items + table info)
  async checkoutUnified(data: {
    cart?: {
      productId?: string;
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      isBuffet?: boolean;
    }[];
    tableOption?: 'none' | 'new' | 'existing';
    tableTitle?: string;
    existingTabId?: string;
    amount: number;
    accountId?: string;
    personId?: string;
    customerName?: string;
    customerPhone?: string;
    smartLaunchId?: string;
    paymentMethod: 'cash' | 'pos' | 'credit' | 'wallet' | 'split';
    walletAmount?: number;
    cashOrPosAmount?: number;
    description?: string;
    categoryId?: string;
    date?: string;
    jalaliDate?: string;
  }): Promise<{ success: boolean; transaction: Transaction; tab?: OpenTab; products?: Product[]; persons?: Person[] }> {
    return fetchJson('/api/checkout/unified', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // System Update & PM2 Management API
  async getSystemUpdateStatus(): Promise<{
    isGitRepo: boolean;
    currentCommit: string;
    currentBranch: string;
    lastCommitMessage: string;
    lastCommitDate: string;
    remoteUrl: string;
    packageVersion: string;
    pm2Managed: boolean;
    pm2Id?: string;
    isUpdating: boolean;
    lastBackupFile?: string;
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
  }> {
    return fetchJson('/api/system/update-status');
  },

  async checkSystemUpdates(): Promise<{
    success: boolean;
    hasUpdate: boolean;
    behindCount?: number;
    commits?: string[];
    message: string;
    error?: string;
  }> {
    return fetchJson('/api/system/check-updates', { method: 'POST' });
  },

  async triggerSystemUpdate(): Promise<{
    success: boolean;
    message: string;
    logs: string[];
    restarting?: boolean;
    error?: string;
  }> {
    return fetchJson('/api/system/trigger-update', { method: 'POST' });
  },

  async restartSystemServer(): Promise<{
    success: boolean;
    message: string;
  }> {
    return fetchJson('/api/system/restart', { method: 'POST' });
  },
};
