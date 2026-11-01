-- =====================================================================
-- 0009: customers who sign in with Google finish their profile (phone + address)
-- Safe to run more than once. Run it in Supabase -> SQL Editor (after 0008).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.complete_my_profile(_name text, _phone text, _alt_phone text, _address text, _lat numeric, _lng numeric, _marketing_consent boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _email text;
  _consent boolean := coalesce(_marketing_consent, false);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not logged in'; END IF;
  SELECT email INTO _email FROM auth.users WHERE id = auth.uid();
  -- Admin logins and phone+password accounts never use this function.
  IF _email IS NULL OR _email ~* '@(phone|customer)\.local$' THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF EXISTS (SELECT 1 FROM public.customers WHERE auth_user_id = auth.uid()) THEN RAISE EXCEPTION 'Profile already exists'; END IF;
  IF length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
  IF coalesce(_phone,'') !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
  IF coalesce(_alt_phone,'') <> '' AND _alt_phone !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid alternate phone'; END IF;
  IF length(trim(coalesce(_address,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Address required'; END IF;
  IF (_lat IS NULL) <> (_lng IS NULL) OR (_lat IS NOT NULL AND (_lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180)) THEN RAISE EXCEPTION 'Invalid location'; END IF;
  INSERT INTO public.customers (id, name, phone, email, address, alt_phone, lat, lng, auth_user_id, marketing_consent, marketing_consent_at)
  VALUES (gen_random_uuid(), trim(_name), _phone, _email, trim(_address), NULLIF(_alt_phone, ''), round(_lat, 6), round(_lng, 6), auth.uid(), _consent, CASE WHEN _consent THEN now() END)
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name, email = EXCLUDED.email, address = EXCLUDED.address, alt_phone = EXCLUDED.alt_phone,
    lat = EXCLUDED.lat, lng = EXCLUDED.lng, auth_user_id = EXCLUDED.auth_user_id,
    marketing_consent = EXCLUDED.marketing_consent, marketing_consent_at = EXCLUDED.marketing_consent_at, updated_at = now()
  WHERE customers.auth_user_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This phone number already has an account'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.complete_my_profile(text,text,text,text,numeric,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_my_profile(text,text,text,text,numeric,numeric,boolean) TO authenticated;
