import React, { useEffect, useState } from 'react';

type NativeInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'inputMode'
>;

interface NumberFieldProps extends NativeInputProps {
  value: number;
  /** Called while typing whenever the text is a valid number (range is not enforced yet). */
  onValueChange: (value: number) => void;
  /** Called on blur with the final value, clamped to min/max. */
  onCommit?: (value: number) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
}

function clamp(value: number, min?: number, max?: number): number {
  let v = value;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

function parse(text: string): number | null {
  if (text === '' || text === '.') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Text-based numeric input that can be freely cleared and retyped.
 * Unlike a controlled `<input type="number">` driven by `Number(value)`, it
 * doesn't snap to 0 or a minimum mid-typing; min/max are applied on blur.
 */
export const NumberField: React.FC<NumberFieldProps> = ({
  value,
  onValueChange,
  onCommit,
  min,
  max,
  allowDecimal = false,
  onBlur,
  onFocus,
  ...rest
}) => {
  const [text, setText] = useState(() => String(value));

  // Reflect external updates (templates, rebuilt schedules) without fighting the user's typing.
  useEffect(() => {
    setText((current) => (parse(current) === value ? current : String(value)));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let next = e.target.value.replace(/[,\s₹]/g, '');
    next = allowDecimal ? next.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1') : next.replace(/\D/g, '');
    setText(next);
    const parsed = parse(next);
    if (parsed !== null) onValueChange(parsed);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const parsed = parse(text);
    const finalValue = clamp(parsed ?? value, min, max);
    setText(String(finalValue));
    if (finalValue !== value) onValueChange(finalValue);
    onCommit?.(finalValue);
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      value={text}
      onChange={handleChange}
      onFocus={(e) => {
        e.target.select();
        onFocus?.(e);
      }}
      onBlur={handleBlur}
    />
  );
};
