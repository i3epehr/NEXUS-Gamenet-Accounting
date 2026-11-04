import React from 'react';
import { Bell, X, ExternalLink, Clock, Gamepad2 } from 'lucide-react';

export interface ReservationGroupAlert {
  key: string;
  titles: string[];
  displayTitle: string;
  customerName: string;
  startTime: string;
  minutesRemaining: number;
  reservationIds: string[];
}

interface ReservationAlertBannerProps {
  alerts: ReservationGroupAlert[];
  onDismiss: (key: string) => void;
  onNavigateToReservations: () => void;
}

export const ReservationAlertBanner: React.FC<ReservationAlertBannerProps> = ({
  alerts,
  onDismiss,
  onNavigateToReservations,
}) => {
  if (!alerts || alerts.length === 0) return null;

  return (
    <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 flex flex-col gap-2.5 pointer-events-auto animate-in slide-in-from-top-4 duration-300">
      {alerts.map((alert) => (
        <div
          key={alert.key}
          className="relative overflow-hidden rounded-2xl border border-amber-400/60 dark:border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 dark:from-amber-950/90 dark:via-orange-950/80 dark:to-amber-950/90 backdrop-blur-md shadow-2xl p-4 text-slate-900 dark:text-white"
        >
          {/* Subtle glowing animated top border */}
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500 animate-pulse" />

          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
              </span>
              <div className="flex items-center gap-1.5 font-black text-xs text-amber-700 dark:text-amber-400">
                <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-bounce" />
                <span>یادآوری رزرو نوبت گیم‌نت</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onDismiss(alert.key)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="بستن این پیام"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body Content */}
          <div className="mt-2.5 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
              <Gamepad2 className="w-4 h-4 text-[#2596BE] shrink-0" />
              <span className="line-clamp-2">
                سیستم‌های رزرو شده: <span className="text-[#2596BE] font-black">{alert.displayTitle}</span>
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 pt-0.5">
              <span>
                مشتری: <strong className="text-slate-900 dark:text-white">{alert.customerName}</strong>
              </span>
              <div className="flex items-center gap-1 font-mono font-bold text-amber-700 dark:text-amber-300">
                <Clock className="w-3.5 h-3.5" />
                <span>ساعت {alert.startTime}</span>
                <span className="text-[10px] font-sans font-normal text-amber-800 dark:text-amber-400">
                  ({alert.minutesRemaining <= 0 ? 'هم اکنون!' : `${alert.minutesRemaining} دقیقه دیگر`})
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 pt-2.5 border-t border-amber-200/50 dark:border-amber-800/50 flex items-center justify-end gap-2 text-xs">
            <button
              type="button"
              onClick={onNavigateToReservations}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#2596BE] hover:bg-[#1d7a9b] text-white font-bold transition-all cursor-pointer shadow-xs text-[11px]"
            >
              <span>مشاهده میزها</span>
              <ExternalLink className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => onDismiss(alert.key)}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all cursor-pointer shadow-xs text-[11px]"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

