import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="p-10 text-center text-sm text-zinc-500">Đang tải...</main>}>
      <LoginForm />
    </Suspense>
  );
}
