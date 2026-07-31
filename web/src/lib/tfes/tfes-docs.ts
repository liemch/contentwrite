import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { DOMAIN_IDS } from "@/lib/tfes/domains";

const TFES_ROOT = join(process.cwd(), "content", "ai-tfes");

/** File được phép sửa trên Settings (whitelist) */
export const TFES_EDITABLE_DOCS: Array<{ path: string; label: string; group: string }> = [
  { path: "02-Prompts/Operating-Prompt.md", label: "Operating Prompt", group: "Prompts" },
  { path: "02-Prompts/Daily-Task.md", label: "Daily Task", group: "Prompts" },
  { path: "02-Prompts/Operating-Prompt-SHORT.md", label: "Operating Prompt (SHORT)", group: "Prompts" },
  ...DOMAIN_IDS.map((id) => ({
    path: `04-Domain-Profiles/${id}.md`,
    label: `Domain · ${id}`,
    group: "Domain Profiles",
  })),
  { path: "05-Templates/Research-Brief.md", label: "Research Brief", group: "Templates" },
  { path: "05-Templates/Article.md", label: "Article (12 phần)", group: "Templates" },
  { path: "05-Templates/Review.md", label: "Review", group: "Templates" },
  { path: "05-Templates/FactCheck.md", label: "Fact Check", group: "Templates" },
  { path: "05-Templates/Publish.md", label: "Publish", group: "Templates" },
];

const ALLOWED = new Set(TFES_EDITABLE_DOCS.map((d) => d.path));

/** Cache override trong process — hydrate từ DB trước khi chạy pipeline */
const overrideCache = new Map<string, string>();
let hydratedAt = 0;
const HYDRATE_TTL_MS = 30_000;

export function isAllowedTfesPath(path: string): boolean {
  return ALLOWED.has(path);
}

export function readTfesFileFromDisk(relativePath: string): string {
  const fullPath = join(TFES_ROOT, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`AI-TFES file không tồn tại trên disk: ${relativePath}`);
  }
  return readFileSync(fullPath, "utf-8");
}

export function getTfesOverrideCached(relativePath: string): string | undefined {
  return overrideCache.get(relativePath);
}

export async function hydrateTfesOverrides(force = false): Promise<void> {
  if (!force && Date.now() - hydratedAt < HYDRATE_TTL_MS && hydratedAt > 0) {
    return;
  }
  try {
    const rows = await prisma.tfesDocument.findMany({
      select: { path: true, content: true },
    });
    overrideCache.clear();
    for (const row of rows) {
      if (ALLOWED.has(row.path)) {
        overrideCache.set(row.path, row.content);
      }
    }
    hydratedAt = Date.now();
  } catch (error) {
    // Bảng chưa migrate — giữ cache cũ / chỉ dùng disk
    const msg = error instanceof Error ? error.message : String(error);
    if (!/TfesDocument|does not exist|P2021/i.test(msg)) {
      console.error("[tfes-docs] hydrate failed:", msg);
    }
  }
}

export async function listTfesDocuments() {
  await hydrateTfesOverrides(true);
  const rows = await prisma.tfesDocument
    .findMany({
      select: { path: true, updatedAt: true, updatedBy: true },
    })
    .catch(() => [] as { path: string; updatedAt: Date; updatedBy: string | null }[]);

  const byPath = new Map(rows.map((r) => [r.path, r]));

  return TFES_EDITABLE_DOCS.map((doc) => {
    const row = byPath.get(doc.path);
    const onDisk = existsSync(join(TFES_ROOT, doc.path));
    return {
      ...doc,
      onDisk,
      hasOverride: Boolean(row),
      updatedAt: row?.updatedAt?.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}

export async function getTfesDocument(path: string): Promise<{
  path: string;
  label: string;
  group: string;
  content: string;
  diskContent: string | null;
  onDisk: boolean;
  hasOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}> {
  if (!isAllowedTfesPath(path)) {
    throw new Error("File không nằm trong whitelist chỉnh sửa");
  }
  await hydrateTfesOverrides(true);

  const meta = TFES_EDITABLE_DOCS.find((d) => d.path === path)!;
  let diskContent: string | null = null;
  try {
    diskContent = readTfesFileFromDisk(path);
  } catch {
    diskContent = null;
  }

  const row = await prisma.tfesDocument
    .findUnique({ where: { path } })
    .catch(() => null);

  const content = row?.content ?? diskContent ?? "";
  if (!content && !diskContent) {
    throw new Error("Không có nội dung (disk + DB đều trống)");
  }

  return {
    path,
    label: meta.label,
    group: meta.group,
    content: row?.content ?? diskContent ?? "",
    diskContent,
    onDisk: diskContent != null,
    hasOverride: Boolean(row),
    updatedAt: row?.updatedAt?.toISOString() ?? null,
    updatedBy: row?.updatedBy ?? null,
  };
}

export async function saveTfesDocument(input: {
  path: string;
  content: string;
  updatedBy?: string | null;
}) {
  if (!isAllowedTfesPath(input.path)) {
    throw new Error("File không nằm trong whitelist chỉnh sửa");
  }
  const content = input.content.replace(/\r\n/g, "\n");
  if (content.trim().length < 20) {
    throw new Error("Nội dung quá ngắn — kiểm tra lại trước khi lưu");
  }

  const row = await prisma.tfesDocument.upsert({
    where: { path: input.path },
    create: {
      path: input.path,
      content,
      updatedBy: input.updatedBy ?? null,
    },
    update: {
      content,
      updatedBy: input.updatedBy ?? null,
    },
  });

  overrideCache.set(input.path, content);
  hydratedAt = Date.now();

  return {
    path: row.path,
    hasOverride: true,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

/** Xóa override → quay về bản disk (repo / sync-tfes) */
export async function resetTfesDocument(path: string) {
  if (!isAllowedTfesPath(path)) {
    throw new Error("File không nằm trong whitelist chỉnh sửa");
  }
  await prisma.tfesDocument.deleteMany({ where: { path } });
  overrideCache.delete(path);
  hydratedAt = Date.now();
  return getTfesDocument(path);
}
