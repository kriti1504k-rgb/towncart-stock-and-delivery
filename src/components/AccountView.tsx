import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { MapPin, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { ConsentField, PasswordField, PhoneField } from '@/components/CustomerAuthCard';
import { LocationPicker } from '@/components/LocationPicker';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { formatINR } from '@/lib/cart';
import { mapLink } from '@/lib/guest-checkout';

const input = 'w-full rounded-lg border bg-surface px-3 py-3 text-base outline-none focus:border-primary';
const finished = (status: string) => status === 'Delivered' || status === 'Cancelled';
type Draft = { name: string; alt_phone: string; email: string; address: string; lat: number | null; lng: number | null; marketing_consent: boolean };

export function AccountView({ session }: { session: Session }) {
  const uid = session.user.id;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const profile = useQuery({
    queryKey: ['my-profile', uid],
    queryFn: async () => { const { data, error } = await supabase.from('customers').select('*').eq('auth_user_id', uid).maybeSingle(); if (error) throw error; return data; },
  });
  const orders = useQuery({
    queryKey: ['my-orders', uid], refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await supabase.from('orders').select('id,status,total,created_at,delivery_address,note,order_items(id,product_name,unit,price,quantity)').eq('account_id', uid).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  async function signOut() { await supabase.auth.signOut(); queryClient.clear(); }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_my_profile', { _name: draft.name, _alt_phone: draft.alt_phone, _email: draft.email, _address: draft.address, _lat: draft.lat, _lng: draft.lng, _marketing_consent: draft.marketing_consent });
      if (error) return void toast.error('Could not save. Please check your details and try again.');
      await queryClient.invalidateQueries({ queryKey: ['my-profile', uid] });
      setEditing(false); toast.success('Details saved.');
    } finally { setSaving(false); }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 6) return void toast.error('Password must be at least 6 characters');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return void toast.error('Could not change the password. Please log in again and retry.');
    setNewPassword(''); toast.success('Password changed.');
  }

  const p = profile.data;
  if (profile.isPending) return <p className="p-6 text-center text-sm text-muted-foreground">Loading your account…</p>;
  if (!p) return <div className="space-y-3 rounded-lg border bg-surface p-4"><p className="text-sm">This login has no customer profile. It may be a shop admin account.</p><div className="flex gap-2"><Button asChild variant="outline"><Link to="/admin">Open admin</Link></Button><Button variant="outline" onClick={signOut}>Log out</Button></div></div>;

  const list = orders.data ?? [];
  const current = list.filter(o => !finished(o.status));
  const history = list.filter(o => finished(o.status));
  const row = (o: (typeof list)[number]) => <details key={o.id} className="rounded-lg border bg-surface">
    <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
      <span className="min-w-0"><span className="block font-bold">Order #{o.id.slice(0, 8).toUpperCase()}</span><span className="block text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString('en-IN')} · {formatINR(Number(o.total))}</span></span>
      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-secondary-foreground">{o.status}</span>
    </summary>
    <div className="space-y-2 border-t p-4 text-sm">
      {o.order_items.map(i => <p key={i.id} className="flex justify-between gap-3"><span className="min-w-0 break-words">{i.product_name} <span className="text-muted-foreground">({i.unit}) × {i.quantity}</span></span><span className="shrink-0 font-semibold">{formatINR(Number(i.price) * i.quantity)}</span></p>)}
      <p className="break-words text-muted-foreground">Delivery: {o.delivery_address}</p>
      {o.note && <p className="break-words text-muted-foreground">Note: {o.note}</p>}
    </div>
  </details>;

  return <div className="space-y-6">
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3"><h1 className="text-xl font-extrabold">My details</h1>{!editing && <Button variant="outline" size="sm" onClick={() => { setDraft({ name: p.name, alt_phone: p.alt_phone ?? '', email: p.email ?? '', address: p.address, lat: p.lat, lng: p.lng, marketing_consent: p.marketing_consent }); setEditing(true); }}><Pencil />Edit</Button>}</div>
      {editing && draft ? <form onSubmit={save} className="space-y-4 rounded-lg border bg-surface p-4">
        <label className="block space-y-1 text-sm font-semibold"><span>Name *</span><input required maxLength={100} className={input} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
        <div className="space-y-1 text-sm"><p className="font-semibold">Phone number</p><p>+91 {p.phone}</p><p className="text-xs text-muted-foreground">Your phone number is your login, so it cannot be changed here. Contact the shop if it has changed.</p></div>
        <PhoneField label="Alternate phone number (optional)" value={draft.alt_phone} onChange={alt_phone => setDraft({ ...draft, alt_phone })} />
        <label className="block space-y-1 text-sm font-semibold"><span>Email (optional)</span><input type="email" maxLength={255} className={input} value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} /></label>
        <label className="block space-y-1 text-sm font-semibold"><span>Delivery address *</span><textarea required minLength={5} maxLength={500} rows={3} className={input} value={draft.address} onChange={e => setDraft({ ...draft, address: e.target.value })} /></label>
        <div className="space-y-2"><h2 className="text-sm font-semibold">Location on map</h2><LocationPicker lat={draft.lat} lng={draft.lng} onChange={(lat, lng) => setDraft(d => d && ({ ...d, lat, lng }))} /></div>
        <ConsentField checked={draft.marketing_consent} onChange={marketing_consent => setDraft({ ...draft, marketing_consent })} />
        <div className="flex gap-2"><Button type="submit" disabled={saving} className="flex-1">{saving ? 'Saving…' : 'Save details'}</Button><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div>
      </form> : <div className="space-y-2 rounded-lg border bg-surface p-4 text-sm">
        <p className="text-base font-bold">{p.name}</p><p>+91 {p.phone}</p>
        {p.alt_phone && <p className="text-muted-foreground">Alternate: +91 {p.alt_phone}</p>}
        {p.email && <p className="break-words text-muted-foreground">{p.email}</p>}
        <p className="whitespace-pre-wrap break-words text-muted-foreground">{p.address}</p>
        {p.lat !== null && p.lng !== null && <a href={mapLink(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-primary"><MapPin className="size-4" />Location pinned · View on map</a>}
        <p className="text-xs text-muted-foreground">Offers and updates: {p.marketing_consent ? 'On' : 'Off'}</p>
      </div>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-extrabold">Current orders</h2>
      {orders.isError && <p className="text-sm text-destructive">Could not load your orders. Pull down to refresh.</p>}
      {!orders.isPending && !current.length && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No orders in progress.</p>}
      {current.map(row)}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-extrabold">Order history</h2>
      {!orders.isPending && !history.length && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Delivered and cancelled orders will appear here.</p>}
      {history.map(row)}
    </section>
    <section className="space-y-3 rounded-lg border bg-surface p-4"><h2 className="text-base font-extrabold">Change password</h2>
      <form onSubmit={changePassword} className="space-y-3"><PasswordField label="New password (at least 6 characters)" autoComplete="new-password" value={newPassword} onChange={setNewPassword} /><Button type="submit" variant="outline">Change password</Button></form>
    </section>
    <Button variant="outline" className="w-full" onClick={signOut}>Log out</Button>
  </div>;
}
