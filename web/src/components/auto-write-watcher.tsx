"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Khi mở dashboard: nếu lịch auto đã đến hạn, gọi cron tick (local không cần Vercel Cron).
 * Chỉ fire 1 lần / session tab.
 */
export function AutoWriteWatcher({ due }: { due: boolean }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (!due || fired.current) return;
    fired.current = true;

    void (async () => {
      try {
        // Dùng endpoint admin force=false via cron without secret in prod won't work;
        // local cron cho phép khi không có CRON_SECRET. Fallback: gọi run? No — that forces.
        // Dedicated lightweight due-check endpoint would be better; reuse cron GET.
        const res = await fetch("/api/auto-write/tick", { method: "POST" });
        if (res.ok) {
          const data = (await res.json()) as { ran?: boolean };
          if (data.ran) router.refresh();
        }
      } catch {
        // ignore — cron có thể bị chặn khi CRON_SECRET bắt buộc
      }
    })();
  }, [due, router]);

  return null;
}
