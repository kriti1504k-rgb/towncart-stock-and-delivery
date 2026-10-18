import { createFileRoute } from '@tanstack/react-router';
import { AdminPanel } from '@/components/AdminPanel';

export const Route = createFileRoute('/_authenticated/admin')({
  head: () => ({ meta: [
    { title: 'Store Admin — Wholesale Mart' },
    { name: 'description', content: 'Wholesale Mart store management for authorized administrators.' },
    { property: 'og:title', content: 'Store Admin — Wholesale Mart' },
    { property: 'og:description', content: 'Manage Wholesale Mart orders, products and customers.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: AdminPanel,
});