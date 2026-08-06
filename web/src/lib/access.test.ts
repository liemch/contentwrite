import { describe, expect, it } from "vitest";
import { UserRole, WorkflowState } from "@/generated/prisma/client";
import {
  canAccessArticle,
  canAccessDigest,
  canAccessOwnedResource,
  canAccessSeries,
  canViewArticleBody,
  editorialWhere,
  ownedResourceWhere,
  sanitizeSeriesArticlesForUser,
} from "@/lib/access";
import { safeInternalPath } from "@/lib/safe-redirect";
import type { SessionUser } from "@/lib/auth";

const admin: SessionUser = {
  userId: "admin-1",
  email: "admin@test.com",
  role: UserRole.ADMIN,
  name: "Admin",
};

const editorA: SessionUser = {
  userId: "editor-a",
  email: "a@test.com",
  role: UserRole.EDITOR,
  name: "A",
};

const editorB: SessionUser = {
  userId: "editor-b",
  email: "b@test.com",
  role: UserRole.EDITOR,
  name: "B",
};

describe("owned resource access", () => {
  it("admin can access any owned resource", () => {
    expect(canAccessOwnedResource(admin, { createdById: "editor-a" })).toBe(true);
    expect(canAccessOwnedResource(admin, { createdById: null })).toBe(true);
  });

  it("editor can access own resource only", () => {
    expect(canAccessOwnedResource(editorA, { createdById: "editor-a" })).toBe(true);
    expect(canAccessOwnedResource(editorA, { createdById: "editor-b" })).toBe(false);
    expect(canAccessOwnedResource(editorA, { createdById: null })).toBe(false);
  });

  it("scopes list queries for editors", () => {
    expect(editorialWhere(editorA)).toEqual({ createdById: "editor-a" });
    expect(editorialWhere(admin)).toEqual({});
    expect(ownedResourceWhere(editorB)).toEqual({ createdById: "editor-b" });
  });
});

describe("digest and series access", () => {
  it("mirrors article ownership rules", () => {
    const digest = { createdById: "editor-a" };
    expect(canAccessDigest(editorA, digest)).toBe(true);
    expect(canAccessDigest(editorB, digest)).toBe(false);
    expect(canAccessSeries(admin, { createdById: null })).toBe(true);
    expect(canAccessSeries(editorA, { createdById: null })).toBe(false);
  });
});

describe("article body visibility", () => {
  const draft = {
    createdById: "editor-a",
    workflowState: WorkflowState.DRAFTED,
  };

  it("owner and admin see draft body", () => {
    expect(canViewArticleBody(editorA, draft)).toBe(true);
    expect(canViewArticleBody(admin, draft)).toBe(true);
  });

  it("other editor cannot see draft body", () => {
    expect(canViewArticleBody(editorB, draft)).toBe(false);
  });

  it("published content visible to other editors", () => {
    expect(
      canViewArticleBody(editorB, {
        ...draft,
        workflowState: WorkflowState.PUBLISHED,
      }),
    ).toBe(true);
  });
});

describe("sanitizeSeriesArticlesForUser", () => {
  it("strips cleanPublish from inaccessible drafts", () => {
    const rows = sanitizeSeriesArticlesForUser(editorB, [
      {
        id: "1",
        title: "Draft",
        topic: "t",
        status: "DRAFT",
        workflowState: WorkflowState.DRAFTED,
        domain: "engineering",
        publishFormat: "blog",
        seriesOrder: 1,
        publishedAt: null,
        updatedAt: new Date(),
        createdById: "editor-a",
        cleanPublish: "secret draft",
      },
    ]);
    expect(rows[0]?.cleanPublish).toBeNull();
  });
});

describe("canAccessArticle", () => {
  it("matches owned resource semantics", () => {
    expect(canAccessArticle(editorA, { createdById: "editor-a" })).toBe(true);
    expect(canAccessArticle(editorB, { createdById: "editor-a" })).toBe(false);
  });
});

describe("safeInternalPath", () => {
  it("allows internal paths", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/articles/new")).toBe("/articles/new");
  });

  it("blocks open redirects", () => {
    expect(safeInternalPath("//evil.example")).toBe("/dashboard");
    expect(safeInternalPath("https://evil.example")).toBe("/dashboard");
    expect(safeInternalPath("/\\@evil")).toBe("/dashboard");
  });
});
