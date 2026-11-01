import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { LocationPicker } from '@/components/LocationPicker';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { customerEmail, emailLoginSchema, emailSignupSchema, friendlyAuthError, loginSchema, signupMetadata, signupSchema, type SignupInput } from '@/lib/customer-auth';
import { detailsKey, guestDetailsSchema } from '@/lib/guest-checkout';
import { EMAIL_LOGIN_ENABLED, GOOGLE_LOGIN_ENABLED } from '@/lib/features';
import { SHOP_WHATSAPP } from '@/lib/shop-config';

const input = 'w-full rounded-lg border bg-surface px-3 py-3 text-base outline-none focus:border-primary';

export function PhoneField({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return <label className="block space-y-1 text-sm font-semibold"><span>{label}</span><div className="flex items-center rounded-lg border bg-surface"><span className="pl-3 text-muted-foreground">+91</span><input required={required} pattern="[0-9]{10}" inputMode="numeric" maxLength={10} autoComplete="tel-national" className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base outline-none" value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} /></div></label>;
}

export function PasswordField({ label, value, onChange, autoComplete }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return <label className="block space-y-1 text-sm font-semibold"><span>{label}</span><div className="relative"><input required type={show ? 'text' : 'password'} autoComplete={autoComplete} maxLength={72} className={`${input} pr-12`} value={value} onChange={e => onChange(e.target.value)} /><button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted-foreground hover:text-foreground">{show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div></label>;
}

export function ConsentField({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 size-4 accent-[var(--color-primary,#088a3f)]" checked={checked} onChange={e => onChange(e.target.checked)} /><span>Send me offers and updates from this shop on WhatsApp or SMS. <span className="text-muted-foreground">(optional — you will still get messages about your orders)</span></span></label>;
}

function GoogleG() {
  return <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.5 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4-13.5-9.7l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>;
}

const emptySignup: SignupInput & { password: string } = { name: '', phone: '', password: '', alt_phone: '', email: '', address: '', lat: null, lng: null, marketing_consent: false };

export function CustomerAuthCard() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [busy, setBusy] = useState(false);
  const [login, setLogin] = useState({ phone: '', password: '' });
  const [method, setMethod] = useState<'phone' | 'email'>('phone');
  const [emailLogin, setEmailLogin] = useState({ email: '', password: '' });
  const [form, setForm] = useState(emptySignup);

  // Fill the sign-up form from details already saved on this phone from an earlier order.
  useEffect(() => {
    try {
      const r = guestDetailsSchema.safeParse(JSON.parse(localStorage.getItem(detailsKey) ?? 'null'));
      if (r.success) { setForm(f => ({ ...f, name: r.data.name, phone: r.data.phone, alt_phone: r.data.alt_phone, email: r.data.email, address: r.data.address, lat: r.data.lat, lng: r.data.lng })); setLogin(l => ({ ...l, phone: r.data.phone })); }
    } catch { /* storage unavailable */ }
  }, []);

  async function submitLogin(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = method === 'email' ? emailLoginSchema.safeParse(emailLogin) : loginSchema.safeParse(login);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? 'Check your details');
    setBusy(true);
    try {
      const loginId = 'email' in parsed.data ? parsed.data.email : customerEmail(parsed.data.phone);
      const { error } = await supabase.auth.signInWithPassword({ email: loginId, password: parsed.data.password });
      if (error) toast.error(friendlyAuthError(error.message, 'login', method));
    } finally { setBusy(false); }
  }

  async function submitSignup(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const parsed = (method === 'email' ? emailSignupSchema : signupSchema).safeParse(form);
    if (!parsed.success) return void toast.error(parsed.error.issues[0]?.message ?? 'Check your details');
    setBusy(true);
    try {
      const loginId = method === 'email' ? parsed.data.email : customerEmail(parsed.data.phone);
      const { data, error } = await supabase.auth.signUp({ email: loginId, password: parsed.data.password, options: { data: signupMetadata(parsed.data) } });
      if (error) return void toast.error(friendlyAuthError(error.message, 'signup', method));
      if (!data.session) {
        const retry = await supabase.auth.signInWithPassword({ email: loginId, password: parsed.data.password });
        if (retry.error) return void toast.error(friendlyAuthError(retry.error.message, 'login', method));
      }
      toast.success('Account created. Welcome!');
    } finally { setBusy(false); }
  }

  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/orders` } });
    if (error) { setBusy(false); toast.error(friendlyAuthError(error.message, 'login')); }
  }

  const tabClass = (active: boolean) => `flex-1 rounded-md py-2 text-sm font-semibold ${active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`;
  return <section className="space-y-4 rounded-lg border bg-surface p-4">
    <div><h1 className="text-xl font-extrabold">Your account</h1><p className="text-sm text-muted-foreground">Log in to save your address and see all your orders on any phone. You can also order without an account.</p></div>
    {GOOGLE_LOGIN_ENABLED && <div className="space-y-3"><Button type="button" variant="outline" disabled={busy} onClick={continueWithGoogle} className="h-12 w-full gap-3 text-base font-semibold"><GoogleG />Continue with Google</Button><p className="text-center text-xs text-muted-foreground">New or returning: Google signs you in. We will ask for your phone number and address once.</p><div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use your phone number<span className="h-px flex-1 bg-border" /></div></div>}
    <div className="flex gap-1 rounded-lg bg-muted p-1" role="tablist"><button type="button" role="tab" aria-selected={tab === 'login'} className={tabClass(tab === 'login')} onClick={() => setTab('login')}>Log in</button><button type="button" role="tab" aria-selected={tab === 'signup'} className={tabClass(tab === 'signup')} onClick={() => setTab('signup')}>Create account</button></div>
    {EMAIL_LOGIN_ENABLED && <div className="flex gap-1 rounded-lg border p-1" role="group" aria-label="How do you want to sign in?">{(['phone', 'email'] as const).map(m => <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className={`flex-1 rounded-md py-2 text-sm font-semibold ${method === m ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}>{m === 'phone' ? 'Phone number' : 'Email'}</button>)}</div>}
    {tab === 'login' ? <form onSubmit={submitLogin} className="space-y-4">
      {method === 'email'
        ? <><label className="block space-y-1 text-sm font-semibold"><span>Email *</span><input required type="email" maxLength={255} autoComplete="username" className={input} value={emailLogin.email} onChange={e => setEmailLogin({ ...emailLogin, email: e.target.value })} /></label>
          <PasswordField label="Password *" autoComplete="current-password" value={emailLogin.password} onChange={password => setEmailLogin({ ...emailLogin, password })} /></>
        : <><PhoneField label="Phone number *" required value={login.phone} onChange={phone => setLogin({ ...login, phone })} />
          <PasswordField label="Password *" autoComplete="current-password" value={login.password} onChange={password => setLogin({ ...login, password })} /></>}
      <Button type="submit" disabled={busy} className="h-12 w-full text-base font-bold">{busy ? 'Logging in…' : 'Log in'}</Button>
      <p className="text-center text-sm text-muted-foreground">Forgot your password? {SHOP_WHATSAPP ? <a className="font-semibold text-primary" href={`https://wa.me/91${SHOP_WHATSAPP}?text=${encodeURIComponent('Hello, I forgot my password for my Wholesale Mart account.')}`} target="_blank" rel="noopener noreferrer">Message the shop on WhatsApp</a> : 'Please contact the shop and they will reset it for you.'}</p>
    </form> : <form onSubmit={submitSignup} className="space-y-4">
      <label className="block space-y-1 text-sm font-semibold"><span>Name *</span><input required maxLength={100} autoComplete="name" className={input} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      {method === 'email' && <label className="block space-y-1 text-sm font-semibold"><span>Email * (you will log in with it)</span><input required type="email" maxLength={255} autoComplete="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>}
      <PhoneField label="Phone number *" required value={form.phone} onChange={phone => setForm({ ...form, phone })} />
      <PasswordField label="Create a password * (at least 6 characters)" autoComplete="new-password" value={form.password} onChange={password => setForm({ ...form, password })} />
      <PhoneField label="Alternate phone number (optional)" value={form.alt_phone} onChange={alt_phone => setForm({ ...form, alt_phone })} />
      {method === 'phone' && <label className="block space-y-1 text-sm font-semibold"><span>Email (optional)</span><input type="email" maxLength={255} autoComplete="email" className={input} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>}
      <label className="block space-y-1 text-sm font-semibold"><span>Delivery address *</span><textarea required minLength={5} maxLength={500} rows={3} autoComplete="street-address" className={input} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Shop name, street, landmark, town" /></label>
      <div className="space-y-2"><h2 className="text-sm font-semibold">Pin your location on the map <span className="font-normal text-muted-foreground">(recommended)</span></h2><LocationPicker lat={form.lat} lng={form.lng} onChange={(lat, lng) => setForm(f => ({ ...f, lat, lng }))} /></div>
      <ConsentField checked={form.marketing_consent} onChange={marketing_consent => setForm({ ...form, marketing_consent })} />
      <p className="text-xs text-muted-foreground">We keep your name, phone number, address and map pin to deliver your orders and contact you about them. Only the shop owner can see them.</p>
      <Button type="submit" disabled={busy} className="h-12 w-full text-base font-bold">{busy ? 'Creating account…' : 'Create account'}</Button>
    </form>}
  </section>;
}
