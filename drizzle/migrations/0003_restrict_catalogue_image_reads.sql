DROP POLICY IF EXISTS "Customers read catalogue images" ON storage.objects;
CREATE POLICY "Customers read catalogue images" ON storage.objects FOR SELECT TO anon, authenticated
USING (
  bucket_id = 'product-images'
  AND EXISTS (SELECT 1 FROM public.products p WHERE p.image_url = 'storage:product-images/' || storage.objects.name)
);