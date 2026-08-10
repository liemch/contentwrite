import { describe, expect, it } from "vitest";
import {
  ARTICLE_SHAPES,
  BLOG_ROTATING_SHAPE_IDS,
  isArticleShapeId,
} from "@/lib/tfes/article-shapes";
import {
  coerceManualShapeForFormat,
  DOMAIN_RECOMMENDED_SHAPES,
  isShapeRecommendedForDomain,
  recommendedShapeIdsForDomain,
  resolveShapeSelection,
  shapesCompatibleWithFormat,
} from "@/lib/tfes/shape-selection";
import {
  assertShapeFidelity,
  collectShapeFidelityIssues,
} from "@/lib/tfes/shape-fidelity";

describe("expanded article shapes", () => {
  it("registers new blog rotating frames", () => {
    for (const id of [
      "before-after",
      "myth-bust",
      "constraint-first",
      "timeline-reframe",
      "playbook-conditional",
      "cost-of-inaction",
    ]) {
      expect(isArticleShapeId(id)).toBe(true);
      expect(BLOG_ROTATING_SHAPE_IDS).toContain(id);
      expect(ARTICLE_SHAPES[id as keyof typeof ARTICLE_SHAPES].beats.length).toBeGreaterThan(3);
    }
  });

  it("locks facebook to facebook-post only", () => {
    const choices = shapesCompatibleWithFormat("facebook", "engineering");
    expect(choices).toHaveLength(1);
    expect(choices[0].id).toBe("facebook-post");
    expect(resolveShapeSelection({ publishFormat: "facebook" }).mode).toBe("locked");
  });

  it("allows manual blog shape when recommended for domain", () => {
    const pick = coerceManualShapeForFormat({
      publishFormat: "blog",
      domain: "engineering",
      articleShapeId: "constraint-first",
      strictDomainFit: true,
    });
    expect(pick.mode).toBe("manual");
    expect(pick.assignment?.articleShapeId).toBe("constraint-first");
  });

  it("rejects format-incompatible manual shape", () => {
    const locked = coerceManualShapeForFormat({
      publishFormat: "facebook",
      articleShapeId: "myth-bust",
    });
    expect(locked.mode).toBe("locked");
    expect(locked.assignment?.articleShapeId).toBe("facebook-post");

    expect(() =>
      coerceManualShapeForFormat({
        publishFormat: "blog",
        articleShapeId: "facebook-post",
      }),
    ).toThrow(/không tương thích/);
  });
});

describe("domain shape recommendations", () => {
  it("orders lifestyle recommendations away from postmortem", () => {
    const ids = recommendedShapeIdsForDomain("lifestyle");
    expect(ids[0]).toBe("before-after");
    expect(ids).toContain("myth-bust");
    expect(ids).not.toContain("failure-postmortem");
  });

  it("marks recommended flags on format-compatible choices", () => {
    const choices = shapesCompatibleWithFormat("blog", "security");
    const recommended = choices.filter((item) => item.recommended).map((item) => item.id);
    expect(recommended[0]).toBe(DOMAIN_RECOMMENDED_SHAPES.security[0]);
    expect(isShapeRecommendedForDomain("failure-postmortem", "security")).toBe(true);
    expect(isShapeRecommendedForDomain("playbook-conditional", "security")).toBe(false);
  });

  it("strictDomainFit blocks lifestyle + failure-postmortem", () => {
    expect(() =>
      coerceManualShapeForFormat({
        publishFormat: "blog",
        domain: "lifestyle",
        articleShapeId: "failure-postmortem",
        strictDomainFit: true,
      }),
    ).toThrow(/ít hợp domain/);
  });

  it("auto hint mentions domain pool size", () => {
    const meta = resolveShapeSelection({
      publishFormat: "blog",
      domain: "fun",
      requestedMode: "auto",
    });
    expect(meta.recommendedChoices.length).toBeGreaterThan(0);
    expect(meta.hint).toContain("fun");
  });
});

describe("shape fidelity soft-check", () => {
  it("flags ADR missing structure signals", () => {
    const issues = collectShapeFidelityIssues(
      "# Title\n\nMột đoạn blog chung chung không có quyết định.",
      ARTICLE_SHAPES.adr,
      "adr",
    );
    expect(issues.some((item) => item.code === "SHAPE_ADR")).toBe(true);
  });

  it("passes a minimal ADR-shaped body", () => {
    const body = `# Quyết định cache

## Ngữ cảnh
Latency p99 vượt SLO.

## Quyết định
Dùng Redis read-through.

## Hệ quả
Thêm độ phức tạp vận hành; revisit khi traffic đổi pattern.
`;
    expect(() => assertShapeFidelity(body, ARTICLE_SHAPES.adr, "adr")).not.toThrow();
  });

  it("flags facebook body with HERO", () => {
    const issues = collectShapeFidelityIssues(
      "# Hook\n\n![x](HERO_IMAGE)\n\nThân ngắn.\n\n## A\n## B\n## C\n## D\n",
      ARTICLE_SHAPES["facebook-post"],
      "facebook",
    );
    expect(issues.some((item) => item.code === "SHAPE_FB_HERO")).toBe(true);
    expect(issues.some((item) => item.code === "SHAPE_FB_HEADINGS")).toBe(true);
  });
});
