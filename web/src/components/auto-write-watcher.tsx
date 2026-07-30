"use client";

/**
 * Trên Vercel Hobby, gọi full auto-write trong request khi mở dashboard
 * dễ gây FUNCTION_INVOCATION_TIMEOUT (504). Cron daily đảm nhiệm lịch;
 * local vẫn có nút “Chạy ngay” ở /settings.
 */
export function AutoWriteWatcher(_props: { due: boolean }) {
  return null;
}
