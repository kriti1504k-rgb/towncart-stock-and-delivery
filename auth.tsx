import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { phoneToAuthEmail } from '@/lib/auth';
import { LanguageProvider, LanguageToggle, useT } from '@/lib/i18n';

export const Route = createFileRoute('/auth')({
  validateSearch: (_s: Record<string, unknown>): { redirect?: string } => ({}),
  head: () => ({ meta: [
    { title: 'Admin Login — Wholesale Mart' },
    { name: 'description', content: 'Secure phone and password login for Wholesale Mart administrators.' },
    { property: 'og:title', content: 'Admin Login — Wholesale Mart' },
    { property: 'og:description', content: 'Administrator access to shop management.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: () => <LanguageProvider><AdminLogin /></LanguageProvider>,
});
function AdminLogin() {
  const { t } = useT();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^[0-9]{10}$/.test(phone)) return void toast.error(t('Enter a 10-digit phone number'));
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: phoneToAuthEmail(phone), password });
      if (error || !data.user) return void toast.error(t('Wrong phone number or password'));
      const { data: allowed, error: roleError } = await supabase.rpc('has_role', { _user_id: data.user.id, _role: 'admin' });
      if (roleError || !allowed) {
        await supabase.auth.signOut();
        return void toast.error(t('This account does not have admin access'));
      }
      await navigate({ to: '/admin', replace: true });
    } catch { toast.error(t('Unable to log in. Please try again.')); }
    finally { setBusy(false); }
  }
  const input = 'w-full rounded-lg border bg-surface px-3 py-3 text-base outline-none focus:border-primary';
  return <AppShell hideCartBar><div className="mx-auto max-w-md px-4 py-8"><div className="mb-6 flex items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">{t('Admin login')}</h1><LanguageToggle /></div><form onSubmit={submit} className="space-y-4">
    <label className="block space-y-1 text-sm font-semibold"><span>{t('Admin phone number')}</span><div className="flex items-center rounded-lg border bg-surface"><span className="pl-3 text-muted-foreground">+91</span><input required pattern="[0-9]{10}" maxLength={10} inputMode="numeric" autoComplete="username" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base outline-none" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} /></div></label>
    <label className="block space-y-1 text-sm font-semibold"><span>{t('Password')}</span><input required type="password" autoComplete="current-password" className={input} value={password} onChange={e => setPassword(e.target.value)} /></label>
    <Button className="h-12 w-full font-bold" disabled={busy}>{busy ? t('Logging in…') : t('Admin login')}</Button>
  </form></div></AppShell>;
}
