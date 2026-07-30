import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";

export default async function HomePage() {
  const authed = await verifySession();
  redirect(authed ? "/dashboard" : "/login");
}
