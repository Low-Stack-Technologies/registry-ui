import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  audit,
  auditRows,
  createSession,
  db,
  deleteSession,
  encrypt,
  findUserById,
  findUserByUsername,
  getSessionUser,
  isSetupComplete,
  listUsers,
  publicUser,
  registrySettings,
  setSetting
} from "./db";
import { RegistryClient, validateRegistryUrl } from "./registry";

export type Context = {
  req: Request;
  setCookies: string[];
  user: ReturnType<typeof getSessionUser>;
  sessionToken: string | null;
};

function parseCookies(req: Request) {
  const header = req.headers.get("cookie") ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

export function createContext(req: Request): Context {
  const cookies = parseCookies(req);
  const token = cookies.registry_ui_session ?? null;
  return { req, setCookies: [], user: getSessionUser(token), sessionToken: token };
}

const t = initTRPC.context<Context>().create();

const publicProcedure = t.procedure;
const authedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
const adminProcedure = authedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

function client() {
  const settings = registrySettings();
  if (!settings) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Registry is not configured." });
  return new RegistryClient(settings);
}

function setSessionCookie(ctx: Context, token: string, expires: string) {
  ctx.setCookies.push(`registry_ui_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${new Date(expires).toUTCString()}`);
}

function clearSessionCookie(ctx: Context) {
  ctx.setCookies.push("registry_ui_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

export const appRouter = t.router({
  status: publicProcedure.query(() => ({ setupComplete: isSetupComplete() })),
  me: publicProcedure.query(({ ctx }) => ({ user: ctx.user, setupComplete: isSetupComplete() })),
  setup: publicProcedure
    .input(
      z.object({
        adminUsername: z.string().min(3),
        adminPassword: z.string().min(8),
        registryUrl: z.string().url(),
        registryUsername: z.string().min(1),
        registryPassword: z.string().min(1),
        allowHttp: z.boolean()
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (isSetupComplete()) throw new TRPCError({ code: "FORBIDDEN", message: "Setup is already complete." });
      const url = validateRegistryUrl(input.registryUrl, input.allowHttp);
      const testClient = new RegistryClient({ url, username: input.registryUsername, password: input.registryPassword, allowHttp: input.allowHttp });
      await testClient.ping();
      const hash = await Bun.password.hash(input.adminPassword);
      db.transaction(() => {
        db.query("INSERT INTO users(username, password_hash, role) VALUES (?, ?, 'admin')").run(input.adminUsername, hash);
        setSetting("registry.url", url);
        setSetting("registry.username", encrypt(input.registryUsername));
        setSetting("registry.password", encrypt(input.registryPassword));
        setSetting("registry.allowHttp", String(input.allowHttp));
        setSetting("setup.complete", "true");
      })();
      const user = findUserByUsername(input.adminUsername);
      if (!user) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const session = createSession(user.id);
      setSessionCookie(ctx, session.token, session.expires);
      audit(user.id, "setup.complete", "registry", "success");
      return { user: publicUser(user) };
    }),
  login: publicProcedure.input(z.object({ username: z.string(), password: z.string() })).mutation(async ({ input, ctx }) => {
    const user = findUserByUsername(input.username);
    if (!user || user.disabled || !(await Bun.password.verify(input.password, user.password_hash))) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid username or password." });
    }
    const session = createSession(user.id);
    setSessionCookie(ctx, session.token, session.expires);
    audit(user.id, "auth.login", null, "success");
    return { user: publicUser(user) };
  }),
  logout: publicProcedure.mutation(({ ctx }) => {
    deleteSession(ctx.sessionToken);
    clearSessionCookie(ctx);
    return true;
  }),
  catalog: authedProcedure.input(z.object({ last: z.string().optional(), n: z.number().min(1).max(500).default(100) })).query(({ input }) => client().catalog(input.last, input.n)),
  tags: authedProcedure.input(z.object({ name: z.string().min(1) })).query(({ input }) => client().tags(input.name)),
  manifest: authedProcedure.input(z.object({ name: z.string().min(1), reference: z.string().min(1) })).query(({ input }) => client().manifest(input.name, input.reference)),
  deleteManifest: adminProcedure.input(z.object({ name: z.string().min(1), digest: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    try {
      await client().deleteManifest(input.name, input.digest);
      audit(ctx.user.id, "registry.delete", `${input.name}@${input.digest}`, "success");
      return true;
    } catch (error) {
      audit(ctx.user.id, "registry.delete", `${input.name}@${input.digest}`, "failure", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }),
  retag: adminProcedure.input(z.object({ name: z.string().min(1), sourceReference: z.string().min(1), targetTag: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    await client().retag(input.name, input.sourceReference, input.targetTag);
    audit(ctx.user.id, "registry.retag", `${input.name}:${input.sourceReference} -> ${input.targetTag}`, "success");
    return true;
  }),
  users: adminProcedure.query(() => listUsers()),
  createUser: adminProcedure.input(z.object({ username: z.string().min(3), password: z.string().min(8), role: z.enum(["admin", "viewer"]) })).mutation(async ({ input, ctx }) => {
    const hash = await Bun.password.hash(input.password);
    db.query("INSERT INTO users(username, password_hash, role) VALUES (?, ?, ?)").run(input.username, hash, input.role);
    audit(ctx.user.id, "user.create", input.username, "success");
    return true;
  }),
  updateUser: adminProcedure.input(z.object({ id: z.number(), role: z.enum(["admin", "viewer"]), disabled: z.boolean(), password: z.string().min(8).optional() })).mutation(async ({ input, ctx }) => {
    const target = findUserById(input.id);
    if (!target) throw new TRPCError({ code: "NOT_FOUND" });
    if (input.password) {
      db.query("UPDATE users SET role = ?, disabled = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.role, input.disabled ? 1 : 0, await Bun.password.hash(input.password), input.id);
    } else {
      db.query("UPDATE users SET role = ?, disabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(input.role, input.disabled ? 1 : 0, input.id);
    }
    audit(ctx.user.id, "user.update", target.username, "success");
    return true;
  }),
  settings: adminProcedure.query(() => {
    const settings = registrySettings();
    return settings ? { registryUrl: settings.url, registryUsername: settings.username, allowHttp: settings.allowHttp } : null;
  }),
  updateSettings: adminProcedure.input(z.object({ registryUrl: z.string().url(), registryUsername: z.string().min(1), registryPassword: z.string().min(1), allowHttp: z.boolean() })).mutation(async ({ input, ctx }) => {
    const url = validateRegistryUrl(input.registryUrl, input.allowHttp);
    await new RegistryClient({ url, username: input.registryUsername, password: input.registryPassword, allowHttp: input.allowHttp }).ping();
    setSetting("registry.url", url);
    setSetting("registry.username", encrypt(input.registryUsername));
    setSetting("registry.password", encrypt(input.registryPassword));
    setSetting("registry.allowHttp", String(input.allowHttp));
    audit(ctx.user.id, "settings.registry.update", url, "success");
    return true;
  }),
  auditLog: adminProcedure.query(() => auditRows())
});

export type AppRouter = typeof appRouter;
