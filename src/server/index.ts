import "dotenv/config";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter, createContext } from "./trpc";

const port = Number(process.env.PORT ?? 3000);
const distRoot = new URL("../../dist/client/", import.meta.url);

async function staticResponse(pathname: string) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const file = Bun.file(new URL(`.${cleanPath}`, distRoot));
  if (await file.exists()) return new Response(file);
  return new Response(Bun.file(new URL("./index.html", distRoot)), { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/healthz") return Response.json({ ok: true });
    if (url.pathname.startsWith("/trpc")) {
      const ctx = createContext(req);
      const response = await fetchRequestHandler({
        endpoint: "/trpc",
        req,
        router: appRouter,
        createContext: () => ctx
      });
      for (const cookie of ctx.setCookies) response.headers.append("Set-Cookie", cookie);
      return response;
    }
    return staticResponse(url.pathname);
  }
});

console.log(`Registry UI listening on http://0.0.0.0:${port}`);
