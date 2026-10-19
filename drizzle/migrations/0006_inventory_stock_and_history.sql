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