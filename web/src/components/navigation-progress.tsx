"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

/**
 * Thanh tiến trình khi chuyển trang (click link nội bộ).
 * Không phụ thuộc thư viện ngoài — gắn vào layout.
 */
function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    delete document.documentElement.dataset.navigationPending;
    queueMicrotask(() => {
      setActive(false);
      setWidth(0);
    });
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, [routeKey]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const nextKey = `${url.pathname}?${url.searchParams.toString()}`;
      const currentKey = `${window.location.pathname}?${window.location.search.slice(1)}`;
      if (nextKey === currentKey) return;

      setActive(true);
      document.documentElement.dataset.navigationPending = "true";
      setWidth(12);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setWidth((w) => (w >= 88 ? w : w + Math.max(1.5, (90 - w) * 0.08)));
      }, 120);
    }

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      delete document.documentElement.dataset.navigationPending;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!active) return null;

  return (
    <>
      <div
        className="nav-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        aria-label="Đang chuyển trang"
      >
        <div className="nav-progress-bar" style={{ width: `${width}%` }} />
      </div>
    </>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
