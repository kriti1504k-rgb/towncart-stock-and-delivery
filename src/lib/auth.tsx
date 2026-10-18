import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Phone-number login: auth needs an email, so we derive a private one from the phone. */
export const phoneToAuthEmail = (phone: string) => `p${phone}@phone.local`;

type AuthCtx = { session: Session | null; ready: boolean };
const Ctx = createContext<AuthCtx>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return <Ctx.Provider value={{ session, ready }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
