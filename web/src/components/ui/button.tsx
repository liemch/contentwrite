import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  primary:
    "text-white bg-gradient-to-br from-[var(--accent)] to-[var(--accent-bright)] shadow-[0_4px_14px_var(--accent-glow)] hover:brightness-[1.03] hover:shadow-[0_6px_20px_var(--accent-glow)] focus-visible:ring-[var(--accent)] active:scale-[0.98]",
  secondary:
    "bg-white/90 text-[var(--ink)] border border-[var(--line)] shadow-sm hover:bg-[var(--surface-muted)] hover:border-[var(--line-strong)] active:scale-[0.98]",
  ghost:
    "text-[var(--ink-muted)] hover:bg-white/80 hover:text-[var(--ink)] hover:shadow-sm active:scale-[0.98]",
  danger:
    "bg-gradient-to-br from-[var(--danger)] to-[#dc2626] text-white shadow-sm hover:brightness-[1.03] active:scale-[0.98]",
  success:
    "bg-gradient-to-br from-[var(--success)] to-[#059669] text-white shadow-sm hover:brightness-[1.03] active:scale-[0.98]",
};

const sizes: Record<Size, string> = {
  sm: "px-3.5 py-1.5 text-xs rounded-full",
  md: "px-5 py-2.5 text-sm rounded-xl",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Hiển thị spinner nhỏ khi đang xử lý */
  busy?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  busy = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:transform-none ${variants[variant]} ${sizes[size]} ${busy ? "btn-busy" : ""} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      <span className="btn-label">{children}</span>
    </button>
  );
}
