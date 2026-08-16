"use client";

import Link from "next/link";
import { useShellSession } from "@/components/session-provider";

/** CTA nổi bật trên hero trang tin — vào hệ thống biên tập sau đăng nhập. */
export function PublicHomeEditorialCta() {
  const { user, ready } = useShellSession();

  if (ready && user) {
    return (
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className="header-cta px-5 py-2.5 text-sm">
          Vào hệ thống biên tập
        </Link>
        <p className="text-sm text-[var(--ink-muted)]">
          Đang đăng nhập · {user.name || user.email}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Link href="/login?next=/dashboard" className="header-cta px-5 py-2.5 text-sm">
        Đăng nhập hệ thống biên tập
      </Link>
      <p className="text-sm text-[var(--ink-muted)]">
        Dành cho biên tập viên · độc giả đọc miễn phí trên trang này
      </p>
    </div>
  );
}
