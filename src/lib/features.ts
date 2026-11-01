// Switches for optional features.
// "Continue with Google" on the customer login: keep false until Google sign-in has been set up in
// Google Cloud and switched on in Supabase (see DEPLOY.md, Part F). Then change it to true.
export const GOOGLE_LOGIN_ENABLED = false;

// Sign up / log in with an email address and password (next to phone number + password).
// Set to false to offer phone number only.
export const EMAIL_LOGIN_ENABLED = true;
