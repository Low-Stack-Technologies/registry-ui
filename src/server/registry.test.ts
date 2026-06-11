import { afterEach, expect, test } from "bun:test";
import { RegistryClient, validateRegistryUrl } from "./registry";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("validateRegistryUrl requires HTTPS by default", () => {
  expect(validateRegistryUrl("https://registry.example.com/", false)).toBe("https://registry.example.com");
  expect(() => validateRegistryUrl("http://registry.example.com", false)).toThrow("HTTPS");
});

test("validateRegistryUrl allows HTTP when explicitly enabled", () => {
  expect(validateRegistryUrl("http://registry.example.com/", true)).toBe("http://registry.example.com");
});

test("RegistryClient sends basic auth and parses catalog pagination", async () => {
  globalThis.fetch = (async (_url, init) => {
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe(`Basic ${Buffer.from("user:pass").toString("base64")}`);
    return new Response(JSON.stringify({ repositories: ["api"] }), {
      headers: { "content-type": "application/json", link: '</v2/_catalog?n=1&last=api>; rel="next"' }
    });
  }) as typeof fetch;

  const client = new RegistryClient({ url: "https://registry.example.com", username: "user", password: "pass", allowHttp: false });
  await expect(client.catalog(undefined, 1)).resolves.toEqual({ repositories: ["api"], next: "api" });
});
