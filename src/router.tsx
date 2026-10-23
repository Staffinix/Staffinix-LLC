import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

const getCspNonce = createIsomorphicFn()
  .server(() => getRequestHeader("x-staffinix-csp-nonce"))
  .client(
    () =>
      document.querySelector('meta[property="csp-nonce"]')?.getAttribute("content") ?? undefined,
  );

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    ssr: { nonce: getCspNonce() },
    context: { queryClient },
    scrollRestoration: true,
    scrollToTopSelectors: ["[data-app-scroll]"],
    defaultPreloadStaleTime: 0,
    defaultPreload: "intent",
  });

  return router;
};
