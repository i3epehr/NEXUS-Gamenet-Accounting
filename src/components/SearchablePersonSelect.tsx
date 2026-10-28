import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, User, Wallet, Check, X, ChevronDown } from 'lucide-react';
import { Person } from '../types/index.ts';
import { formatToman } from '../utils/jalali.ts';

export interface SearchablePersonSelectProps {
  persons: Person[];
  selectedPersonId?: string;
  onSelectPerson: (person: Person | null) => void;
  // Manual new customer mode
  allowManualNew?: boolean;
  isManualNew?: boolean;
  manualCustomerName?: string;
  manualCustomerPhone?: string;
  onManualToggle?: (isManual: boolean) => void;
  onManualNameChange?: (name: string) => void;
  onManualPhoneChange?: (phone: string) => void;
  // Labels & placeholders
  label?: string;
  placeholder?: string;
  emptyLabel?: string;
  filterType?: 'all' | 'customer' | 'staff' | 'supplier';
  showBalanceBadge?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const SearchablePersonSelect: React.FC<SearchablePersonSelectProps> = ({
  persons = [],
  selectedPersonId = '',
  onSelectPerson,
  allowManualNew = false,
  isManualNew = false,
  manualCustomerName = '',
  manualCustomerPhone = '',
  onManualToggle,
  onManualNameChange,
  onManualPhoneChange,
  label,
  placeholder = 'جستجوی نام یا شماره تماس...',
  emptyLabel = 'مشتری آزاد',
  filterType = 'all',
  showBalanceBadge = true,
  required = false,
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter persons
  const filteredPersons = useMemo(() => {
    const list = filterType === 'all' ? persons : persons.filter((p) => p.type === filterType);
    if (!searchTerm.trim()) return list;

    const query = searchTerm.trim().toLowerCase();
    return list.filter((p) => {
      const matchName = p.name.toLowerCase().includes(query);
      const matchPhone = p.phone && p.phone.includes(query);
      const matchSmart = p.smartLaunchId && p.smartLaunchId.toLowerCase().includes(query);
      const matchNational = p.nationalId && p.nationalId.includes(query);
      return matchName || matchPhone || matchSmart || matchNational;
    });
  }, [persons, filterType, searchTerm]);

  const selectedPerson = useMemo(() => {
    if (!selectedPersonId) return null;
    return persons.find((p) => p.id === selectedPersonId) || null;
  }, [persons, selectedPersonId]);

  const handleSelect = (person: Person | null) => {
    onSelectPerson(person);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectPerson(null);
    setSearchTerm('');
  };

  const handleSwitchToManual = () => {
    if (onManualToggle) onManualToggle(true);
    setIsOpen(false);
  };

  const handleSwitchToExisting = () => {
    if (onManualToggle) onManualToggle(false);
  };

  return (
    <div className={`space-y-1.5 ${className}`} ref={containerRef}>
      {/* Header with Label and Manual Toggle */}
      {(label || allowManualNew) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-[#2596BE]" />
              <span>{label}</span>
              {required && <span className="text-rose-500">*</span>}
            </label>
          )}

          {allowManualNew && onManualToggle && (
            <div className="flex items-center gap-1 text-[11px] bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={handleSwitchToExisting}
                className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                  !isManualNew
                    ? 'bg-[#2596BE] text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                انتخاب مشتری
              </button>
              <button
                type="button"
                onClick={handleSwitchToManual}
                className={`px-2.5 py-0.5 rounded-md font-bold transition-all cursor-pointer ${
                  isManualNew
                    ? 'bg-[#2596BE] text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                مشتری جدید
              </button>
            </div>
          )}
        </div>
      )}

      {/* Manual New Customer Input Mode */}
      {allowManualNew && isManualNew ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <input
              type="text"
              value={manualCustomerName}
              onChange={(e) => onManualNameChange && onManualNameChange(e.target.value)}
              placeholder="نام مشتری *"
              required={required}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-[#2596BE]/30 focus:border-[#2596BE]"
            />
          </div>
          <div>
            <input
              type="text"
              value={manualCustomerPhone}
              onChange={(e) => onManualPhoneChange && onManualPhoneChange(e.target.value)}
              placeholder="شماره تماس (اختیاری)"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-mono focus:ring-2 focus:ring-[#2596BE]/30 focus:border-[#2596BE]"
            />
          </div>
        </div>
      ) : (
        /* Searchable Select Dropdown Mode */
        <div className="relative">
          <div
            onClick={() => {
              if (disabled) return;
              setIsOpen(true);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all cursor-pointer bg-white dark:bg-slate-900 text-xs ${
              isOpen
                ? 'border-[#2596BE] ring-2 ring-[#2596BE]/20'
                : 'border-slate-300 dark:border-slate-700 hover:border-[#2596BE]/60'
            } ${disabled ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800' : ''}`}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {isOpen ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={selectedPerson ? selectedPerson.name : placeholder}
                  className="w-full bg-transparent border-none outline-none text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                  autoFocus
                />
              ) : selectedPerson ? (
                <div className="flex items-center gap-2 truncate">
                  <span className="font-bold text-slate-900 dark:text-white truncate">
                    {selectedPerson.name}
                  </span>
                  {selectedPerson.phone && (
                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">
                      ({selectedPerson.phone})
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-slate-400 font-normal truncate">{emptyLabel}</span>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0 mr-1">
              {selectedPerson && !disabled && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title="حذف انتخاب"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Floating Results Dropdown */}
          {isOpen && (
            <div className="absolute z-50 top-full mt-1.5 right-0 left-0 bg-white dark:bg-[#111C33] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
              {/* Scrollable List */}
              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 p-1">
                {/* Option for Unassigned / Free Customer */}
                <div
                  onClick={() => handleSelect(null)}
                  className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    !selectedPersonId
                      ? 'bg-[#2596BE]/10 text-[#2596BE] font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{emptyLabel}</span>
                  </div>
                  {!selectedPersonId && <Check className="w-3.5 h-3.5 text-[#2596BE]" />}
                </div>

                {filteredPersons.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    مشتری با این مشخصات یافت نشد
                  </div>
                ) : (
                  filteredPersons.map((p) => {
                    const isSelected = p.id === selectedPersonId;
                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelect(p)}
                        className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#2596BE]/10 text-[#2596BE] font-bold'
                            : 'hover:bg-slate-100 dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <User className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#2596BE]' : 'text-slate-400'}`} />
                          <div className="truncate">
                            <span className="font-semibold block truncate">{p.name}</span>
                            {p.phone && <span className="text-[10px] text-slate-400 font-mono">{p.phone}</span>}
                          </div>
                        </div>

                        {/* Balance Badge (only positive wallet credit, never debt) */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {showBalanceBadge && p.currentBalance < 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                              کیف پول: {formatToman(Math.abs(p.currentBalance))}
                            </span>
                          )}
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#2596BE]" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selected Person Wallet Badge (Only if has wallet credit, no debt) */}
      {!isManualNew && selectedPerson && showBalanceBadge && selectedPerson.currentBalance < 0 && (
        <div className="flex items-center gap-2 pt-0.5 text-[11px]">
          <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
            <Wallet className="w-3 h-3" />
            کیف پول: +{formatToman(Math.abs(selectedPerson.currentBalance))} تومان
          </span>
        </div>
      )}
    </div>
  );
};
