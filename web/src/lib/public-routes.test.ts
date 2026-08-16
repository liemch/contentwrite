import { describe, expect, it } from "vitest";
import { isPublicPath, publicArticleHref } from "@/lib/public-routes";

describe("public-routes", () => {
  it("marks homepage and article reader as public", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/bai/abc-123")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/me")).toBe(true);
  });

  it("keeps editorial routes protected", () => {
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/library")).toBe(false);
    expect(isPublicPath("/articles/new")).toBe(false);
  });

  it("builds public article href", () => {
    expect(publicArticleHref("x1")).toBe("/bai/x1");
  });
});
