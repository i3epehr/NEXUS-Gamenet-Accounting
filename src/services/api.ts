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

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('nexus_user_id') : null;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(currentUserId ? { 'x-auth-user-id': currentUserId } : {}),
      ...options?.headers,
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

  return res.json();
}

export const api = {
  // Auth & Users
  async login(
    credentialsOrUsername: { username: string; password?: string } | string,
    passwordParam?: string
  ): Promise<{ token: string; user: User }> {
    const username = typeof credentialsOrUsername === 'object' ? credentialsOrUsername.username : credentialsOrUsername;
    const password = typeof credentialsOrUsername === 'object' ? credentialsOrUsername.password : passwordParam;
    const result = await fetchJson<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (result?.user?.id && typeof window !== 'undefined') {
      localStorage.setItem('nexus_user_id', result.user.id);
    }
    return result;
  },

  logout(): void {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('nexus_user_id');
    }
  },

  async getCurrentUser(): Promise<{ user: User }> {
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
  }): Promise<{ success: boolean; product: Product; transaction: Transaction }> {
    return fetchJson('/api/buffet/restock', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async wasteProduct(data: {
    productId: string;
    quantity: number;
    reason: string;
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
      walletAmount?: number;
      cashOrPosAmount?: number;
      date: string;
      jalaliDate: string;
    }
  ): Promise<{ success: boolean; transaction: Transaction; message: string; persons?: Person[] }> {
    return fetchJson(`/api/tabs/${id}/checkout`, {
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
};
