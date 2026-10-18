import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function CatalogueSync() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', session?.user.id] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    };
    const channel = supabase.channel('shop-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, invalidate)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, invalidate)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, session?.user.id]);
  return null;
}