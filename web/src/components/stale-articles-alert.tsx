import Link from "next/link";
import type { StaleArticleRow } from "@/lib/stale-articles";
import { staleMinutes } from "@/lib/stale-articles";

type StaleArticlesAlertProps = {
  articles: StaleArticleRow[];
};

export function StaleArticlesAlert({ articles }: StaleArticlesAlertProps) {
  if (articles.length === 0) return null;

  return (
    <section className="mb-8 rounded-2xl border border-[rgba(180,83,9,0.35)] bg-[#fff7ed] px-5 py-4 sm:px-6">
      <p className="text-sm font-semibold text-[#9a3412]">
        {articles.length} bài có thể bị treo pipeline (&gt;30 phút không cập nhật)
      </p>
      <p className="mt-1 text-sm text-[#9a3412]/80">
        Kiểm tra tab còn mở, lỗi API, hoặc bấm «Chạy bước tiếp» trên bài.
      </p>
      <ul className="mt-3 space-y-1.5">
        {articles.slice(0, 5).map((article) => (
          <li key={article.id} className="text-sm">
            <Link
              href={`/articles/${article.id}`}
              className="font-medium text-[#9a3412] underline underline-offset-2"
            >
              {article.title || article.topic || article.id}
            </Link>
            <span className="ml-2 text-xs text-[#9a3412]/70">
              {staleMinutes(article)} phút · {article.workflowState}
              {article.currentStep ? ` · ${article.currentStep}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
