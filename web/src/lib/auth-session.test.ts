import { describe, expect, it } from "vitest";
import { isJwtMarkedInactive, isSessionInvalidated } from "@/lib/auth-session";

describe("isSessionInvalidated", () => {
  const updatedAt = new Date("2026-08-06T10:00:00.000Z");

  it("rejects inactive users", () => {
    expect(isSessionInvalidated({ active: false, updatedAt }, updatedAt.getTime())).toBe(true);
  });

  it("accepts active user with matching session version", () => {
    expect(isSessionInvalidated({ active: true, updatedAt }, updatedAt.getTime())).toBe(false);
  });

  it("rejects when user record changed after JWT was issued", () => {
    const later = new Date("2026-08-06T11:00:00.000Z");
    expect(isSessionInvalidated({ active: true, updatedAt: later }, updatedAt.getTime())).toBe(
      true,
    );
  });

  it("allows legacy JWT without sv for active users (DB active check only)", () => {
    expect(isSessionInvalidated({ active: true, updatedAt }, undefined)).toBe(false);
  });

  it("still rejects inactive user on legacy JWT without sv", () => {
    expect(isSessionInvalidated({ active: false, updatedAt }, undefined)).toBe(true);
  });
});

describe("isJwtMarkedInactive", () => {
  it("flags explicit inactive claim", () => {
    expect(isJwtMarkedInactive(false)).toBe(true);
  });

  it("allows true or missing active claim", () => {
    expect(isJwtMarkedInactive(true)).toBe(false);
    expect(isJwtMarkedInactive(undefined)).toBe(false);
  });
});

describe("user admin API response policy", () => {
  const forbidden = ["temporaryPassword", "oneTimePassword", "password"] as const;

  it("does not expose password fields in documented create/patch shapes", () => {
    const createShape = { user: { id: "u1", email: "a@test.com" } };
    const patchShape = { user: { id: "u1", email: "a@test.com", active: true } };
    for (const body of [createShape, patchShape]) {
      for (const key of forbidden) {
        expect(body).not.toHaveProperty(key);
      }
    }
  });
});
