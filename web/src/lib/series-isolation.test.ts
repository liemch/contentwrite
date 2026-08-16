import { describe, expect, it } from "vitest";
import { UserRole, WorkflowState } from "@/generated/prisma/client";
import { canAccessSeries, sanitizeSeriesArticleForUser } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";

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

describe("series attach authorization", () => {
  it("editor cannot attach to another editor series", () => {
    expect(canAccessSeries(editorA, { createdById: "editor-b" })).toBe(false);
    expect(canAccessSeries(editorA, { createdById: "editor-a" })).toBe(true);
  });
});

describe("series preview sanitization (SEC-10)", () => {
  const row = {
    id: "1",
    title: "Secret draft title",
    topic: "Secret topic",
    status: "DRAFT",
    workflowState: WorkflowState.DRAFTED,
    domain: "engineering",
    publishFormat: "blog",
    seriesOrder: 1,
    publishedAt: null,
    updatedAt: new Date(),
    createdById: "editor-a",
    cleanPublish: "secret body",
  };

  it("strips title/topic/body for inaccessible drafts", () => {
    const sanitized = sanitizeSeriesArticleForUser(editorB, row);
    expect(sanitized.title).toBeNull();
    expect(sanitized.topic).toBeNull();
    expect(sanitized.cleanPublish).toBeNull();
  });
});
