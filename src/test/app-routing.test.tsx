import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches private guest order links as a public route", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    const matches = router.matchRoutes('/order/' + 'a'.repeat(64));
    expect(matches.at(-1)?.routeId).toBe('/order/$token');
    expect(matches.map(m => m.routeId)).not.toContain('/_authenticated');
  });
  it("matches /admin inside the authenticated layout", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });
    expect(router.matchRoutes('/admin').map(m => m.routeId)).toContain('/_authenticated');
    expect(router.matchRoutes('/admin').at(-1)?.routeId).toBe('/_authenticated/admin');
  });
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });
});
