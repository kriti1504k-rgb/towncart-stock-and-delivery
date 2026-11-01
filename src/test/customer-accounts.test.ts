import { describe, expect, it } from 'vitest';
import { customersCsv } from '@/lib/admin-rules';
import { completeProfileSchema, customerEmail, emailLoginSchema, emailSignupSchema, friendlyAuthError, isStaffEmail, loginSchema, signupMetadata, signupSchema } from '@/lib/customer-auth';

const base = { name: 'Ravi Traders', phone: '9111111111', password: 'secret1', alt_phone: '', email: '', address: 'Shop 4, Main Bazaar', lat: null, lng: null, marketing_consent: false };

describe('customer sign-up and login rules', () => {
  it('builds a private login address from the phone number', () => {
    expect(customerEmail('9111111111')).toBe('c9111111111@customer.local');
  });
  it('accepts a normal sign-up and rejects weak or incomplete ones', () => {
    expect(signupSchema.safeParse(base).success).toBe(true);
    expect(signupSchema.safeParse({ ...base, password: '12345' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, address: 'abc' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, alt_phone: '123' }).success).toBe(false);
    expect(signupSchema.safeParse({ ...base, lat: 120, lng: 10 }).success).toBe(false);
  });
  it('sends only what the database needs, and marks the sign-up as a customer', () => {
    const meta = signupMetadata(signupSchema.parse({ ...base, lat: 28.6, lng: 77.2, marketing_consent: true }));
    expect(meta).toMatchObject({ account_type: 'customer', phone: '9111111111', lat: 28.6, lng: 77.2, marketing_consent: 'true' });
    expect(JSON.stringify(meta)).not.toContain('secret1');
    expect('lat' in signupMetadata(signupSchema.parse(base))).toBe(false);
  });
  it('login needs a 10-digit phone and a password', () => {
    expect(loginSchema.safeParse({ phone: '9111111111', password: 'x' }).success).toBe(true);
    expect(loginSchema.safeParse({ phone: '911', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ phone: '9111111111', password: '' }).success).toBe(false);
  });
  it('turns technical errors into plain messages', () => {
    expect(friendlyAuthError('Invalid login credentials', 'login')).toMatch(/Wrong phone number or password/);
    expect(friendlyAuthError('Email not confirmed', 'login')).toMatch(/not confirmed/);
    expect(friendlyAuthError('Database error saving new user', 'signup')).toMatch(/already has an account/);
    expect(friendlyAuthError(undefined, 'signup')).toMatch(/Could not create/);
  });
});

describe('Google sign-in profile step', () => {
  const { password: _unused, ...details } = base;
  it('needs the same details as sign-up, but no password', () => {
    expect(completeProfileSchema.safeParse(details).success).toBe(true);
    expect(completeProfileSchema.safeParse({ ...details, phone: '123' }).success).toBe(false);
    expect(completeProfileSchema.safeParse({ ...details, address: 'ab' }).success).toBe(false);
  });
  it('recognises shop staff logins, so they are not asked for a customer profile', () => {
    expect(isStaffEmail('p8194096344@phone.local')).toBe(true);
    expect(isStaffEmail('sita@gmail.com')).toBe(false);
    expect(isStaffEmail(undefined)).toBe(false);
  });
  it('explains when Google sign-in is not switched on', () => {
    expect(friendlyAuthError('Unsupported provider: provider is not enabled', 'login')).toMatch(/Google sign-in is not available/);
  });
});

describe('customer list download (CSV)', () => {
  const row = { name: 'Ravi', phone: '9111111111', alt_phone: null, email: null, address: 'Shop 4, "Main" Bazaar', maps_link: 'https://www.google.com/maps?q=28.6,77.2', marketing_consent: true, auth_user_id: 'u1', created_at: '2026-10-29T10:00:00Z', orders: 3 };
  it('has a header, quotes awkward text, and shows yes/no columns', () => {
    const lines = customersCsv([row]).split('\r\n');
    expect(lines[0]).toContain('Google Maps link');
    expect(lines[1]).toBe('Ravi,9111111111,,,"Shop 4, ""Main"" Bazaar","https://www.google.com/maps?q=28.6,77.2",Yes,Yes,2026-10-29,3');
  });
  it('defuses spreadsheet formulas typed into names or addresses', () => {
    const out = customersCsv([{ ...row, name: '=HYPERLINK("http://x")', address: '+cmd|calc' }]);
    expect(out).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(out).toContain("'+cmd|calc");
  });
});

describe('email sign-up and login', () => {
  const withEmail = { name: 'Ravi Traders', phone: '9111111111', password: 'secret1', alt_phone: '', email: 'ravi@example.com', address: 'Shop 4, Main Bazaar', lat: null, lng: null, marketing_consent: false };
  it('needs a valid email, and still needs the phone number', () => {
    expect(emailSignupSchema.safeParse(withEmail).success).toBe(true);
    expect(emailSignupSchema.safeParse({ ...withEmail, email: '' }).success).toBe(false);
    expect(emailSignupSchema.safeParse({ ...withEmail, email: 'ravi@' }).success).toBe(false);
    expect(emailSignupSchema.safeParse({ ...withEmail, phone: '' }).success).toBe(false);
  });
  it('passes the real email on so the shop can see it', () => {
    expect(signupMetadata(emailSignupSchema.parse(withEmail))).toMatchObject({ account_type: 'customer', contact_email: 'ravi@example.com', phone: '9111111111' });
  });
  it('email login needs an email and a password', () => {
    expect(emailLoginSchema.safeParse({ email: 'ravi@example.com', password: 'x' }).success).toBe(true);
    expect(emailLoginSchema.safeParse({ email: 'nope', password: 'x' }).success).toBe(false);
    expect(emailLoginSchema.safeParse({ email: 'ravi@example.com', password: '' }).success).toBe(false);
  });
  it('says "email or phone" when an email sign-up is a duplicate', () => {
    expect(friendlyAuthError('User already registered', 'signup', 'email')).toMatch(/email or phone/);
  });
});
