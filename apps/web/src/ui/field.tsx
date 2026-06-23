import type { InputHTMLAttributes } from "react";
import { useId } from "react";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  help?: string;
  error?: string;
}

export function Field({ label, help, error, id, ...inputProps }: FieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const describedBy = error !== undefined ? errorId : help !== undefined ? helpId : undefined;

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} aria-invalid={error !== undefined} aria-describedby={describedBy} {...inputProps} />
      {help !== undefined ? <small id={helpId}>{help}</small> : null}
      {error !== undefined ? <small id={errorId}>{error}</small> : null}
    </div>
  );
}
