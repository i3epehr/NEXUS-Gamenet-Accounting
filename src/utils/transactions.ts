import { Account, Transaction } from '../types/index.ts';

export interface TransactionMeta {
  label: string;
  badgeClass: string;
  amountClass: string;
  kind:
    | 'credit'
    | 'wallet_charge'
    | 'wallet_deduct'
    | 'receivable_collection'
    | 'debt_settlement'
    | 'income'
    | 'expense'
    | 'transfer';
}

/**
 * Returns clean, consistent Persian labels and color stylings for transactions
 * across the entire application (Ledger, Customer History, Dashboard, Desks).
 */
export function getTransactionMeta(tx: Transaction): TransactionMeta {
  const desc = tx.description || '';

  // 1. Credit / Debt Tab or Sale
  const isCredit =
    tx.isCredit ||
    tx.paymentMethod === 'credit' ||
    (!tx.toAccountId && (desc.includes('نسیه') || desc.includes('[نسیه]')));

  if (isCredit) {
    return {
      label: 'ثبت نسیه',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
      amountClass: 'text-amber-600 dark:text-amber-400',
      kind: 'credit',
    };
  }

  // 2. Customer Wallet Charging (Money received into account)
  const isWalletCharge =
    tx.paymentMethod === 'wallet_charge' ||
    (tx.id.startsWith('tx_wlt_') && (desc.includes('شارژ کیف پول') || desc.includes('شارژ') || desc.includes('دریافت وجه'))) ||
    (tx.type === 'receivable_collection' && (desc.includes('شارژ کیف پول') || desc.includes('شارژ')));

  if (isWalletCharge) {
    return {
      label: 'شارژ کیف پول',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
      amountClass: 'text-emerald-600 dark:text-emerald-400',
      kind: 'wallet_charge',
    };
  }

  // 3. Customer Wallet Deduction / Refund (Money deducted or paid out)
  const isWalletDeduct =
    tx.paymentMethod === 'wallet_deduct' ||
    (tx.id.startsWith('tx_wlt_') && (desc.includes('کسر') || desc.includes('برداشت') || desc.includes('عودت'))) ||
    (tx.type === 'debt_settlement' && (desc.includes('کسر از حساب') || desc.includes('کیف پول') || desc.includes('برداشت')));

  if (isWalletDeduct) {
    return {
      label: 'کسر از کیف پول',
      badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30',
      amountClass: 'text-rose-600 dark:text-rose-400',
      kind: 'wallet_deduct',
    };
  }

  // 4. Settling customer debt / collection of receivable
  if (tx.type === 'receivable_collection') {
    return {
      label: 'تسویه نسیه',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
      amountClass: 'text-emerald-600 dark:text-emerald-400',
      kind: 'receivable_collection',
    };
  }

  // 5. Settling supplier/vendor debt (paying out debt)
  if (tx.type === 'debt_settlement') {
    return {
      label: 'تسویه بدهی طرف‌حساب',
      badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30',
      amountClass: 'text-purple-600 dark:text-purple-400',
      kind: 'debt_settlement',
    };
  }

  // 6. Regular Income
  if (tx.type === 'income') {
    return {
      label: 'درآمد',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
      amountClass: 'text-emerald-600 dark:text-emerald-400',
      kind: 'income',
    };
  }

  // 7. Regular Expense
  if (tx.type === 'expense') {
    return {
      label: 'هزینه جاری',
      badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30',
      amountClass: 'text-rose-600 dark:text-rose-400',
      kind: 'expense',
    };
  }

  // 8. Internal Transfer
  if (tx.type === 'transfer') {
    return {
      label: 'انتقال داخلی',
      badgeClass: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border border-sky-500/30',
      amountClass: 'text-sky-600 dark:text-sky-400',
      kind: 'transfer',
    };
  }

  return {
    label: 'سند مالی',
    badgeClass: 'bg-slate-500/15 text-slate-700 dark:text-slate-400 border border-slate-500/30',
    amountClass: 'text-slate-700 dark:text-slate-300',
    kind: 'income',
  };
}

export function getPaymentMethodBadge(
  method?: string,
  isCredit?: boolean,
  isSmartLaunch?: boolean,
  accountName?: string
): { label: string; badgeClass: string } {
  if (isSmartLaunch) {
    return {
      label: 'اسمارت‌لانچ',
      badgeClass: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80',
    };
  }
  if (isCredit || method === 'credit') {
    return {
      label: 'نسیه',
      badgeClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
    };
  }
  if (method === 'wallet' || method === 'wallet_charge') {
    return {
      label: 'کیف پول',
      badgeClass: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30',
    };
  }
  if (method === 'wallet_deduct') {
    return {
      label: 'کسر کیف پول',
      badgeClass: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30',
    };
  }
  if (method === 'split') {
    return {
      label: 'ترکیبی',
      badgeClass: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30',
    };
  }
  if (method === 'cash' || method === 'نقدی') {
    return {
      label: 'نقدی',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
    };
  }
  if (method === 'pos' || method === 'کارتخوان') {
    return {
      label: 'کارتخوان',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
    };
  }

  // When paymentMethod was not explicitly stored, detect via account name
  const accLower = (accountName || '').toLowerCase();
  if (accLower.includes('صندوق') || accLower.includes('نقد') || accLower.includes('دخل')) {
    return {
      label: 'نقدی',
      badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
    };
  }

  // Default to کارتخوان (standard POS reader in gamenets)
  return {
    label: 'کارتخوان',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
  };
}

/**
 * Checks whether a transaction contains both gaming rental/time and buffet items.
 */
export function isMixedGamingBuffet(tx: { categoryName?: string; tabId?: string; receiptItems?: unknown[] }): boolean {
  if (!tx) return false;
  const cat = tx.categoryName || '';
  if (cat.includes('+') || (cat.includes('بوفه') && (cat.includes('کرایه') || cat.includes('کنسول') || cat.includes('گیم‌نت')))) {
    return true;
  }
  if (tx.tabId && tx.receiptItems && Array.isArray(tx.receiptItems) && tx.receiptItems.length > 0) {
    return true;
  }
  return false;
}

export interface PersonDepositEntry {
  personName: string;
  personId?: string;
  totalAmount: number;
  count: number;
  transactions: Transaction[];
}

export interface AccountDepositGroup {
  accountId: string;
  accountName: string;
  accountType?: string;
  totalDeposit: number;
  txCount: number;
  persons: PersonDepositEntry[];
}

/**
 * Groups deposit/inflow transactions by destination account and depositing person.
 * Only includes actual inflows into an account (income, receivable collection, wallet charge).
 */
export function getAccountPersonDeposits(
  transactions: Transaction[],
  accounts?: Account[]
): AccountDepositGroup[] {
  const accMap = new Map<string, {
    accountName: string;
    accountType?: string;
    totalDeposit: number;
    txCount: number;
    personMap: Map<string, {
      personId?: string;
      totalAmount: number;
      count: number;
      transactions: Transaction[];
    }>;
  }>();

  for (const tx of transactions) {
    const meta = getTransactionMeta(tx);
    // Only actual cash/pos deposits into an account:
    const isDeposit =
      (meta.kind === 'income' || meta.kind === 'receivable_collection' || meta.kind === 'wallet_charge') &&
      Boolean(tx.toAccountId || tx.toAccountName);

    if (!isDeposit) continue;

    const accId = tx.toAccountId || 'unknown_acc';
    const accName = tx.toAccountName || accounts?.find((a) => a.id === accId)?.name || 'صندوق / حساب نامشخص';
    const accType = accounts?.find((a) => a.id === accId)?.type;

    if (!accMap.has(accId)) {
      accMap.set(accId, {
        accountName: accName,
        accountType: accType,
        totalDeposit: 0,
        txCount: 0,
        personMap: new Map(),
      });
    }

    const accEntry = accMap.get(accId)!;
    accEntry.totalDeposit += tx.amount;
    accEntry.txCount += 1;

    const pName = (tx.personName && tx.personName.trim()) ? tx.personName.trim() : 'مشتری آزاد / گذری';
    const pKey = tx.personId ? `id_${tx.personId}` : `name_${pName}`;

    if (!accEntry.personMap.has(pKey)) {
      accEntry.personMap.set(pKey, {
        personId: tx.personId,
        totalAmount: 0,
        count: 0,
        transactions: [],
      });
    }

    const pEntry = accEntry.personMap.get(pKey)!;
    pEntry.totalAmount += tx.amount;
    pEntry.count += 1;
    pEntry.transactions.push(tx);
  }

  // Convert to array and sort accounts by total deposit descending, persons by amount descending
  const result: AccountDepositGroup[] = [];
  for (const [accId, data] of accMap.entries()) {
    const persons: PersonDepositEntry[] = [];
    for (const [pKey, pData] of data.personMap.entries()) {
      const pName = pKey.startsWith('name_')
        ? pKey.replace('name_', '')
        : (pData.transactions[0]?.personName || 'مشتری نامشخص');
      persons.push({
        personName: pName,
        personId: pData.personId,
        totalAmount: pData.totalAmount,
        count: pData.count,
        transactions: pData.transactions,
      });
    }
    persons.sort((a, b) => b.totalAmount - a.totalAmount);

    result.push({
      accountId: accId,
      accountName: data.accountName,
      accountType: data.accountType,
      totalDeposit: data.totalDeposit,
      txCount: data.txCount,
      persons,
    });
  }

  result.sort((a, b) => b.totalDeposit - a.totalDeposit);
  return result;
}

/**
 * Calculates the running balance for a person's transactions BEFORE each transaction took place.
 * Returns a map of txId -> balanceBeforeTransaction.
 * Working backwards from current balance ensures exact consistency.
 */
export function calculatePersonRunningBalances(
  personCurrentBalance: number,
  transactions: Transaction[]
): Map<string, number> {
  const map = new Map<string, number>();
  // Sort transactions newest to oldest
  const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let curBal = personCurrentBalance || 0;
  for (const tx of sorted) {
    const meta = getTransactionMeta(tx);
    let delta = 0;
    if (meta.kind === 'credit') {
      delta = tx.amount;
    } else if (meta.kind === 'receivable_collection' || meta.kind === 'wallet_charge') {
      delta = -tx.amount;
    } else if (meta.kind === 'wallet_deduct' || meta.kind === 'debt_settlement') {
      delta = tx.amount;
    } else {
      delta = 0;
    }
    const balBeforeTx = curBal - delta;
    map.set(tx.id, balBeforeTx);
    curBal = balBeforeTx;
  }
  return map;
}

/**
 * Generates an array of page numbers and ellipsis markers for standard website pagination.
 * Shows first pages, surrounding pages around current page, and last pages.
 * E.g.: [1, 2, 'ellipsis-start', 8, 9, 10, 'ellipsis-end', 19, 20]
 */
export function getPaginationItems(
  currentPage: number,
  totalPages: number
): (number | 'ellipsis-start' | 'ellipsis-end')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const showStartEllipsis = currentPage > 4;
  const showEndEllipsis = currentPage < totalPages - 3;

  if (!showStartEllipsis && showEndEllipsis) {
    // Near beginning: 1, 2, 3, 4, 5, '...', total-1, total
    const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [];
    for (let i = 1; i <= Math.min(5, totalPages); i++) {
      items.push(i);
    }
    items.push('ellipsis-end');
    if (!items.includes(totalPages - 1)) items.push(totalPages - 1);
    if (!items.includes(totalPages)) items.push(totalPages);
    return items;
  }

  if (showStartEllipsis && !showEndEllipsis) {
    // Near end: 1, 2, '...', total-4, total-3, total-2, total-1, total
    const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1, 2, 'ellipsis-start'];
    for (let i = totalPages - 4; i <= totalPages; i++) {
      if (!items.includes(i)) items.push(i);
    }
    return items;
  }

  // Middle: 1, 2, '...', current-1, current, current+1, '...', total-1, total
  return [
    1,
    2,
    'ellipsis-start',
    currentPage - 1,
    currentPage,
    currentPage + 1,
    'ellipsis-end',
    totalPages - 1,
    totalPages,
  ];
}
