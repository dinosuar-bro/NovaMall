import type { ReactNode } from "react";

interface StatusMessageProps {
  children: ReactNode;
}

export function StatusMessage({ children }: StatusMessageProps) {
  return <div className="status-message" role="status">{children}</div>;
}
