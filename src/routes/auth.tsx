import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { Eye, EyeOff } from 'lucide-react';
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
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!/^[0-9]{10}$/.test(phone)) return void toast.error(t('Enter a 10-digit phone number'));
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: phoneToAuthEmail(phone), password });
      if (error || !data.user) {
        const reason = (error?.message ?? '').toLowerCase();
        if (reason.includes('not confirmed')) return void toast.error(t('This account is not confirmed yet. Confirm it in Supabase.'));
        if (reason.includes('invalid login')) return void toast.error(t('Wrong phone number or password'));
        return void toast.error(`${t('Could not log in:')} ${error?.message ?? ''}`);
      }
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
    <label className="block space-y-1 text-sm font-semibold"><span>{t('Password')}</span><div className="relative"><input required type={showPassword ? 'text' : 'password'} autoComplete="current-password" className={`${input} pr-12`} value={password} onChange={e => setPassword(e.target.value)} /><button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? t('Hide password') : t('Show password')} title={showPassword ? t('Hide password') : t('Show password')} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div></label>
    <Button className="h-12 w-full font-bold" disabled={busy}>{busy ? t('Logging in…') : t('Admin login')}</Button>
  </form></div></AppShell>;
}
