import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  variant?: ButtonVariant;
}

export function Button({ children, loading = false, variant = "primary", disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      className={`button button--${variant}`}
      type={type}
      disabled={disabled === true || loading}
      aria-busy={loading ? "true" : undefined}
      {...props}
    >
      {children}
    </button>
  );
}
