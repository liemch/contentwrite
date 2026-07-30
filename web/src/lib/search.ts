import { postJson } from "@/lib/http-client";

export type SearchResult = {
  title: string;
  url: string;
  content: string;
};

export async function webSearch(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY chưa được cấu hình. AI-TFES bắt buộc web search trước khi viết.",
    );
  }

  const response = await postJson({
    url: "https://api.tavily.com/search",
    body: {
      api_key: apiKey,
      query,
      search_depth: "advanced",
      max_results: 6,
      include_answer: false,
    },
  });

  if (!response.ok) {
    throw new Error(`Tavily search lỗi (${response.status}): ${response.text.slice(0, 300)}`);
  }

  const data = JSON.parse(response.text) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };

  return (data.results ?? []).map((item) => ({
    title: item.title ?? "Untitled",
    url: item.url ?? "",
    content: item.content ?? "",
  }));
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "Không tìm thấy kết quả search.";
  }

  return results
    .map(
      (r, i) =>
        `[${i + 1}] ${r.title}\nURL: ${r.url}\nSnippet: ${r.content.slice(0, 800)}`,
    )
    .join("\n\n");
}
