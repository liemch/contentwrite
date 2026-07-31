"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/input";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "EDITOR";
  active: boolean;
  dailyArticleLimit: number;
  createdAt: string;
};

export function UsersAdminPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tempPassword, setTempPassword] = useState("");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"EDITOR" | "ADMIN">("EDITOR");
  const [dailyLimit, setDailyLimit] = useState(3);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/users");
    setLoading(false);
    if (!res.ok) {
      setError("Không tải được danh sách user (cần quyền admin)");
      return;
    }
    const data = (await res.json()) as { users: UserRow[] };
    setUsers(data.users);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    setMessage("");
    setTempPassword("");

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        name: name || undefined,
        password,
        role,
        dailyArticleLimit: dailyLimit,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      temporaryPassword?: string;
    };
    setCreating(false);

    if (!res.ok) {
      setError(data.error || "Không tạo được user");
      return;
    }

    setTempPassword(data.temporaryPassword || password);
    setMessage(`Đã tạo ${email}. Copy mật khẩu tạm bên dưới — không gửi email tự động.`);
    setEmail("");
    setName("");
    setPassword("");
    setRole("EDITOR");
    setDailyLimit(3);
    await load();
  }

  async function patchUser(
    id: string,
    body: Partial<{
      role: string;
      active: boolean;
      dailyArticleLimit: number;
      password: string;
    }>,
  ) {
    setError("");
    setMessage("");
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      temporaryPassword?: string;
    };
    if (!res.ok) {
      setError(data.error || "Cập nhật thất bại");
      return;
    }
    if (data.temporaryPassword) {
      setTempPassword(data.temporaryPassword);
      setMessage("Đã reset mật khẩu — copy bên dưới.");
    } else {
      setMessage("Đã cập nhật user.");
    }
    await load();
  }

  function randomPassword() {
    const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let out = "";
    for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
    setPassword(out);
  }

  return (
    <section className="surface-card space-y-6 p-6 sm:p-8">
      <div>
        <h2 className="font-[family-name:var(--font-source-serif)] text-xl font-semibold text-[var(--ink)]">
          Users & hạn mức bài/ngày
        </h2>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">
          Admin tạo tài khoản (không tự đăng ký). Editor chỉ thấy bài của mình và được tự Approve.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-[var(--danger-soft)] px-3.5 py-2.5 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--accent-soft)] px-3.5 py-2.5 text-sm text-[var(--ink)]">
          {message}
        </div>
      )}
      {tempPassword && (
        <div className="rounded-xl border border-[rgba(180,83,9,0.35)] bg-[var(--warn-soft)] px-3.5 py-3 text-sm">
          <p className="font-medium text-[var(--ink)]">Mật khẩu tạm (copy ngay):</p>
          <code className="mt-1 block select-all break-all font-mono text-[var(--accent)]">
            {tempPassword}
          </code>
        </div>
      )}

      <form onSubmit={onCreate} className="grid gap-4 rounded-2xl border border-[var(--line)] p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            Tạo user mới
          </p>
        </div>
        <div>
          <Label htmlFor="u-email">Email</Label>
          <Input
            id="u-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="u-name">Tên (tuỳ chọn)</Label>
          <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="u-pass">Mật khẩu tạm</Label>
          <div className="flex gap-2">
            <Input
              id="u-pass"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
            <Button type="button" variant="secondary" size="sm" onClick={randomPassword}>
              Random
            </Button>
          </div>
          <FieldHint>Tối thiểu 8 ký tự. Gửi tay cho user — hệ thống không email.</FieldHint>
        </div>
        <div>
          <Label htmlFor="u-role">Role</Label>
          <Select
            id="u-role"
            value={role}
            onChange={(e) => {
              const r = e.target.value === "ADMIN" ? "ADMIN" : "EDITOR";
              setRole(r);
              setDailyLimit(r === "ADMIN" ? 20 : 3);
            }}
          >
            <option value="EDITOR">EDITOR</option>
            <option value="ADMIN">ADMIN</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="u-limit">Bài / ngày</Label>
          <Input
            id="u-limit"
            type="number"
            min={0}
            max={100}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value) || 0)}
          />
        </div>
        <div className="flex items-end sm:col-span-2">
          <Button type="submit" disabled={creating} size="sm">
            {creating ? "Đang tạo..." : "Tạo user"}
          </Button>
        </div>
      </form>

      <div className="overflow-x-auto">
        {loading ? (
          <p className="text-sm text-[var(--ink-faint)]">Đang tải...</p>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[11px] uppercase tracking-[0.1em] text-[var(--ink-faint)]">
                <th className="py-2 pr-3 font-semibold">User</th>
                <th className="py-2 pr-3 font-semibold">Role</th>
                <th className="py-2 pr-3 font-semibold">Bài/ngày</th>
                <th className="py-2 pr-3 font-semibold">TT</th>
                <th className="py-2 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--line)]/70">
                  <td className="py-3 pr-3">
                    <p className="font-medium text-[var(--ink)]">{u.email}</p>
                    {u.name && <p className="text-xs text-[var(--ink-faint)]">{u.name}</p>}
                  </td>
                  <td className="py-3 pr-3">
                    <Select
                      value={u.role}
                      onChange={(e) =>
                        void patchUser(u.id, {
                          role: e.target.value === "ADMIN" ? "ADMIN" : "EDITOR",
                        })
                      }
                    >
                      <option value="EDITOR">EDITOR</option>
                      <option value="ADMIN">ADMIN</option>
                    </Select>
                  </td>
                  <td className="py-3 pr-3">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20"
                      defaultValue={u.dailyArticleLimit}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n) || n === u.dailyArticleLimit) return;
                        void patchUser(u.id, { dailyArticleLimit: n });
                      }}
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <span
                      className={
                        u.active ? "text-[var(--success)]" : "text-[var(--ink-faint)]"
                      }
                    >
                      {u.active ? "Active" : "Off"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          const pw =
                            typeof crypto !== "undefined" && "randomUUID" in crypto
                              ? crypto.randomUUID().slice(0, 12)
                              : `tmp${Date.now().toString(36)}`;
                          void patchUser(u.id, { password: pw });
                        }}
                      >
                        Reset MK
                      </Button>
                      <Button
                        type="button"
                        variant={u.active ? "danger" : "secondary"}
                        size="sm"
                        onClick={() => void patchUser(u.id, { active: !u.active })}
                      >
                        {u.active ? "Tắt" : "Bật"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
