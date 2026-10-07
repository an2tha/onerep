import type { ReactNode } from "react";
import { Check } from "@phosphor-icons/react";
import { tr } from "@repo/ui/i18n";

export function ProgrammeField({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="programmes-field">
      <span>{tr(label)}</span>
      {children}
      {hint && <small>{tr(hint)}</small>}
    </label>
  );
}

export function ProgrammeChoices<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="programmes-choices">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className="programmes-choice onboarding-chat-chip"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {tr(option.label)}
          {value === option.value && <Check size={16} aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

export function ProgrammeNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <ProgrammeField label={label}>
      <input
        required
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) =>
          onChange(event.target.value === "" ? NaN : Number(event.target.value))
        }
      />
    </ProgrammeField>
  );
}

export const commaList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
