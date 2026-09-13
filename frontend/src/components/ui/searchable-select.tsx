import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  sublabel?: string;
  badge?: string;
  disabled?: boolean;
}

export interface SearchableSelectProps {
  value?: string | null;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
  allowClear?: boolean;
  emptyMessage?: string;
  size?: 'sm' | 'default';
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Ketik untuk mencari...',
  disabled = false,
  className = '',
  triggerClassName = '',
  dropdownClassName = '',
  allowClear = false,
  emptyMessage = 'Tidak ada pilihan yang cocok',
  size = 'default',
}: SearchableSelectProps) {
  const listboxId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; placeAbove: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    placeAbove: false,
  });

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Find currently selected option
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase().trim();
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(query);
      const matchSub = opt.sublabel ? opt.sublabel.toLowerCase().includes(query) : false;
      const matchBadge = opt.badge ? opt.badge.toLowerCase().includes(query) : false;
      return matchLabel || matchSub || matchBadge;
    });
  }, [options, searchQuery]);

  // Calculate dropdown position
  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropdownHeight = 280; // approximate max dropdown height
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < dropdownHeight && rect.top > spaceBelow;
    const dropdownWidth = Math.min(
      Math.max(rect.width, 240),
      Math.max(window.innerWidth - 16, 240),
    );

    setPosition({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - dropdownWidth - 8)),
      width: dropdownWidth,
      placeAbove,
    });
  };

  const handleOpen = () => {
    if (disabled) return;
    updatePosition();
    setSearchQuery('');
    setHighlightedIndex(-1);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        handleClose();
      }
    };

    const handleScrollOrResize = () => {
      if (isOpen) {
        updatePosition();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  // Focus search input when open
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
      });
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    handleClose();
    triggerRef.current?.focus();
  };

  const handleClear = () => {
    onChange('');
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
      triggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (filteredOptions.length === 1) {
        handleSelect(filteredOptions[0]);
      }
    }
  };

  return (
    <div className={cn('relative inline-block w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (isOpen ? handleClose() : handleOpen())}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listboxId : undefined}
        className={cn(
          'group flex w-full items-center justify-between gap-2 rounded-md border border-input bg-white px-2.5 py-1.5 text-left text-xs font-semibold shadow-xs transition-colors outline-hidden hover:bg-slate-50 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' && 'h-7 py-1 px-2 text-[11px]',
          size === 'default' && 'h-8 sm:h-9',
          isOpen && 'border-[#326dc8] ring-2 ring-[#326dc8]/20',
          triggerClassName
        )}
      >
        <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
          {selectedOption ? (
            <span className="truncate text-slate-800">
              {selectedOption.label}
              {selectedOption.sublabel && (
                <span className="ml-1.5 font-normal text-slate-400">
                  {selectedOption.sublabel}
                </span>
              )}
            </span>
          ) : (
            <span className="truncate text-muted-foreground font-normal">
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 text-slate-400 transition-transform duration-200',
              isOpen && 'rotate-180 text-[#326dc8]'
            )}
          />
        </div>
      </button>
      {allowClear && selectedOption && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-7 top-1/2 z-10 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Hapus pilihan"
          title="Hapus pilihan"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: position.placeAbove ? undefined : position.top,
              bottom: position.placeAbove ? window.innerHeight - position.top : undefined,
              left: position.left,
              width: position.width,
              zIndex: 99999,
            }}
            className={cn(
              'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl animate-in fade-in-0 zoom-in-95 duration-100',
              dropdownClassName
            )}
            onKeyDown={handleKeyDown}
            role="presentation"
          >
            {/* Search Input Box */}
            <div className="flex items-center border-b border-slate-100 bg-slate-50 px-2.5 py-1.5">
              <Search className="mr-2 h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-xs outline-hidden placeholder:text-slate-400 text-slate-800"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="rounded p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* List of Options */}
            <div
              ref={listRef}
              id={listboxId}
              role="listbox"
              className="erp-scroll-table max-h-56 overflow-y-auto p-1 text-xs"
            >
              {filteredOptions.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  {emptyMessage}
                </div>
              ) : (
                filteredOptions.map((option, index) => {
                  const isSelected = option.value === value;
                  const isHighlighted = index === highlightedIndex;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={option.disabled}
                      onClick={() => handleSelect(option)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      role="option"
                      aria-selected={isSelected}
                      className={cn(
                        'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition-colors',
                        isHighlighted && 'bg-blue-50 text-[#1e40af]',
                        !isHighlighted && isSelected && 'bg-blue-50/60 font-semibold text-[#1e40af]',
                        !isHighlighted && !isSelected && 'text-slate-700 hover:bg-slate-50',
                        option.disabled && 'cursor-not-allowed opacity-40'
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate font-medium">{option.label}</span>
                        {option.sublabel && (
                          <span className="truncate text-[11px] text-slate-400">
                            {option.sublabel}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {option.badge && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                            {option.badge}
                          </span>
                        )}
                        {isSelected && (
                          <Check className="h-3.5 w-3.5 text-[#326dc8]" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default SearchableSelect;
