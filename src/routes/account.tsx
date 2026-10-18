import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "My Account — Wholesale Mart" },
      { name: "description", content: "Your account details and delivery address." },
      { property: "og:title", content: "My Account — Wholesale Mart" },
      { property: "og:description", content: "Your account details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Account,
});

function Account() {
  const { session, ready } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: c } = useQuery({
    queryKey: ["customer", session?.user.id],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").eq("id", session!.user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <AppShell title="Account">
      {ready && !session ? (
        <div className="px-4 py-20 text-center">
          <Link to="/auth" className="inline-block rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">Login / Sign up</Link>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-4">
          <div className="card-elevated space-y-2 p-4 text-sm">
            <p className="text-lg font-bold">{c?.name}</p>
            <p>📞 +91 {c?.phone}</p>
            {c?.email && <p>✉️ {c.email}</p>}
            <p className="text-muted-foreground">📍 {c?.address}</p>
          </div>
          <ChangePassword />
          <button onClick={logout} className="h-12 w-full rounded-xl border-2 border-destructive font-bold text-destructive">
            Log out
          </button>
        </div>
      )}
    </AppShell>
  );
}

function ChangePassword() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 6 || pw.length > 72) return void toast.error("Password must be 6–72 characters");
    if (pw !== pw2) return void toast.error("Passwords do not match");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return void toast.error(/pwned|leak|weak/i.test(error.message) ? "This password is too common. Choose another." : error.message);
    toast.success("Password changed");
    setPw(""); setPw2("");
  }
  const input = "w-full rounded-xl border bg-surface px-3 py-3 text-base outline-none focus:border-primary";
  return (
    <form onSubmit={save} className="card-elevated space-y-2 p-4">
      <p className="font-bold">Change password</p>
      <input type="password" className={input} placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
      <input type="password" className={input} placeholder="Confirm new password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" />
      <button disabled={busy} className="h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Update password"}</button>
    </form>
  );
}
