import React, { useState } from 'react';
import {
  UserCheck,
  PlusCircle,
  Banknote,
  Briefcase,
  AlertCircle,
  History,
  Edit2,
  Trash2,
  X,
  Phone,
} from 'lucide-react';
import { Account, PayrollRecord, Staff, User } from '../types/index.ts';
import { formatJalaliReadable, formatToman, getJalaliDateString, normalizeDigits, parseTomanInput } from '../utils/jalali.ts';
import { ConfirmModal } from './ConfirmModal.tsx';
import { useLockBodyScroll } from '../utils/useLockBodyScroll.ts';



interface StaffViewProps {
  staff: Staff[];
  payrollRecords: PayrollRecord[];
  accounts: Account[];
  users?: User[];
  onOpenUserSwitch?: () => void;
  onPayStaff: (data: {
    staffId: string;
    amount: number;
    period: string;
    accountId: string;
    date: string;
    jalaliDate: string;
    notes?: string;
  }) => Promise<unknown>;
  onCreateStaff: (data: Partial<Staff>) => Promise<unknown>;
  onUpdateStaff?: (id: string, data: Partial<Staff>) => Promise<unknown>;
  onDeleteStaff?: (id: string) => Promise<unknown>;
  onRefresh: () => void;
}

export const StaffView: React.FC<StaffViewProps> = ({
  staff,
  payrollRecords,
  accounts,
  users = [],
  onPayStaff,
  onCreateStaff,
  onUpdateStaff,
  onDeleteStaff,
  onRefresh,
}) => {
  // Modal states
  const [payModalStaff, setPayModalStaff] = useState<Staff | null>(null);
  const [isNewStaffOpen, setIsNewStaffOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [staffToDelete, setStaffToDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Lock body scroll when any modal in StaffView is open
  useLockBodyScroll(
    payModalStaff !== null ||
    isNewStaffOpen ||
    editingStaff !== null ||
    staffToDelete !== null
  );


  // Pay form state
  const [payBaseSalary, setPayBaseSalary] = useState(0);
  const [payOvertimeHours, setPayOvertimeHours] = useState('');
  const [payOvertimeRateRaw, setPayOvertimeRateRaw] = useState('');
  const [payBonusRaw, setPayBonusRaw] = useState('');
  const [payDeductionRaw, setPayDeductionRaw] = useState('');
  const [payAmountRaw, setPayAmountRaw] = useState('');
  const [payPeriod, setPayPeriod] = useState('مهر ۱۴۰۴');
  const [payAccountId, setPayAccountId] = useState(accounts[0]?.id || '');
  const [payNotes, setPayNotes] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const calculateTotalSalary = () => {
    const base = payBaseSalary || 0;
    const otHours = parseFloat(normalizeDigits(payOvertimeHours)) || 0;
    const otRate = parseTomanInput(payOvertimeRateRaw) || 0;
    const otTotal = otHours * otRate;
    const bonus = parseTomanInput(payBonusRaw) || 0;
    const deduction = parseTomanInput(payDeductionRaw) || 0;
    const finalAmount = Math.max(0, base + otTotal + bonus - deduction);
    setPayAmountRaw(finalAmount.toString());
  };

  // New staff form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newRole, setNewRole] = useState('اپراتور');
  const [newSalaryRaw, setNewSalaryRaw] = useState('');
  const [newHireDate, setNewHireDate] = useState(getJalaliDateString());
  const [newNotes, setNewNotes] = useState('');
  const [newStaffLoading, setNewStaffLoading] = useState(false);
  const [newStaffError, setNewStaffError] = useState<string | null>(null);

  // Edit staff form state
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editSalaryRaw, setEditSalaryRaw] = useState('');
  const [editHireDate, setEditHireDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenEditModal = (s: Staff) => {
    setEditingStaff(s);
    setEditName(s.fullName);
    setEditPhone(s.phone || '');
    setEditRole(s.roleTitle);
    setEditSalaryRaw(s.monthlySalary.toString());
    setEditHireDate(s.hireDate || '');
    setEditNotes(s.notes || '');
    // Accurate boolean check
    setEditActive(s.active !== false && String(s.active) !== 'false');
    setEditError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff || !onUpdateStaff) return;
    const salary = parseTomanInput(editSalaryRaw);
    if (!editName.trim() || isNaN(salary) || salary <= 0) {
      setEditError('نام پرسنل و مبلغ حقوق الزامی است.');
      return;
    }
    try {
      setEditLoading(true);
      await onUpdateStaff(editingStaff.id, {
        fullName: editName.trim(),
        phone: editPhone.trim(),
        roleTitle: editRole.trim(),
        monthlySalary: salary,
        hireDate: editHireDate.trim(),
        notes: editNotes.trim(),
        active: Boolean(editActive),
      });
      setEditingStaff(null);
      onRefresh();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'خطا در ویرایش پرسنل');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteStaff = (id: string, name: string) => {
    setStaffToDelete({ id, name });
  };

  const handleConfirmDeleteStaff = async () => {
    if (!staffToDelete || !onDeleteStaff) return;
    try {
      setDeleteLoading(true);
      await onDeleteStaff(staffToDelete.id);
      setStaffToDelete(null);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleOpenPayModal = (s: Staff) => {
    setPayModalStaff(s);
    setPayBaseSalary(s.monthlySalary);
    setPayOvertimeHours('');
    const estHourlyRate = Math.round(s.monthlySalary / 200 / 1000) * 1000;
    setPayOvertimeRateRaw(estHourlyRate.toString());
    setPayBonusRaw('');
    setPayDeductionRaw('');
    setPayAmountRaw(s.monthlySalary.toString());
    setPayAccountId(accounts.find((a) => a.type === 'bank')?.id || accounts[0]?.id || '');
    setPayError(null);
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalStaff) return;
    const amount = parseTomanInput(payAmountRaw);
    if (amount <= 0) {
      setPayError('مبلغ پرداخت حقوق را وارد کنید.');
      return;
    }
    try {
      setPayLoading(true);
      setPayError(null);
      const otHours = parseFloat(normalizeDigits(payOvertimeHours)) || 0;
      const otRate = parseTomanInput(payOvertimeRateRaw) || 0;
      const otAmount = otHours * otRate;
      const bonus = parseTomanInput(payBonusRaw) || 0;
      const deduction = parseTomanInput(payDeductionRaw) || 0;
      const breakdownParts: string[] = [];
      if (otHours > 0) breakdownParts.push(`اضافه‌کاری (${otHours} ساعت: ${formatToman(otAmount)} تومان)`);
      if (bonus > 0) breakdownParts.push(`پاداش: ${formatToman(bonus)} تومان`);
      if (deduction > 0) breakdownParts.push(`کسورات: ${formatToman(deduction)} تومان`);

      const fullNotes = [
        payNotes.trim(),
        breakdownParts.length > 0 ? `[جزئیات: ${breakdownParts.join(' | ')}]` : '',
      ]
        .filter(Boolean)
        .join(' - ');

      await onPayStaff({
        staffId: payModalStaff.id,
        amount,
        period: payPeriod.trim(),
        accountId: payAccountId,
        date: new Date().toISOString(),
        jalaliDate: getJalaliDateString(),
        notes: fullNotes,
      });
      setPayModalStaff(null);
      onRefresh();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : 'خطا در ثبت پرداخت حقوق');
    } finally {
      setPayLoading(false);
    }
  };

  const handleCreateStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newSalaryRaw) {
      setNewStaffError('نام و مبلغ حقوق الزامی است.');
      return;
    }
    try {
      setNewStaffLoading(true);
      setNewStaffError(null);
      await onCreateStaff({
        fullName: newName.trim(),
        phone: newPhone.trim(),
        roleTitle: newRole.trim(),
        monthlySalary: parseTomanInput(newSalaryRaw),
        hireDate: newHireDate,
        notes: newNotes.trim() || undefined,
        active: true,
      });
      setIsNewStaffOpen(false);
      setNewName('');
      setNewPhone('');
      setNewSalaryRaw('');
      setNewNotes('');
      onRefresh();
    } catch (err: unknown) {
      setNewStaffError(err instanceof Error ? err.message : 'خطا در ثبت پرسنل');
    } finally {
      setNewStaffLoading(false);
    }
  };

  const totalMonthlySalaries = staff.reduce((sum, s) => sum + s.monthlySalary, 0);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            مدیریت پرسنل، اپراتورها و حقوق و دستمزد
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            فهرست کارکنان گیم‌نت، ثبت کارکرد، محاسبه اضافه‌کاری و فیش پرداخت حقوق
          </p>
        </div>
        <button
          onClick={() => setIsNewStaffOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#2596BE] text-white rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#1E7E9E] transition-all cursor-pointer shadow-xs"
        >
          <PlusCircle className="w-4 h-4" />
          <span>افزودن پرسنل جدید</span>
        </button>
      </div>

      {/* Overview Metric Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">پرسنل فعال گیم‌نت</span>
              <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                {staff.filter((s) => s.active !== false && String(s.active) !== 'false').length} نفر
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Banknote className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs text-slate-500 block">مجموع حقوق ماهانه مصوب</span>
              <span className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                {formatToman(totalMonthlySalaries)} تومان
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Staff Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {staff.map((s) => {
          // Strictly compute active status
          const isActiveStaff = s.active !== false && String(s.active) !== 'false';

          return (
            <div
              key={s.id}
              className={`p-5 rounded-2xl bg-white dark:bg-[#111C33] border shadow-xs flex flex-col justify-between space-y-4 transition-all ${
                isActiveStaff
                  ? 'border-slate-200 dark:border-slate-800 hover:border-[#2596BE]/40'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 opacity-75'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                      {s.fullName}
                    </h3>
                    <span className="text-xs text-[#2596BE] font-medium flex items-center gap-1 mt-0.5">
                      <Briefcase className="w-3.5 h-3.5" />
                      {s.roleTitle}
                    </span>
                  </div>

                  {/* Toggle Active Badge */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (onUpdateStaff) {
                        await onUpdateStaff(s.id, { active: !isActiveStaff });
                        onRefresh();
                      }
                    }}
                    title="کلیک برای تغییر وضعیت فعال/غیرفعال"
                    className={`text-[10px] px-2.5 py-1 rounded-lg font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                      isActiveStaff
                        ? 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:hover:bg-rose-900/50 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${isActiveStaff ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span>{isActiveStaff ? 'فعال' : 'غیرفعال'}</span>
                  </button>
                </div>

                {s.phone && (
                  <div className="text-xs text-slate-500 flex items-center gap-2 font-mono">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{s.phone}</span>
                  </div>
                )}

                {/* Linked System User Indicator */}
                {(() => {
                  const linked = users.find(
                    (u) =>
                      (s.linkedUserId && u.id === s.linkedUserId) ||
                      (s.phone && u.phone && u.phone === s.phone) ||
                      u.fullName.includes(s.fullName) ||
                      s.fullName.includes(u.fullName.split(' ')[0])
                  );
                  return linked ? (
                    <div className="flex items-center justify-between text-[11px] bg-slate-50 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500">کاربر متصل:</span>
                      <span className="font-bold text-[#2596BE]">
                        {linked.username} ({linked.role === 'admin' ? 'ادمین' : 'اپراتور'})
                      </span>
                    </div>
                  ) : null;
                })()}

                {s.notes && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {s.notes}
                  </p>
                )}
              </div>

              {/* Salary and Action Box */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs text-slate-500">حقوق ماهانه:</span>
                  <span className="text-base font-black text-slate-900 dark:text-white tabular-nums">
                    {formatToman(s.monthlySalary)} تومان
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenPayModal(s)}
                    className="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-[#2596BE] text-slate-700 dark:text-slate-300 hover:text-white font-bold text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Banknote className="w-4 h-4" />
                    <span>پرداخت حقوق</span>
                  </button>
                  <button
                    onClick={() => handleOpenEditModal(s)}
                    title="ویرایش پرسنل"
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-[#2596BE] hover:border-[#2596BE]/40 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {onDeleteStaff && (
                    <button
                      onClick={() => handleDeleteStaff(s.id, s.fullName)}
                      title="حذف پرسنل"
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:border-rose-300 dark:hover:border-rose-900 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Payroll History Table */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-[#2596BE]" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            تاریخچه آخرین پرداخت‌های حقوق و دستمزد
          </h2>
        </div>

        {payrollRecords.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            تا کنون پرداختی برای حقوق ثبت نشده است.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-2.5 px-3">نام پرسنل</th>
                  <th className="py-2.5 px-3">دوره حقوقی</th>
                  <th className="py-2.5 px-3">پرداخت از حساب</th>
                  <th className="py-2.5 px-3">مبلغ پرداختی (تومان)</th>
                  <th className="py-2.5 px-3">تاریخ پرداخت</th>
                  <th className="py-2.5 px-3">جزئیات و یادداشت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {payrollRecords.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                      {p.staffName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                      {p.period}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{p.accountName}</td>
                    <td className="py-2.5 px-3 font-black tabular-nums text-rose-600 dark:text-rose-400">
                      {formatToman(p.amount)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">
                      {formatJalaliReadable(p.paymentDate, false)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 truncate max-w-xs">{p.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pay Salary Modal */}
      {payModalStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                پرداخت حقوق به {payModalStaff.fullName}
              </h2>
              <button
                onClick={() => setPayModalStaff(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePaySubmit} className="p-5 space-y-3.5">
              {payError && (
                <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-red-50 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{payError}</span>
                </div>
              )}

              {/* Base Salary Banner */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">حقوق ماهانه مصوب:</span>
                <span className="font-bold text-slate-900 dark:text-white tabular-nums font-mono">
                  {formatToman(payBaseSalary)} تومان
                </span>
              </div>

              {/* Overtime & Adjustments Strip */}
              <div className="p-3 rounded-xl bg-[#2596BE]/10 border border-[#2596BE]/25 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#2596BE]">محاسبه اضافه‌کاری و تعدیلات:</span>
                  <button
                    type="button"
                    onClick={calculateTotalSalary}
                    className="text-[11px] font-bold text-[#2596BE] hover:underline cursor-pointer"
                  >
                    محاسبه خودکار
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                      ساعت اضافه‌کاری
                    </label>
                    <input
                      type="text"
                      value={payOvertimeHours}
                      onChange={(e) => setPayOvertimeHours(e.target.value)}
                      placeholder="ساعت"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-0.5">
                      نرخ هر ساعت (تومان)
                    </label>
                    <input
                      type="text"
                      value={payOvertimeRateRaw ? Number(payOvertimeRateRaw).toLocaleString('en-US') : ''}
                      onChange={(e) => setPayOvertimeRateRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                      placeholder="نرخ ساعت"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-emerald-600 dark:text-emerald-400 mb-0.5">
                      + پاداش (تومان)
                    </label>
                    <input
                      type="text"
                      value={payBonusRaw ? Number(payBonusRaw).toLocaleString('en-US') : ''}
                      onChange={(e) => setPayBonusRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-rose-500 mb-0.5">
                      - کسورات / مساعده (تومان)
                    </label>
                    <input
                      type="text"
                      value={payDeductionRaw ? Number(payDeductionRaw).toLocaleString('en-US') : ''}
                      onChange={(e) => setPayDeductionRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                      placeholder="0"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    مبلغ نهایی پرداختی (تومان)
                  </label>
                  <button
                    type="button"
                    onClick={calculateTotalSalary}
                    className="text-[10px] text-[#2596BE] font-bold hover:underline cursor-pointer"
                  >
                    به‌روزرسانی جمع کل
                  </button>
                </div>
                <input
                  type="text"
                  value={payAmountRaw ? Number(payAmountRaw).toLocaleString('en-US') : ''}
                  onChange={(e) => setPayAmountRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  placeholder="مبلغ نهایی"
                  className="w-full px-3 py-2.5 rounded-xl border border-[#2596BE] bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-base font-bold tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  بابت دوره
                </label>
                <input
                  type="text"
                  value={payPeriod}
                  onChange={(e) => setPayPeriod(e.target.value)}
                  placeholder="مثال: حقوق مهر ۱۴۰۴"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  پرداخت از حساب یا صندوق
                </label>
                <select
                  value={payAccountId}
                  onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  یادداشت و توضیحات فیش
                </label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="توضیحات اختیاری..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPayModalStaff(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={payLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {payLoading ? 'در حال ثبت...' : 'ثبت پرداخت حقوق'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Staff Modal */}
      {isNewStaffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                ثبت پرسنل جدید
              </h2>
              <button
                onClick={() => setIsNewStaffOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaffSubmit} className="p-5 space-y-3.5">
              {newStaffError && (
                <div className="flex items-center gap-2 p-3 text-xs rounded-xl bg-red-50 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{newStaffError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام و نام خانوادگی
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="مثال: علیرضا رضایی"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    سمت شغلی
                  </label>
                  <input
                    type="text"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    placeholder="اپراتور شیفت عصر"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    شماره تماس
                  </label>
                  <input
                    type="text"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="0912..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  حقوق پایه ماهانه (تومان)
                </label>
                <input
                  type="text"
                  value={newSalaryRaw ? Number(newSalaryRaw).toLocaleString('en-US') : ''}
                  onChange={(e) => setNewSalaryRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  placeholder="14,000,000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  یادداشت و ساعت شیفت
                </label>
                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="ساعت کاری از ۱۶ الی ۲۴..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewStaffOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={newStaffLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {newStaffLoading ? 'در حال ثبت...' : 'ثبت پرسنل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-[#111C33] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-[#2596BE]" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  ویرایش مشخصات: {editingStaff.fullName}
                </h3>
              </div>
              <button
                onClick={() => setEditingStaff(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  نام و نام خانوادگی
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    سمت شغلی
                  </label>
                  <input
                    type="text"
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    شماره تماس
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  حقوق ماهانه (تومان)
                </label>
                <input
                  type="text"
                  value={editSalaryRaw ? Number(editSalaryRaw).toLocaleString('en-US') : ''}
                  onChange={(e) => setEditSalaryRaw(normalizeDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  یادداشت و شیفت
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs"
                />
              </div>

              {/* Status Checkbox */}
              <div className="flex items-center gap-2 pt-1 p-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                <input
                  type="checkbox"
                  id="editActive"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  className="w-4 h-4 rounded text-[#2596BE] focus:ring-[#2596BE]"
                />
                <label htmlFor="editActive" className="text-xs text-slate-700 dark:text-slate-300 font-bold cursor-pointer">
                  پرسنل فعال است (در صورت برداشتن تیک، وضعیت غیرفعال می‌شود)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingStaff(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={editLoading}
                  className="px-5 py-2 bg-[#2596BE] hover:bg-[#1E7E9E] text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  {editLoading ? 'در حال ثبت...' : 'ذخیره تغییرات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Staff Deletion */}
      <ConfirmModal
        isOpen={!!staffToDelete}
        title="حذف پرسنل"
        message={`آیا مطمئن هستید که می‌خواهید پرسنل "${staffToDelete?.name}" را حذف کنید؟`}
        confirmText="بله، حذف شود"
        cancelText="انصراف"
        variant="danger"
        isLoading={deleteLoading}
        onConfirm={handleConfirmDeleteStaff}
        onClose={() => setStaffToDelete(null)}
      />
    </div>
  );
};
