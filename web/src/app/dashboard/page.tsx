import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { AutoWriteWatcher } from "@/components/auto-write-watcher";
import { PipelineQueue } from "@/components/pipeline-queue";
import { getAutoWriteConfig } from "@/lib/auto-write/runner";
import { isDue } from "@/lib/auto-write/schedule";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  noStore();
  const [articles, autoConfig] = await Promise.all([
    prisma.article.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        topic: true,
        domain: true,
        status: true,
        currentStep: true,
        updatedAt: true,
        publishedAt: true,
        cleanPublish: true,
        heroImageUrl: true,
        errorMessage: true,
        source: true,
      },
    }),
    getAutoWriteConfig(),
  ]);

  // Hàng đợi: đang làm / lỗi. PUBLISH_READY chỉ hiện ở "Chờ duyệt"
  const queue = articles.filter((a) => ["DRAFT", "RUNNING", "FAILED"].includes(a.status));
  const review = articles.filter((a) => a.status === "PUBLISH_READY");
  const published = articles.filter((a) => a.status === "PUBLISHED" || a.status === "APPROVED");
  const featured = published[0];
  const autoDue = autoConfig.enabled && isDue(autoConfig.nextRunAt);

  return (
    <AppShell
      title="Biên tập"
      subtitle="Research → Insight ≥ L2 → Viết → Duyệt. Chi tiết 10 bước xem trên từng bài."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings"
            className="inline-flex items-center justify-center rounded-full border border-[var(--line-strong)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--ink)]"
          >
            Cài đặt{autoConfig.enabled ? " · Auto ON" : ""}
          </Link>
          <Link
            href="/articles/new"
            className="inline-flex items-center justify-center rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
          >
            + Tạo bài mới
          </Link>
        </div>
      }
    >
      <AutoWriteWatcher due={autoDue} />

      <section className="mb-8 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Đang làm", value: queue.length, hint: "Draft / Running / Failed" },
          { label: "Chờ duyệt", value: review.length, hint: "Publish Ready (gồm Auto)" },
          { label: "Thư viện", value: published.length, hint: "Approved / Published" },
          { label: "Tổng", value: articles.length, hint: "Mọi trạng thái" },
        ].map((item) => (
          <div key={item.label} className="surface-soft px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              {item.label}
            </p>
            <p className="mt-1 font-[family-name:var(--font-source-serif)] text-3xl font-semibold text-[var(--ink)]">
              {item.value}
            </p>
            <p className="mt-1 text-xs text-[var(--ink-faint)]">{item.hint}</p>
          </div>
        ))}
      </section>

      {autoConfig.enabled && (
        <div className="mb-8 rounded-2xl border border-[rgba(12,110,107,0.18)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent)]">
          Auto-write đang bật
          {autoConfig.nextRunAt
            ? ` · lần tới ${new Date(autoConfig.nextRunAt).toLocaleString("vi-VN", {
                timeZone: autoConfig.timezone || "Asia/Ho_Chi_Minh",
                dateStyle: "short",
                timeStyle: "short",
              })}`
            : ""}
          {" · "}
          <Link href="/settings" className="font-semibold underline">
            Cấu hình
          </Link>
        </div>
      )}

      {review.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--warm)]">
                Cần hành động
              </p>
              <h2 className="mt-1 font-[family-name:var(--font-source-serif)] text-xl font-semibold">
                Chờ duyệt
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Bài auto và bài tay đều dừng ở đây — duyệt trước khi vào Thư viện.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {review.map((article) => (
              <ArticleCard key={article.id} {...article} href={`/articles/${article.id}`} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
              Workspace
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-source-serif)] text-xl font-semibold">
              Đang soạn
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Nháp / đang chạy / lỗi. Bài xong chuyển sang Chờ duyệt.
            </p>
          </div>
        </div>

        <PipelineQueue items={queue} />
      </section>

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              Đã duyệt
            </p>
            <h2 className="mt-1 font-[family-name:var(--font-source-serif)] text-xl font-semibold">
              Thư viện gần đây
            </h2>
          </div>
          <Link
            href="/library"
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Xem tất cả →
          </Link>
        </div>

        {published.length === 0 ? (
          <div className="surface-soft px-6 py-10 text-center text-sm text-[var(--ink-muted)]">
            Chưa có bài đã duyệt. Khi Approve / Publish, bài sẽ xuất hiện tại{" "}
            <Link href="/library" className="font-medium text-[var(--accent)] underline">
              Thư viện
            </Link>
            .
          </div>
        ) : (
          <div className="space-y-4">
            {featured && <ArticleCard {...featured} featured />}
            {published.length > 1 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {published.slice(1, 4).map((article) => (
                  <ArticleCard key={article.id} {...article} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
