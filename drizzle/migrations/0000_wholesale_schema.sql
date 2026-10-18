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