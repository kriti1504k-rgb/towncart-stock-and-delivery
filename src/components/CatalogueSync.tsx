import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function CatalogueSync() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-availability'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-history'] });
    };
    const channel = supabase.channel('shop-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_history' }, invalidate)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient]);
  return null;
}