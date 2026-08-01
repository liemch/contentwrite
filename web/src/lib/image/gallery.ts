/** Gallery ảnh bài viết — hero + minh họa trong thân (tối đa 5). */

export const MAX_ARTICLE_IMAGES = 5;

export type GalleryImageRole = "hero" | "inline";

export type GalleryImage = {
  id: string;
  role: GalleryImageRole;
  url: string;
  alt: string;
  prompt: string;
  modelLabel: string;
  /** Gợi ý chèn sau heading ## (index 0-based trong danh sách ##) */
  afterHeadingIndex?: number | null;
  createdAt: string;
};

export type ImageBriefSlot = {
  role: GalleryImageRole;
  /** English prompt for image model */
  promptEn: string;
  /** Vietnamese alt */
  altVi: string;
  conceptVi: string;
  /** Optional: which ## section this illustrates (0-based among ## headings) */
  afterHeadingIndex?: number | null;
};

export function parseGalleryJson(raw: string | null | undefined): GalleryImage[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is GalleryImage => Boolean(x && typeof x === "object" && typeof (x as GalleryImage).url === "string"))
      .slice(0, MAX_ARTICLE_IMAGES);
  } catch {
    return [];
  }
}

export function serializeGallery(images: GalleryImage[]): string {
  return JSON.stringify(images.slice(0, MAX_ARTICLE_IMAGES));
}

export function galleryFromLegacyHero(input: {
  url?: string | null;
  alt?: string | null;
  prompt?: string | null;
  modelLabel?: string | null;
}): GalleryImage[] {
  if (!input.url?.trim()) return [];
  return [
    {
      id: "hero-legacy",
      role: "hero",
      url: input.url,
      alt: input.alt?.trim() || "Minh họa bài viết",
      prompt: input.prompt?.trim() || "",
      modelLabel: input.modelLabel?.trim() || "—",
      afterHeadingIndex: null,
      createdAt: new Date().toISOString(),
    },
  ];
}

export function resolveGallery(article: {
  galleryJson?: string | null;
  heroImageUrl?: string | null;
  heroImageAlt?: string | null;
  heroPromptUsed?: string | null;
  heroImageModel?: string | null;
}): GalleryImage[] {
  const fromJson = parseGalleryJson(article.galleryJson);
  if (fromJson.length > 0) return fromJson;
  return galleryFromLegacyHero({
    url: article.heroImageUrl,
    alt: article.heroImageAlt,
    prompt: article.heroPromptUsed,
    modelLabel: article.heroImageModel,
  });
}

const PD_IMG_RE = /\n*<!--pd-img:[a-zA-Z0-9_-]+-->\n*!?\[[^\]]*]\([^)]+\)\n*/g;

/** Gỡ mọi ảnh gallery đã chèn (marker <!--pd-img:...-->). */
export function stripGalleryMarkers(markdown: string): string {
  return markdown.replace(PD_IMG_RE, "\n\n").replace(/\n{3,}/g, "\n\n");
}

/**
 * Chèn hero đầu bài + ảnh inline sau các ## theo afterHeadingIndex.
 * Data URL không nhét vào markdown (chỉ giữ trên field URL).
 */
export function injectGalleryIntoCleanPublish(
  cleanPublish: string | null | undefined,
  images: GalleryImage[],
): string | null | undefined {
  if (!cleanPublish) return cleanPublish;
  let body = stripGalleryMarkers(cleanPublish);

  const hero = images.find((i) => i.role === "hero");
  const inlines = images.filter((i) => i.role === "inline");

  // Hero placeholder / leading image
  if (hero && !hero.url.startsWith("data:")) {
    const md = `<!--pd-img:${hero.id}-->\n![${hero.alt}](${hero.url})`;
    if (/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)/.test(body)) {
      body = body.replace(/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)/, md);
    } else {
      body = body
        .replace(/^\s*!\[[^\]]*]\([^)]+\)\s*/m, "")
        .replace(/\bHERO_IMAGE\b/g, "");
      const titleMatch = body.match(/^(#[^\n]+\n+(?:\*[^\n]+\*\n+)?)([\s\S]*)$/);
      if (titleMatch) {
        body = `${titleMatch[1].trimEnd()}\n\n${md}\n\n${titleMatch[2].trimStart()}`;
      } else {
        body = `${md}\n\n${body}`;
      }
    }
  } else {
    body = body
      .replace(/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)\s*/g, "")
      .replace(/\bHERO_IMAGE\b/g, "");
  }

  if (inlines.length === 0) return body.replace(/\n{3,}/g, "\n\n").trim();

  const headingRe = /^(#{2,3}\s+[^\n]+)$/gm;
  const headings: { index: number; start: number }[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(headingRe.source, "gm");
  while ((m = re.exec(body)) !== null) {
    headings.push({ index: headings.length, start: m.index });
  }

  // Insert from end so offsets stay valid
  const planned = inlines
    .filter((img) => !img.url.startsWith("data:"))
    .map((img, i) => {
      const prefer =
        typeof img.afterHeadingIndex === "number" ? img.afterHeadingIndex : i;
      const h =
        headings[Math.min(Math.max(prefer, 0), Math.max(headings.length - 1, 0))];
      return { img, insertAt: h ? h.start + body.slice(h.start).indexOf("\n") + 1 : -1 };
    })
    .filter((x) => x.insertAt > 0)
    .sort((a, b) => b.insertAt - a.insertAt);

  for (const { img, insertAt } of planned) {
    const block = `\n\n<!--pd-img:${img.id}-->\n![${img.alt}](${img.url})\n\n`;
    body = body.slice(0, insertAt) + block + body.slice(insertAt);
  }

  return body.replace(/\n{3,}/g, "\n\n").trim();
}
