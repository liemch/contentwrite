import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { AutoWriteWatcher } from "@/components/auto-write-watcher";
import { PipelineQueue } from "@/components/pipeline-queue";
import { editorialWhere, isAdmin } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { getAutoWriteConfig } from "@/lib/auto-write/runner";
import { isDue } from "@/lib/auto-write/schedule";
import { BRAND } from "@/lib/brand";
import { getDeskMetrics } from "@/lib/tfes/editorial-memory";
import { isAwaitingHumanReview } from "@/lib/tfes/human-review";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  noStore();
  const session = await getSession();
  if (!session) redirect("/login");

  const [articles, autoConfig, metrics] = await Promise.all([
    prisma.article.findMany({
      where: editorialWhere(session),
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
        knowledgeRecord: true,
        factCheck: true,
      },
    }),
    getAutoWriteConfig(),
    getDeskMetrics(isAdmin(session) ? {} : { createdById: session.userId }),
  ]);

  const queue = articles.filter((a) => ["DRAFT", "RUNNING", "FAILED"].includes(a.status));
  const review = articles.filter((a) => a.status === "PUBLISH_READY");
  const awaitingHuman = articles.filter((a) =>
    isAwaitingHumanReview({
      knowledgeRecord: a.knowledgeRecord,
      factCheck: a.factCheck,
    }),
  ).length;
  const publishedCount = articles.filter((a) => a.status === "PUBLISHED").length;
  const admin = isAdmin(session);
  const autoDue = admin && autoConfig.enabled && isDue(autoConfig.nextRunAt);
  const greetingName = session.name?.trim() || session.email?.split("@")[0] || "biên tập viên";

  return (
    <AppShell hidePageChrome>
      {/* Welcome — một composition */}
      <section className="desk-hero relative mb-8 px-6 py-8 sm:px-10 sm:py-10">
        <div className="desk-hero-shine" aria-hidden />
        <div className="relative z-[1] flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[rgba(213,240,237,0.85)]">
              {BRAND.name} · {BRAND.tagline}
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-source-serif)] text-3xl font-semibold tracking-tight text-white sm:text-[2.35rem] sm:leading-tight">
              Xin chào, {greetingName}
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[rgba(244,248,250,0.72)] sm:text-[15px]">
              {admin
                ? "Bàn biên tập: Research → Insight ≥ L2 → Viết → Duyệt. Bài publish nằm ở Thư viện."
                : "Bài của bạn theo chu trình AI-TFES — sẵn sàng thì vào Thư viện sau khi Publish."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {admin && (
              <Link
                href="/settings"
                className="inline-flex rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/18"
              >
                Cài đặt{autoConfig.enabled ? " · Auto ON" : ""}
              </Link>
            )}
            <Link
              href="/articles/new"
              className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[var(--ink)] shadow-sm transition hover:bg-[var(--accent-soft)]"
            >
              + Tạo bài mới
            </Link>
          </div>
        </div>
      </section>

      {admin && <AutoWriteWatcher due={autoDue} />}

      <section className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {[
          {
            label: "Đang làm",
            value: queue.length,
            hint: "Draft · Running · Failed",
            href: null as string | null,
            tone: queue.some((a) => a.status === "FAILED") ? ("warm" as const) : undefined,
          },
          {
            label: "Chờ Review người",
            value: awaitingHuman,
            hint: "Sau AI Review",
            href: null,
            tone: awaitingHuman > 0 ? ("warm" as const) : undefined,
          },
          {
            label: "Chờ duyệt",
            value: review.length,
            hint: "Publish Ready",
            href: null,
            tone: review.length > 0 ? ("warm" as const) : undefined,
          },
          {
            label: "Thư viện",
            value: publishedCount,
            hint: "Đã đăng · mở Thư viện",
            href: "/library",
            tone: "accent" as const,
          },
          {
            label: "Điểm TB",
            value: metrics.avgScore != null ? metrics.avgScore : "—",
            hint:
              metrics.scoredCount > 0
                ? `${metrics.highScoreCount} bài ≥4/5 · ${metrics.scoredCount} đã chấm`
                : "Chưa có điểm Approve",
            href: null,
            tone: "accent" as const,
          },
          {
            label: "Tổng bài",
            value: articles.length,
            hint: "Mọi trạng thái",
            href: null,
            tone: undefined,
          },
        ].map((item) => {
          const inner = (
            <>
              <p className="section-kicker">{item.label}</p>
              <p className="mt-2 font-[family-name:var(--font-source-serif)] text-3xl font-semibold tracking-tight text-[var(--ink)]">
                {item.value}
              </p>
              <p className="mt-1.5 text-xs text-[var(--ink-faint)]">{item.hint}</p>
            </>
          );
          return item.href ? (
            <Link
              key={item.label}
              href={item.href}
              className="metric-tile block px-4 py-4"
              data-tone={item.tone}
            >
              {inner}
            </Link>
          ) : (
            <div key={item.label} className="metric-tile px-4 py-4" data-tone={item.tone}>
              {inner}
            </div>
          );
        })}
      </section>

      {autoConfig.enabled && (
        <div className="mb-8 rounded-2xl border border-[rgba(11,107,102,0.2)] bg-[var(--accent-soft)] px-4 py-3 text-sm text-[var(--accent)]">
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
        <section className="mb-10 animate-fade-up-delay">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="section-kicker text-[var(--warm)]">Cần hành động</p>
              <h2 className="mt-1 font-[family-name:var(--font-source-serif)] text-xl font-semibold text-[var(--ink)]">
                Chờ duyệt
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-muted)]">
                Duyệt rồi Publish để bài vào Thư viện.
              </p>
            </div>
            <span className="rounded-full bg-[var(--warm-soft)] px-2.5 py-1 text-xs font-semibold text-[var(--warm)]">
              {review.length} bài
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {review.map((article) => (
              <ArticleCard key={article.id} {...article} href={`/articles/${article.id}`} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="section-kicker text-[var(--accent)]">Workspace</p>
            <h2 className="mt-1 font-[family-name:var(--font-source-serif)] text-xl font-semibold text-[var(--ink)]">
              Đang soạn
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-muted)]">
              Nháp / đang chạy / lỗi. Bài xong chuyển sang Chờ duyệt.
            </p>
          </div>
        </div>

        <PipelineQueue items={queue} />
      </section>
    </AppShell>
  );
}
