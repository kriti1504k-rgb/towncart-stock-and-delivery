import { supabase } from '@/integrations/supabase/client';

export const imagePrefix = 'storage:product-images/';
export async function resolveProductImage(image: string | null) {
  if (!image?.startsWith(imagePrefix)) return image;
  const { data, error } = await supabase.storage.from('product-images').createSignedUrl(image.slice(imagePrefix.length), 3600);
  if (error) return null;
  return data.signedUrl;
}