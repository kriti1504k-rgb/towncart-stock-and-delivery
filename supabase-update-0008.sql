-- =====================================================================
-- 0008: customer accounts, customer database fields, map-pin links
-- Safe to run more than once. Run it in Supabase -> SQL Editor.
-- =====================================================================

-- ---------- Orders: alternate phone, map pin (+ clickable Google Maps link), account link ----------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS guest_alt_phone text,
  ADD COLUMN IF NOT EXISTS delivery_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS delivery_lng numeric(9,6),
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_maps_link text GENERATED ALWAYS AS (
    CASE WHEN delivery_lat IS NULL OR delivery_lng IS NULL THEN NULL
         ELSE 'https://www.google.com/maps?q=' || delivery_lat::text || ',' || delivery_lng::text END) STORED;
DO $$ BEGIN ALTER TABLE public.orders ADD CONSTRAINT orders_alt_phone_format CHECK (guest_alt_phone IS NULL OR guest_alt_phone ~ '^[0-9]{10}$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.orders ADD CONSTRAINT orders_location_valid CHECK ((delivery_lat IS NULL AND delivery_lng IS NULL) OR (delivery_lat BETWEEN -90 AND 90 AND delivery_lng BETWEEN -180 AND 180)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS orders_account_id_idx ON public.orders(account_id);

-- ---------- Customers: the one customer database (guests and account holders) ----------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS alt_phone text,
  ADD COLUMN IF NOT EXISTS lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS lng numeric(9,6),
  ADD COLUMN IF NOT EXISTS marketing_consent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS maps_link text GENERATED ALWAYS AS (
    CASE WHEN lat IS NULL OR lng IS NULL THEN NULL
         ELSE 'https://www.google.com/maps?q=' || lat::text || ',' || lng::text END) STORED;
DO $$ BEGIN ALTER TABLE public.customers ADD CONSTRAINT customers_alt_phone_format CHECK (alt_phone IS NULL OR alt_phone ~ '^[0-9]{10}$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.customers ADD CONSTRAINT customers_location_valid CHECK ((lat IS NULL AND lng IS NULL) OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Who can read what ----------
-- Account holders can read only their own customer row, their own orders and those orders' items.
-- (The admin policies from earlier migrations stay in place.) Nobody can write these tables directly.
DROP POLICY IF EXISTS "Own customer read" ON public.customers;
CREATE POLICY "Own customer read" ON public.customers FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
DROP POLICY IF EXISTS "Own orders read" ON public.orders;
CREATE POLICY "Own orders read" ON public.orders FOR SELECT TO authenticated USING (account_id = auth.uid());
DROP POLICY IF EXISTS "Own order items read" ON public.order_items;
CREATE POLICY "Own order items read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.account_id = auth.uid()));

-- ---------- Signing up creates the customer record ----------
-- Only sign-ups that say account_type = 'customer' get a customer row (the admin login does not).
CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  _name text := trim(coalesce(m->>'name', ''));
  _phone text := coalesce(m->>'phone', '');
  _alt text := coalesce(m->>'alt_phone', '');
  _email text := trim(coalesce(m->>'contact_email', ''));
  _address text := trim(coalesce(m->>'address', ''));
  _lat numeric; _lng numeric;
  _consent boolean := coalesce(m->>'marketing_consent', '') = 'true';
BEGIN
  IF coalesce(m->>'account_type', '') <> 'customer' THEN RETURN NEW; END IF;
  IF length(_name) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
  IF _phone !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
  IF _alt <> '' AND _alt !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid alternate phone'; END IF;
  IF length(_address) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Address required'; END IF;
  IF length(_email) > 255 OR (_email <> '' AND _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid email'; END IF;
  IF coalesce(m->>'lat', '') ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' AND coalesce(m->>'lng', '') ~ '^-?[0-9]{1,3}(\.[0-9]+)?$' THEN
    _lat := (m->>'lat')::numeric; _lng := (m->>'lng')::numeric;
    IF _lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180 THEN _lat := NULL; _lng := NULL; END IF;
  END IF;
  INSERT INTO public.customers (id, name, phone, email, address, alt_phone, lat, lng, auth_user_id, marketing_consent, marketing_consent_at)
  VALUES (gen_random_uuid(), _name, _phone, NULLIF(_email, ''), _address, NULLIF(_alt, ''), round(_lat, 6), round(_lng, 6), NEW.id, _consent, CASE WHEN _consent THEN now() END)
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name, email = EXCLUDED.email, address = EXCLUDED.address, alt_phone = EXCLUDED.alt_phone,
    lat = EXCLUDED.lat, lng = EXCLUDED.lng, auth_user_id = EXCLUDED.auth_user_id,
    marketing_consent = EXCLUDED.marketing_consent, marketing_consent_at = EXCLUDED.marketing_consent_at, updated_at = now()
  WHERE customers.auth_user_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This phone number already has an account'; END IF;
  RETURN NEW;
END $$;

-- ---------- Account holders edit their own profile through this checked function ----------
CREATE OR REPLACE FUNCTION public.update_my_profile(_name text, _alt_phone text, _email text, _address text, _lat numeric, _lng numeric, _marketing_consent boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not logged in'; END IF;
  IF length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
  IF coalesce(_alt_phone,'') <> '' AND _alt_phone !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid alternate phone'; END IF;
  IF length(trim(coalesce(_address,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Address required'; END IF;
  IF length(coalesce(_email,'')) > 255 OR (coalesce(_email,'') <> '' AND _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid email'; END IF;
  IF (_lat IS NULL) <> (_lng IS NULL) OR (_lat IS NOT NULL AND (_lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180)) THEN RAISE EXCEPTION 'Invalid location'; END IF;
  UPDATE public.customers SET
    name = trim(_name), alt_phone = NULLIF(_alt_phone, ''), email = NULLIF(trim(coalesce(_email,'')), ''), address = trim(_address),
    lat = round(_lat, 6), lng = round(_lng, 6),
    marketing_consent_at = CASE WHEN coalesce(_marketing_consent,false) AND NOT marketing_consent THEN now() WHEN NOT coalesce(_marketing_consent,false) THEN NULL ELSE marketing_consent_at END,
    marketing_consent = coalesce(_marketing_consent, false), updated_at = now()
  WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_my_profile(text,text,text,text,numeric,numeric,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text,text,text,text,numeric,numeric,boolean) TO authenticated;

-- ---------- Placing an order: now also saves alternate phone, map pin and the account link ----------
DROP FUNCTION IF EXISTS public.set_order_extras(uuid,text,numeric,numeric);
DROP FUNCTION IF EXISTS public.place_guest_order(text,text,text,text,text,jsonb,text);
CREATE OR REPLACE FUNCTION public.place_guest_order(_name text, _phone text, _email text, _address text, _note text, _items jsonb, _token text, _alt_phone text DEFAULT NULL, _lat numeric DEFAULT NULL, _lng numeric DEFAULT NULL, _account uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _customer uuid; _order uuid; _item jsonb; _p public.products%ROWTYPE; _qty int; _total numeric := 0;
BEGIN
 IF length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
 IF coalesce(_phone,'') !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
 IF length(trim(coalesce(_address,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Address required'; END IF;
 IF length(coalesce(_email,'')) > 255 OR (coalesce(_email,'') <> '' AND _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid email'; END IF;
 IF coalesce(_token,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid token'; END IF;
 IF coalesce(_alt_phone,'') <> '' AND _alt_phone !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid alternate phone'; END IF;
 IF (_lat IS NULL) <> (_lng IS NULL) OR (_lat IS NOT NULL AND (_lat NOT BETWEEN -90 AND 90 OR _lng NOT BETWEEN -180 AND 180)) THEN RAISE EXCEPTION 'Invalid location'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid cart'; END IF;
 IF jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid cart'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_items) x WHERE (x->>'quantity')::integer IS NULL OR (x->>'quantity')::integer NOT BETWEEN 1 AND 9999 OR (x->>'product_id') IS NULL) THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
 IF (SELECT count(DISTINCT (x->>'product_id')::uuid) FROM jsonb_array_elements(_items) x) <> jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate product'; END IF;
 INSERT INTO public.customers(id,name,phone,email,address,alt_phone,lat,lng) VALUES(gen_random_uuid(),trim(_name),_phone,NULLIF(trim(_email),''),trim(_address),NULLIF(_alt_phone,''),round(_lat,6),round(_lng,6))
  ON CONFLICT(phone) DO UPDATE SET
   name=CASE WHEN customers.auth_user_id IS NULL THEN EXCLUDED.name ELSE customers.name END,
   email=CASE WHEN customers.auth_user_id IS NULL THEN EXCLUDED.email ELSE customers.email END,
   address=CASE WHEN customers.auth_user_id IS NULL THEN EXCLUDED.address ELSE customers.address END,
   alt_phone=CASE WHEN customers.auth_user_id IS NULL THEN coalesce(EXCLUDED.alt_phone,customers.alt_phone) ELSE customers.alt_phone END,
   lat=CASE WHEN customers.auth_user_id IS NULL AND EXCLUDED.lat IS NOT NULL THEN EXCLUDED.lat ELSE customers.lat END,
   lng=CASE WHEN customers.auth_user_id IS NULL AND EXCLUDED.lat IS NOT NULL THEN EXCLUDED.lng ELSE customers.lng END,
   updated_at=CASE WHEN customers.auth_user_id IS NULL THEN now() ELSE customers.updated_at END
  RETURNING id INTO _customer;
 INSERT INTO public.orders(customer_id,delivery_address,note,guest_name,guest_phone,guest_email,inventory_managed,stock_committed,guest_alt_phone,delivery_lat,delivery_lng,account_id) VALUES(_customer,trim(_address),NULLIF(left(trim(coalesce(_note,'')),500),''),trim(_name),_phone,NULLIF(trim(_email),''),true,true,NULLIF(_alt_phone,''),round(_lat,6),round(_lng,6),_account) RETURNING id INTO _order;
 PERFORM set_config('app.stock_reason','online order',true); PERFORM set_config('app.stock_order',_order::text,true);
 FOR _item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY (value->>'product_id')::uuid LOOP
  _qty := (_item->>'quantity')::int;
  SELECT * INTO _p FROM public.products WHERE id=(_item->>'product_id')::uuid FOR UPDATE;
  IF NOT FOUND OR NOT _p.in_stock OR _p.stock_quantity < _qty THEN RAISE EXCEPTION 'Product unavailable: insufficient stock'; END IF;
  INSERT INTO public.order_items(order_id,product_id,product_name,unit,price,quantity) VALUES(_order,_p.id,_p.name,_p.unit,_p.price,_qty);
  UPDATE public.products SET stock_quantity=stock_quantity-_qty WHERE id=_p.id;
  _total := _total + _p.price * _qty;
 END LOOP;
 UPDATE public.orders SET total=_total WHERE id=_order;
 INSERT INTO public.order_tracking_keys(order_id,token_hash) VALUES(_order,encode(sha256(convert_to(_token,'UTF8')),'hex'));
 PERFORM set_config('app.stock_reason','',true); PERFORM set_config('app.stock_order','',true);
 RETURN _order;
END $$;
REVOKE ALL ON FUNCTION public.place_guest_order(text,text,text,text,text,jsonb,text,text,numeric,numeric,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_guest_order(text,text,text,text,text,jsonb,text,text,numeric,numeric,uuid) TO service_role;
