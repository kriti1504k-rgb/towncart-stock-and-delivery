import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { phoneToAuthEmail, useAuth } from "@/lib/auth";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { redirect?: string | undefined } => {
    const r = s["redirect"];
    return { redirect: typeof r === "string" && r.startsWith("/") && !r.startsWith("//") ? r : undefined };
  },
  head: () => ({
    meta: [
      { title: "Login or Sign up — Wholesale Mart" },
      { name: "description", content: "Log in with your phone number and password, or create a new account." },
      { property: "og:title", content: "Login — Wholesale Mart" },
      { property: "og:description", content: "Log in with your phone number to order." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const phone = z.string().trim().regex(/^[0-9]{10}$/, "Enter a 10-digit phone number");
const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  phone,
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
  email: z.union([z.literal(""), z.string().trim().email("Invalid email").max(255)]),
  address: z.string().trim().min(5, "Delivery address is required").max(500),
});

function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", password: "", email: "", address: "" });
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const { session } = useAuth();

  useEffect(() => {
    if (session) navigate({ to: redirect ?? "/", replace: true });
  }, [session, redirect, navigate]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        const p = phone.safeParse(f.phone);
        if (!p.success) return void toast.error(p.error.issues[0]?.message ?? "Invalid input");
        const { error } = await supabase.auth.signInWithPassword({ email: phoneToAuthEmail(p.data), password: f.password });
        if (error) return void toast.error("Wrong phone number or password");
      } else {
        const r = signupSchema.safeParse(f);
        if (!r.success) return void toast.error(r.error.issues[0]?.message ?? "Invalid input");
        const { error } = await supabase.auth.signUp({
          email: phoneToAuthEmail(r.data.phone),
          password: r.data.password,
          options: {
            data: { name: r.data.name, phone: r.data.phone, contact_email: r.data.email, address: r.data.address },
          },
        });
        if (error) {
          return void toast.error(/registered|exists/i.test(error.message) ? "This phone number is already registered" : error.message);
        }
        toast.success("Account created!");
      }
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border bg-surface px-3 py-3 text-base outline-none focus:border-primary";
  return (
    <AppShell hideCartBar>
      <div className="px-4 py-6">
        <div className="card-elevated p-5">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-muted p-1">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`rounded-lg py-2 text-sm font-bold ${mode === m ? "bg-surface text-primary shadow-sm" : "text-muted-foreground"}`}>
                {m === "login" ? "Login" : "Sign up"}
              </button>
            ))}
          </div>
          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field label="Full name *"><input className={input} value={f.name} onChange={set("name")} autoComplete="name" /></Field>
            )}
            <Field label="Phone number *">
              <div className="flex items-center rounded-xl border bg-surface focus-within:border-primary">
                <span className="pl-3 text-muted-foreground">+91</span>
                <input className="w-full bg-transparent px-2 py-3 text-base outline-none" inputMode="numeric" maxLength={10}
                  value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "") })} autoComplete="tel-national" />
              </div>
            </Field>
            <Field label="Password *">
              <input type="password" className={input} value={f.password} onChange={set("password")}
                autoComplete={mode === "login" ? "current-password" : "new-password"} />
            </Field>
            {mode === "signup" && (
              <>
                <Field label="Email (optional)"><input type="email" className={input} value={f.email} onChange={set("email")} /></Field>
                <Field label="Delivery address / location *">
                  <textarea rows={3} className={input} value={f.address} onChange={set("address")} placeholder="Shop name, street, landmark, town" />
                </Field>
              </>
            )}
            <button disabled={busy} className="mt-2 h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-60">
              {busy ? "Please wait…" : mode === "login" ? "Login" : "Create account"}
            </button>
          </form>
          {mode === "login" && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Forgot password? Contact us on{" "}
              <a href="https://wa.me/918194096344" target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">
                +91 81940 96344 (WhatsApp)
              </a>
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
