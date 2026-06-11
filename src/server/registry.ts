export type RegistryConfig = {
  url: string;
  username: string;
  password: string;
  allowHttp: boolean;
};

export class RegistryError extends Error {
  status: number;
  detail?: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

const manifestAccept = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json",
  "application/vnd.docker.distribution.manifest.v1+json"
].join(", ");

export function validateRegistryUrl(url: string, allowHttp: boolean) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
    throw new Error("Registry URL must use HTTPS unless HTTP is explicitly enabled.");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  return parsed.toString().replace(/\/$/, "");
}

export class RegistryClient {
  private baseUrl: string;
  private auth: string;

  constructor(config: RegistryConfig) {
    this.baseUrl = validateRegistryUrl(config.url, config.allowHttp);
    this.auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  }

  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", this.auth);
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      let detail: unknown;
      try {
        detail = await response.json();
      } catch {
        detail = await response.text();
      }
      throw new RegistryError(`Registry request failed with ${response.status}`, response.status, detail);
    }
    return response;
  }

  async ping() {
    await this.request("/v2/");
    return true;
  }

  async catalog(last?: string, n = 100) {
    const params = new URLSearchParams({ n: String(n) });
    if (last) params.set("last", last);
    const res = await this.request(`/v2/_catalog?${params.toString()}`);
    const body = (await res.json()) as { repositories?: string[] };
    return {
      repositories: body.repositories ?? [],
      next: parseNextLast(res.headers.get("link"))
    };
  }

  async tags(name: string) {
    const res = await this.request(`/v2/${name}/tags/list`);
    const body = (await res.json()) as { name: string; tags: string[] | null };
    return { name: body.name, tags: body.tags ?? [] };
  }

  async manifest(name: string, reference: string) {
    const res = await this.request(`/v2/${name}/manifests/${reference}`, {
      headers: { Accept: manifestAccept }
    });
    const body = await res.json();
    return {
      name,
      reference,
      digest: res.headers.get("docker-content-digest"),
      mediaType: res.headers.get("content-type"),
      manifest: body
    };
  }

  async deleteManifest(name: string, digest: string) {
    await this.request(`/v2/${name}/manifests/${digest}`, { method: "DELETE" });
    return true;
  }

  async retag(name: string, sourceReference: string, targetTag: string) {
    const source = await this.request(`/v2/${name}/manifests/${sourceReference}`, {
      headers: { Accept: manifestAccept }
    });
    const mediaType = source.headers.get("content-type") ?? "application/vnd.docker.distribution.manifest.v2+json";
    const manifest = await source.text();
    await this.request(`/v2/${name}/manifests/${targetTag}`, {
      method: "PUT",
      headers: { "Content-Type": mediaType },
      body: manifest
    });
    return true;
  }
}

function parseNextLast(link: string | null) {
  if (!link) return null;
  const match = link.match(/[?&]last=([^&>]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
