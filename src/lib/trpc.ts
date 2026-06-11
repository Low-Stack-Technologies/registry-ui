import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@/server/trpc";

export const trpc = createTRPCReact<AppRouter>();

export function trpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "/trpc",
        fetch(url, options) {
          return fetch(url, { ...options, credentials: "include" });
        }
      })
    ]
  });
}
