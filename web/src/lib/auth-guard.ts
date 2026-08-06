import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth";

/** SSR protected pages — reload user from DB; redirect inactive / stale sessions. */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  try {
    return await requireUser();
  } catch {
    redirect("/login");
  }
}
