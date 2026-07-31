import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const fieldClass =
  "mt-2 w-full rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink)] shadow-sm transition focus:border-[var(--accent)] focus:outline-none focus:ring-4 focus:ring-[var(--accent-glow)]";

export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-[var(--ink)]">
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${fieldClass} ${className ?? ""}`} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${fieldClass} ${className ?? ""}`} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${fieldClass} ${className ?? ""}`} {...props} />;
}

export function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-[var(--ink-faint)]">{children}</p>;
}
