import { Transaction } from '../types/index.ts';

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
      label: 'ثبت نسیه (بدهی مشتری)',
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
      label: 'وصول طلب (تسویه نسیه)',
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
      label: 'درآمد (فروش / بازی)',
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
  isSmartLaunch?: boolean
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
  return {
    label: 'نقدی / کارتخوان',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
  };
}
