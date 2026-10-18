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