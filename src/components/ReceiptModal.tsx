import React from 'react';
import { X, Printer, CheckCircle, Gamepad2 } from 'lucide-react';
import { GameNetSettings, Transaction } from '../types/index.ts';
import { formatJalaliReadable, formatToman } from '../utils/jalali.ts';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';

interface ReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  settings: GameNetSettings;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  isOpen,
  onClose,
  transaction,
  settings,
}) => {
  useLockBodyScroll(isOpen);

  if (!isOpen || !transaction) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs print:static print:bg-transparent print:p-0">
      <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden transition-all flex flex-col max-h-[90vh] print:border-none print:shadow-none print:w-auto print:max-h-none print:bg-transparent">
        {/* Modal Controls Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 no-print">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            رسید و فاکتور چاپی حرارتی
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2596BE] text-white rounded-xl text-xs font-semibold hover:bg-[#1E7E9E] transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>چاپ فیش</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Canvas */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950 flex justify-center print:p-0 print:bg-transparent print:overflow-visible">
          <div
            id="printable-receipt"
            className="w-[80mm] min-h-[110mm] bg-white text-slate-900 p-4 rounded-xl shadow-md border border-slate-200 text-xs font-['Vazirmatn',sans-serif] space-y-3 print:border-none print:shadow-none print:w-[76mm] print:m-0 print:p-2"
          >
            {/* Store Header */}
            <div className="text-center border-b border-dashed border-slate-300 pb-3 space-y-1">
              <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-white mb-1">
                <Gamepad2 className="w-4 h-4" />
              </div>
              <h3 className="font-extrabold text-sm tracking-tight text-slate-900">{settings.name}</h3>
              <p className="text-[10px] text-slate-500">{settings.address}</p>
              <p className="text-[10px] text-slate-500 font-mono">تلفن: {settings.phone}</p>
            </div>

            {/* Meta Info */}
            <div className="text-[11px] space-y-1 border-b border-dashed border-slate-300 pb-2.5">
              <div className="flex justify-between">
                <span className="text-slate-500">شماره فاکتور:</span>
                <span className="font-mono font-bold">{transaction.id.replace('tx_', '#')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">تاریخ و ساعت:</span>
                <span className="font-medium">{formatJalaliReadable(transaction.date, true)}</span>
              </div>
              {transaction.personName && (
                <div className="flex justify-between">
                  <span className="text-slate-500">مشتری:</span>
                  <span className="font-bold">{transaction.personName}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">نوع تراکنش:</span>
                <span className="font-semibold text-emerald-700">
                  {transaction.type === 'income' ? 'دریافت / تسویه' : 'پرداخت'}
                </span>
              </div>
            </div>

            {/* Itemized Rows if Available (Buffet / Services) */}
            {transaction.receiptItems && transaction.receiptItems.length > 0 ? (
              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-2.5">
                <div className="flex justify-between font-bold text-[10px] text-slate-500 border-b border-slate-200 pb-1">
                  <span>شرح کالا / خدمات</span>
                  <div className="flex gap-4">
                    <span>تعداد</span>
                    <span>مبلغ</span>
                  </div>
                </div>
                {transaction.receiptItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] items-center">
                    <span className="truncate max-w-[120px] font-medium">{item.productName}</span>
                    <div className="flex gap-4 font-mono">
                      <span>{item.quantity}</span>
                      <span className="font-bold tabular-nums">{formatToman(item.totalPrice)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] py-1 border-b border-dashed border-slate-300 pb-2">
                <span className="text-slate-500 block text-[10px] mb-0.5">شرح:</span>
                <p className="font-medium text-slate-800">{transaction.description}</p>
              </div>
            )}

            {/* Total Section */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-sm font-extrabold text-slate-900">
                <span>مبلغ کل:</span>
                <span className="tabular-nums font-mono text-base">{formatToman(transaction.amount)} تومان</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>واریز به / تسویه با:</span>
                <span>{transaction.toAccountName || transaction.fromAccountName || 'صندوق'}</span>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="text-center pt-3 border-t border-dashed border-slate-300 space-y-1 text-[10px] text-slate-500">
              <p className="leading-relaxed">{settings.receiptFooter}</p>
              <div className="flex items-center justify-center gap-1 text-[9px] text-slate-400 pt-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                <span>پرداخت و ثبت نهایی شد</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
