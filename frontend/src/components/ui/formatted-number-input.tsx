import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  formatIndonesianNumberInput,
  formatThousand,
  parseFormattedNumber,
  parseIndonesianNumberInput,
} from '@/utils/format';

export interface FormattedNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix'> {
  value: number | string | null | undefined;
  onChange: (value: number) => void;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  allowDecimal?: boolean;
  min?: number;
  max?: number;
}

export const FormattedNumberInput = React.forwardRef<HTMLInputElement, FormattedNumberInputProps>(
  (
    {
      value,
      onChange,
      prefix,
      suffix,
      allowDecimal = false,
      min,
      max,
      className,
      placeholder = '0',
      disabled,
      onFocus,
      onBlur,
      ...props
    },
    forwardedRef
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [displayVal, setDisplayVal] = useState<string>('');
    const [isFocused, setIsFocused] = useState(false);

    // Sync external value with display
    useEffect(() => {
      if (value === null || value === undefined || value === '') {
        setDisplayVal('');
        return;
      }
      const num = typeof value === 'number' ? value : parseFormattedNumber(value);
      if (isNaN(num)) {
        setDisplayVal('');
      } else {
        // If the user is currently typing and displayVal parses to the same number, avoid jumping display
        setDisplayVal((currentDisplay) => {
          if (isFocused && parseFormattedNumber(currentDisplay) === num) {
            return currentDisplay;
          }
          return formatThousand(num, allowDecimal);
        });
      }
    }, [value, isFocused, allowDecimal]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawText = e.target.value;
      const cursorPos = e.target.selectionStart ?? rawText.length;

      // Count digits before cursor in raw input
      let digitsBefore = 0;
      for (let i = 0; i < cursorPos; i++) {
        if (/\d/.test(rawText[i])) {
          digitsBefore++;
        }
      }

      // If empty or just minus/space
      if (!rawText.trim() || rawText === '-') {
        setDisplayVal(rawText.trim());
        onChange(0);
        return;
      }

      // Parse pure numeric value
      let numericVal = parseIndonesianNumberInput(rawText, allowDecimal);

      // Enforce bounds if provided
      if (min !== undefined && numericVal < min) {
        // don't hard clamp while typing if typing lower digits, but we can respect zero
      }
      if (max !== undefined && numericVal > max) {
        numericVal = max;
      }

      const formatted = formatIndonesianNumberInput(rawText, allowDecimal);
      setDisplayVal(formatted);
      onChange(numericVal);

      // Restore cursor position based on digit count
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;

        let newCursor = 0;
        let countedDigits = 0;
        for (let i = 0; i < formatted.length; i++) {
          if (/\d/.test(formatted[i])) {
            countedDigits++;
          }
          if (countedDigits >= digitsBefore) {
            newCursor = i + 1;
            break;
          }
        }
        if (countedDigits < digitsBefore) {
          newCursor = formatted.length;
        }
        input.setSelectionRange(newCursor, newCursor);
      });
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      if (parseIndonesianNumberInput(displayVal, allowDecimal) === 0) {
        setDisplayVal('');
      }
      if (onFocus) onFocus(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      // Format cleanly on blur
      if (displayVal) {
        const num = parseIndonesianNumberInput(displayVal, allowDecimal);
        let finalNum = num;
        if (min !== undefined && finalNum < min) finalNum = min;
        if (max !== undefined && finalNum > max) finalNum = max;
        setDisplayVal(formatThousand(finalNum, allowDecimal));
        onChange(finalNum);
      }
      if (onBlur) onBlur(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (props.onKeyDown) props.onKeyDown(e);
    };

    return (
      <div
        className={cn(
          'relative flex items-center w-full rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]',
          disabled && 'cursor-not-allowed opacity-50 bg-slate-50',
          className
        )}
      >
        {prefix && (
          <span className="pointer-events-none pl-2.5 pr-1 text-xs font-semibold text-slate-400 select-none">
            {prefix}
          </span>
        )}
        <input
          {...props}
          ref={(node) => {
            inputRef.current = node;
            if (typeof forwardedRef === 'function') {
              forwardedRef(node);
            } else if (forwardedRef) {
              forwardedRef.current = node;
            }
          }}
          type="text"
          inputMode={allowDecimal ? "decimal" : "numeric"}
          disabled={disabled}
          placeholder={placeholder}
          value={displayVal}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className={cn(
            'h-full w-full bg-transparent px-2 py-1 text-right text-xs font-medium outline-hidden placeholder:text-muted-foreground disabled:cursor-not-allowed',
            !prefix && 'pl-2.5',
            !suffix && 'pr-2.5'
          )}
        />
        {suffix && (
          <span className="pointer-events-none pr-2.5 pl-1 text-xs font-semibold text-slate-400 select-none">
            {suffix}
          </span>
        )}
      </div>
    );
  }
);

FormattedNumberInput.displayName = 'FormattedNumberInput';
export default FormattedNumberInput;
