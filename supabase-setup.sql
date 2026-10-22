-- =====================================================================
-- TownCart / Wholesale Mart : complete database setup for a NEW Supabase project
-- Paste this whole file into Supabase -> SQL Editor -> New query -> Run (once).
-- Only needed if you are moving to your own Supabase project.
-- After it runs, follow the "CREATE THE FIRST ADMIN" steps at the very bottom.
-- =====================================================================

-- Private storage bucket for product photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', false)
ON CONFLICT (id) DO NOTHING;


-- ---------- 0000_wholesale_schema.sql ----------
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order int NOT NULL DEFAULT 0
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories public read" ON public.categories FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text NOT NULL,
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  image_url text,
  in_stock boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Products public read" ON public.products FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  phone text NOT NULL UNIQUE CHECK (phone ~ '^[0-9]{10}$'),
  email text,
  address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own customer read" ON public.customers FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Own customer update" ON public.customers FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TYPE public.order_status AS ENUM ('Received','Confirmed','Dispatched','Delivered','Cancelled');

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  delivery_address text NOT NULL,
  note text,
  total numeric(12,2) NOT NULL DEFAULT 0,
  status public.order_status NOT NULL DEFAULT 'Received',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own orders read" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = customer_id);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  unit text NOT NULL,
  price numeric(10,2) NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0)
);
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own order items read" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.customer_id = auth.uid()));

-- Create customer row on signup from metadata
CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.customers (id, name, phone, email, address)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'phone',
    NULLIF(NEW.raw_user_meta_data->>'contact_email', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', '')
  );
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created_customer AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_customer();

-- Place order with server-side prices
CREATE OR REPLACE FUNCTION public.place_order(_address text, _note text, _items jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _order_id uuid;
  _item jsonb;
  _p public.products%ROWTYPE;
  _qty int;
  _total numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF length(trim(coalesce(_address,''))) < 5 THEN RAISE EXCEPTION 'Address required'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  INSERT INTO public.orders (customer_id, delivery_address, note)
  VALUES (auth.uid(), left(trim(_address), 500), NULLIF(left(trim(coalesce(_note,'')), 500), ''))
  RETURNING id INTO _order_id;
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := (_item->>'quantity')::int;
    IF _qty IS NULL OR _qty < 1 OR _qty > 9999 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO _p FROM public.products WHERE id = (_item->>'product_id')::uuid;
    IF NOT FOUND OR NOT _p.in_stock THEN RAISE EXCEPTION 'Product unavailable'; END IF;
    INSERT INTO public.order_items (order_id, product_id, product_name, unit, price, quantity)
    VALUES (_order_id, _p.id, _p.name, _p.unit, _p.price, _qty);
    _total := _total + _p.price * _qty;
  END LOOP;
  UPDATE public.orders SET total = _total WHERE id = _order_id;
  UPDATE public.customers SET address = left(trim(_address), 500) WHERE id = auth.uid();
  RETURN _order_id;
END $$;
REVOKE ALL ON FUNCTION public.place_order(text, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, jsonb) TO authenticated;

INSERT INTO public.categories (name, sort_order) VALUES
 ('Grains & Atta',1),('Oils & Ghee',2),('Pulses',3),('Spices',4),('Snacks & Biscuits',5),('Household',6);

INSERT INTO public.products (category_id, name, unit, price, image_url, in_stock) VALUES
 ((SELECT id FROM public.categories WHERE name='Grains & Atta'),'Basmati Rice','25 kg bag',2150,'/products/rice.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Grains & Atta'),'Chakki Fresh Atta','10 kg bag',420,'/products/atta.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Oils & Ghee'),'Mustard Oil','15 L tin',2350,'/products/oil.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Oils & Ghee'),'Desi Ghee','1 kg pack',620,'/products/ghee.jpg',false),
 ((SELECT id FROM public.categories WHERE name='Pulses'),'Toor Dal','1 kg',145,'/products/dal.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Pulses'),'Sugar','50 kg bag',2100,'/products/sugar.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Spices'),'Turmeric Powder','500 g packet',95,'/products/haldi.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Spices'),'Tata Salt','25 kg box (25 packets)',540,'/products/salt.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Snacks & Biscuits'),'Glucose Biscuits','Box of 48 packets',480,'/products/biscuits.jpg',true),
 ((SELECT id FROM public.categories WHERE name='Household'),'Detergent Powder','1 kg packet',110,'/products/detergent.jpg',true);

-- ---------- 0001_admin_roles_catalogue_permissions.sql ----------
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, role public.app_role NOT NULL, UNIQUE(user_id, role));
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role); $$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
CREATE TABLE public.admin_phone_reservations (auth_email text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.admin_phone_reservations TO service_role;
ALTER TABLE public.admin_phone_reservations ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.assign_reserved_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ BEGIN IF EXISTS (SELECT 1 FROM public.admin_phone_reservations WHERE auth_email = NEW.email) THEN INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING; END IF; RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.assign_reserved_admin() FROM PUBLIC;
CREATE TRIGGER assign_reserved_admin_on_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.assign_reserved_admin();
ALTER TABLE public.products ADD COLUMN description text NOT NULL DEFAULT '';
ALTER TABLE public.products ADD CONSTRAINT products_valid_fields CHECK (length(trim(name)) BETWEEN 1 AND 100 AND length(trim(unit)) BETWEEN 1 AND 60 AND price >= 0 AND price <= 10000000 AND length(description) <= 2000);
ALTER TABLE public.categories ADD CONSTRAINT categories_valid_name CHECK (length(trim(name)) BETWEEN 1 AND 100);
GRANT INSERT, UPDATE, DELETE ON public.products, public.categories TO authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT SELECT ON public.customers, public.order_items TO authenticated;
GRANT ALL ON public.products, public.categories, public.orders, public.order_items, public.customers TO service_role;
CREATE POLICY "Admin product insert" ON public.products FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin product update" ON public.products FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin product delete" ON public.products FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin category insert" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin category update" ON public.categories FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin category delete" ON public.categories FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin order read" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin order status update" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin customer read" ON public.customers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admin order item read" ON public.order_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE FUNCTION public.guard_order_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN IF current_user IN ('anon','authenticated') AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id OR NEW.delivery_address IS DISTINCT FROM OLD.delivery_address OR NEW.note IS DISTINCT FROM OLD.note OR NEW.total IS DISTINCT FROM OLD.total OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN RAISE EXCEPTION 'Only order status may be changed'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER guard_admin_order_changes BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_update();
CREATE POLICY "Admins upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin') AND lower(storage.extension(name)) IN ('jpg','jpeg','png','webp'));
CREATE POLICY "Admins read product images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
ALTER PUBLICATION supabase_realtime ADD TABLE public.products, public.categories, public.orders;

-- ---------- 0002_customer_product_image_read.sql ----------
CREATE POLICY "Customers read catalogue images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'product-images');

-- ---------- 0003_restrict_catalogue_image_reads.sql ----------
DROP POLICY IF EXISTS "Customers read catalogue images" ON storage.objects;
CREATE POLICY "Customers read catalogue images" ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'product-images'
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.image_url = 'storage:product-images/' || storage.objects.name)
);

-- ---------- 0004_guest_checkout_private_tracking.sql ----------
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS guest_name text, ADD COLUMN IF NOT EXISTS guest_phone text, ADD COLUMN IF NOT EXISTS guest_email text;
CREATE TABLE public.order_tracking_keys (order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE);
GRANT ALL ON public.order_tracking_keys TO service_role;
ALTER TABLE public.order_tracking_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Own customer read" ON public.customers;
DROP POLICY IF EXISTS "Own customer update" ON public.customers;
DROP POLICY IF EXISTS "Own orders read" ON public.orders;
DROP POLICY IF EXISTS "Own order items read" ON public.order_items;
REVOKE ALL ON public.customers, public.orders, public.order_items FROM anon;
REVOKE UPDATE ON public.customers FROM authenticated;
REVOKE ALL ON FUNCTION public.place_order(text,text,jsonb) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.place_order(text,text,jsonb) IS 'DEPRECATED: replaced by service-only place_guest_order for account-free checkout';
CREATE OR REPLACE FUNCTION public.place_guest_order(_name text, _phone text, _email text, _address text, _note text, _items jsonb, _token text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _customer uuid; _order uuid; _item jsonb; _p public.products%ROWTYPE; _qty int; _total numeric := 0;
BEGIN
 IF length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
 IF coalesce(_phone,'') !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
 IF length(trim(coalesce(_address,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Address required'; END IF;
 IF length(coalesce(_email,'')) > 255 OR (coalesce(_email,'') <> '' AND _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid email'; END IF;
 IF coalesce(_token,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid token'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid cart'; END IF;
 IF jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid cart'; END IF;
 INSERT INTO public.customers(id,name,phone,email,address) VALUES(gen_random_uuid(),trim(_name),_phone,NULLIF(trim(_email),''),trim(_address))
 ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,address=EXCLUDED.address RETURNING id INTO _customer;
 INSERT INTO public.orders(customer_id,delivery_address,note,guest_name,guest_phone,guest_email)
 VALUES(_customer,trim(_address),NULLIF(left(trim(coalesce(_note,'')),500),''),trim(_name),_phone,NULLIF(trim(_email),'')) RETURNING id INTO _order;
 FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
 _qty := (_item->>'quantity')::int;
 IF _qty IS NULL OR _qty < 1 OR _qty > 9999 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
 SELECT * INTO _p FROM public.products WHERE id=(_item->>'product_id')::uuid FOR SHARE;
 IF NOT FOUND OR NOT _p.in_stock THEN RAISE EXCEPTION 'Product unavailable'; END IF;
 INSERT INTO public.order_items(order_id,product_id,product_name,unit,price,quantity) VALUES(_order,_p.id,_p.name,_p.unit,_p.price,_qty);
 _total := _total + _p.price * _qty;
 END LOOP;
 UPDATE public.orders SET total=_total WHERE id=_order;
 INSERT INTO public.order_tracking_keys(order_id,token_hash) VALUES(_order,encode(sha256(convert_to(_token,'UTF8')),'hex'));
 RETURN _order;
END $$;
REVOKE ALL ON FUNCTION public.place_guest_order(text,text,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_guest_order(text,text,text,text,text,jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.track_guest_order(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE _order public.orders%ROWTYPE;
BEGIN
 IF coalesce(_token,'') !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 SELECT o.* INTO _order FROM public.orders o JOIN public.order_tracking_keys k ON k.order_id=o.id WHERE k.token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex');
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',_order.id,'status',_order.status,'created_at',_order.created_at,'name',_order.guest_name,'delivery_address',_order.delivery_address,'note',_order.note,'total',_order.total,'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'product_name',i.product_name,'unit',i.unit,'price',i.price,'quantity',i.quantity)) FROM public.order_items i WHERE i.order_id=_order.id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.track_guest_order(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_guest_order(text) TO anon,authenticated,service_role;
COMMENT ON TABLE public.order_tracking_keys IS 'Service-only hashed bearer capabilities; no list or raw tokens are exposed';

-- ---------- 0005_protect_guest_order_snapshot.sql ----------
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
  RAISE EXCEPTION 'Only order status may be changed';
 END IF;
 RETURN NEW;
END $$;

-- ---------- 0006_inventory_stock_and_history.sql ----------
ALTER TABLE public.products ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE public.products ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 10;
ALTER TABLE public.products ADD CONSTRAINT products_stock_nonnegative CHECK (stock_quantity >= 0), ADD CONSTRAINT products_threshold_nonnegative CHECK (low_stock_threshold >= 0);
UPDATE public.products SET in_stock = false;
ALTER TABLE public.orders ADD COLUMN inventory_managed boolean NOT NULL DEFAULT false;
ALTER TABLE public.orders ADD COLUMN stock_committed boolean NOT NULL DEFAULT false;
CREATE TABLE public.stock_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
 product_name text NOT NULL, quantity_change integer NOT NULL, stock_after integer NOT NULL,
 reason text NOT NULL CHECK (reason IN ('online order','offline sale','stock added','manual correction','order cancelled')),
 order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL, changed_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stock_history TO authenticated;
GRANT ALL ON public.stock_history TO service_role;
ALTER TABLE public.stock_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read stock history" ON public.stock_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX stock_history_product_date ON public.stock_history(product_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.sync_product_stock() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.in_stock := NEW.stock_quantity > 0; RETURN NEW; END $$;
CREATE TRIGGER sync_product_stock BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();
CREATE OR REPLACE FUNCTION public.log_product_stock() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE delta integer; why text; oid uuid;
BEGIN
 IF TG_OP = 'INSERT' THEN delta := NEW.stock_quantity; ELSE delta := NEW.stock_quantity - OLD.stock_quantity; END IF;
 IF delta = 0 THEN RETURN NEW; END IF;
 why := coalesce(nullif(current_setting('app.stock_reason', true), ''), 'manual correction');
 oid := nullif(current_setting('app.stock_order', true), '')::uuid;
 INSERT INTO public.stock_history(product_id,product_name,quantity_change,stock_after,reason,order_id,changed_by) VALUES(NEW.id,NEW.name,delta,NEW.stock_quantity,why,oid,auth.uid());
 RETURN NEW;
END $$;
CREATE TRIGGER log_product_stock AFTER INSERT OR UPDATE OF stock_quantity ON public.products FOR EACH ROW EXECUTE FUNCTION public.log_product_stock();
CREATE OR REPLACE FUNCTION public.adjust_product_stock(_product_id uuid, _quantity integer, _reason text, _absolute boolean DEFAULT false) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result integer; old_stock integer;
BEGIN
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF _reason NOT IN ('offline sale','stock added','manual correction') OR _reason IS NULL THEN RAISE EXCEPTION 'Invalid reason'; END IF;
 IF _quantity IS NULL OR abs(_quantity::bigint) > 100000000 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
 IF (_reason='offline sale' AND (_quantity >= 0 OR _absolute)) OR (_reason='stock added' AND (_quantity <= 0 OR _absolute)) OR (_absolute AND _quantity < 0) THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
 SELECT stock_quantity INTO old_stock FROM public.products WHERE id=_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
 result := CASE WHEN _absolute THEN _quantity ELSE old_stock + _quantity END;
 IF result < 0 THEN RAISE EXCEPTION 'Not enough stock'; END IF;
 PERFORM set_config('app.stock_reason',_reason,true); PERFORM set_config('app.stock_order','',true);
 UPDATE public.products SET stock_quantity=result WHERE id=_product_id;
 PERFORM set_config('app.stock_reason','',true);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid,integer,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid,integer,text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.guard_order_update() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN RAISE EXCEPTION 'Only order status may be changed'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.handle_order_inventory() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE item record; p public.products%ROWTYPE; delta integer;
BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status OR NOT OLD.inventory_managed THEN RETURN NEW; END IF;
 IF NEW.status='Cancelled' AND OLD.stock_committed THEN delta := 1;
 ELSIF OLD.status='Cancelled' AND NEW.status <> 'Cancelled' AND NOT OLD.stock_committed THEN delta := -1;
 ELSE RETURN NEW; END IF;
 PERFORM set_config('app.stock_reason',CASE WHEN delta=1 THEN 'order cancelled' ELSE 'online order' END,true);
 PERFORM set_config('app.stock_order',NEW.id::text,true);
 FOR item IN SELECT product_id, sum(quantity)::integer AS quantity FROM public.order_items WHERE order_id=NEW.id AND product_id IS NOT NULL GROUP BY product_id ORDER BY product_id LOOP
  SELECT * INTO p FROM public.products WHERE id=item.product_id FOR UPDATE;
  IF NOT FOUND THEN CONTINUE; END IF;
  IF delta=-1 AND p.stock_quantity < item.quantity THEN RAISE EXCEPTION 'Not enough stock to reopen order'; END IF;
  UPDATE public.products SET stock_quantity=stock_quantity + delta*item.quantity WHERE id=item.product_id;
 END LOOP;
 NEW.stock_committed := delta=-1;
 PERFORM set_config('app.stock_reason','',true); PERFORM set_config('app.stock_order','',true);
 RETURN NEW;
END $$;
CREATE TRIGGER inventory_order_status BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.handle_order_inventory();
CREATE OR REPLACE FUNCTION public.place_guest_order(_name text, _phone text, _email text, _address text, _note text, _items jsonb, _token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _customer uuid; _order uuid; _item jsonb; _p public.products%ROWTYPE; _qty int; _total numeric := 0;
BEGIN
 IF length(trim(coalesce(_name,''))) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
 IF coalesce(_phone,'') !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Invalid phone'; END IF;
 IF length(trim(coalesce(_address,''))) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Address required'; END IF;
 IF length(coalesce(_email,'')) > 255 OR (coalesce(_email,'') <> '' AND _email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid email'; END IF;
 IF coalesce(_token,'') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid token'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid cart'; END IF;
 IF jsonb_array_length(_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid cart'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(_items) x WHERE (x->>'quantity')::integer IS NULL OR (x->>'quantity')::integer NOT BETWEEN 1 AND 9999 OR (x->>'product_id') IS NULL) THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
 IF (SELECT count(DISTINCT (x->>'product_id')::uuid) FROM jsonb_array_elements(_items) x) <> jsonb_array_length(_items) THEN RAISE EXCEPTION 'Duplicate product'; END IF;
 INSERT INTO public.customers(id,name,phone,email,address) VALUES(gen_random_uuid(),trim(_name),_phone,NULLIF(trim(_email),''),trim(_address)) ON CONFLICT(phone) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,address=EXCLUDED.address RETURNING id INTO _customer;
 INSERT INTO public.orders(customer_id,delivery_address,note,guest_name,guest_phone,guest_email,inventory_managed,stock_committed) VALUES(_customer,trim(_address),NULLIF(left(trim(coalesce(_note,'')),500),''),trim(_name),_phone,NULLIF(trim(_email),''),true,true) RETURNING id INTO _order;
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
REVOKE ALL ON FUNCTION public.place_guest_order(text,text,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_guest_order(text,text,text,text,text,jsonb,text) TO service_role;
REVOKE ALL ON FUNCTION public.log_product_stock() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.handle_order_inventory() FROM PUBLIC,anon,authenticated;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_history;

-- ---------- small fix for a fresh project ----------
-- Customers now order as guests, so an admin user created from the Supabase dashboard
-- has no phone details. This makes the old signup trigger skip such users instead of failing.
CREATE OR REPLACE FUNCTION public.handle_new_customer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NULLIF(NEW.raw_user_meta_data->>'phone', '') IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.customers (id, name, phone, email, address)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.raw_user_meta_data->>'phone',
    NULLIF(NEW.raw_user_meta_data->>'contact_email', ''),
    COALESCE(NEW.raw_user_meta_data->>'address', '')
  );
  RETURN NEW;
END $$;

-- =====================================================================
-- CREATE THE FIRST ADMIN  (do this AFTER the script above has run)
-- 1. Supabase dashboard -> Authentication -> Users -> Add user -> Create new user
--      Email    : p9876543210@phone.local     (the letter p + the admin's 10-digit phone + @phone.local)
--      Password : choose a strong password
--      Tick "Auto Confirm User", then create.
-- 2. Run the line below in the SQL Editor, using the SAME email as in step 1:
--
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'p9876543210@phone.local';
--
-- Then log in on the website at /auth with the 10-digit phone number and that password.
-- =====================================================================
