import { useEffect, useMemo, useState } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { Copy, Database, FileJson, LogOut, MoreHorizontal, RefreshCcw, Search, Settings, Shield, Tags, Trash2, UserCog, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { prettyBytes } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type View = "registry" | "users" | "settings" | "audit";

export function App() {
  const me = trpc.me.useQuery(undefined, { retry: false });

  if (me.isLoading) return <ShellLoader />;
  if (!me.data?.setupComplete) return <Setup />;
  if (!me.data.user) return <Login />;
  return <Dashboard user={me.data.user} />;
}

function Setup() {
  const qc = useQueryClient();
  const setup = trpc.setup.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const [form, setForm] = useState({ adminUsername: "admin", adminPassword: "", registryUrl: "", registryUsername: "", registryPassword: "", allowHttp: false });

  return (
    <AuthFrame title="Configure Registry UI" description="Create the first admin user and connect the shared registry credential.">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setup.mutate(form);
        }}
      >
        <Field label="Admin username"><Input value={form.adminUsername} onChange={(e) => setForm({ ...form, adminUsername: e.target.value })} /></Field>
        <Field label="Admin password"><Input type="password" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} /></Field>
        <Field label="Registry URL"><Input placeholder="https://registry.example.com" value={form.registryUrl} onChange={(e) => setForm({ ...form, registryUrl: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registry username"><Input value={form.registryUsername} onChange={(e) => setForm({ ...form, registryUsername: e.target.value })} /></Field>
          <Field label="Registry password"><Input type="password" value={form.registryPassword} onChange={(e) => setForm({ ...form, registryPassword: e.target.value })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={form.allowHttp} onChange={(e) => setForm({ ...form, allowHttp: e.target.checked })} />
          Allow plain HTTP registry connections
        </label>
        <ErrorText error={setup.error?.message} />
        <Button disabled={setup.isPending}>{setup.isPending ? "Testing registry..." : "Complete setup"}</Button>
      </form>
    </AuthFrame>
  );
}

function Login() {
  const qc = useQueryClient();
  const login = trpc.login.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <AuthFrame title="Registry UI" description="Sign in to browse and manage the configured registry.">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate({ username, password });
        }}
      >
        <Field label="Username"><Input value={username} onChange={(e) => setUsername(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorText error={login.error?.message} />
        <Button disabled={login.isPending}>Sign in</Button>
      </form>
    </AuthFrame>
  );
}

function Dashboard({ user }: { user: { username: string; role: "admin" | "viewer" } }) {
  const qc = useQueryClient();
  const logout = trpc.logout.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const [view, setView] = useState<View>("registry");

  return (
    <div className="flex min-h-screen bg-muted/35">
      <aside className="hidden w-64 border-r bg-background p-4 md:block">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Database className="h-5 w-5" /></div>
          <div>
            <div className="font-semibold">Registry UI</div>
            <div className="text-xs text-muted-foreground">Docker Registry V2</div>
          </div>
        </div>
        <NavButton active={view === "registry"} icon={<Tags />} onClick={() => setView("registry")}>Registry</NavButton>
        {user.role === "admin" && <NavButton active={view === "users"} icon={<Users />} onClick={() => setView("users")}>Users</NavButton>}
        {user.role === "admin" && <NavButton active={view === "settings"} icon={<Settings />} onClick={() => setView("settings")}>Settings</NavButton>}
        {user.role === "admin" && <NavButton active={view === "audit"} icon={<Shield />} onClick={() => setView("audit")}>Audit log</NavButton>}
      </aside>
      <main className="min-w-0 flex-1">
        <header className="flex h-14 items-center justify-between border-b bg-background px-4">
          <div className="flex items-center gap-2 md:hidden">
            <Button size="sm" variant={view === "registry" ? "secondary" : "ghost"} onClick={() => setView("registry")}>Registry</Button>
            {user.role === "admin" && <Button size="sm" variant="ghost" onClick={() => setView("users")}>Admin</Button>}
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">Signed in as <span className="font-medium text-foreground">{user.username}</span></div>
          <div className="flex items-center gap-2">
            <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
            <Button variant="outline" size="sm" onClick={() => logout.mutate()}><LogOut className="h-4 w-4" /> Logout</Button>
          </div>
        </header>
        <div className="p-4 md:p-6">
          {view === "registry" && <RegistryView isAdmin={user.role === "admin"} />}
          {view === "users" && user.role === "admin" && <UsersView />}
          {view === "settings" && user.role === "admin" && <SettingsView />}
          {view === "audit" && user.role === "admin" && <AuditView />}
        </div>
      </main>
    </div>
  );
}

function RegistryView({ isAdmin }: { isAdmin: boolean }) {
  const [filter, setFilter] = useState("");
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const catalog = trpc.catalog.useQuery({ n: 500 }, { retry: false });
  const repos = useMemo(() => (catalog.data?.repositories ?? []).filter((repo) => repo.toLowerCase().includes(filter.toLowerCase())), [catalog.data, filter]);

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div><CardTitle>Repositories</CardTitle><CardDescription>{catalog.data?.repositories.length ?? 0} visible from the configured registry credential.</CardDescription></div>
            <Button variant="outline" size="icon" onClick={() => catalog.refetch()}><RefreshCcw className="h-4 w-4" /></Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Filter repositories" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <ErrorText error={catalog.error?.message} />
          <div className="max-h-[70vh] overflow-auto rounded-md border">
            {repos.map((repo) => (
              <button key={repo} className={`block w-full border-b px-3 py-2 text-left text-sm hover:bg-muted ${selectedRepo === repo ? "bg-accent text-accent-foreground" : ""}`} onClick={() => { setSelectedRepo(repo); setSelectedTag(null); }}>
                {repo}
              </button>
            ))}
            {!repos.length && <div className="p-4 text-sm text-muted-foreground">No repositories found.</div>}
          </div>
        </CardContent>
      </Card>
      <div className="min-w-0">
        {selectedRepo ? <RepositoryDetail name={selectedRepo} selectedTag={selectedTag} setSelectedTag={setSelectedTag} isAdmin={isAdmin} /> : <EmptyState title="Select a repository" body="Repository tags, manifests, layers, and management actions appear here." />}
      </div>
    </div>
  );
}

function RepositoryDetail({ name, selectedTag, setSelectedTag, isAdmin }: { name: string; selectedTag: string | null; setSelectedTag: (tag: string) => void; isAdmin: boolean }) {
  const tags = trpc.tags.useQuery({ name });
  return (
    <Tabs value={selectedTag ? "manifest" : "tags"} onValueChange={(value) => value === "tags" && setSelectedTag("")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="break-all text-2xl font-semibold">{name}</h1><p className="text-sm text-muted-foreground">{tags.data?.tags.length ?? 0} tags</p></div>
        <TabsList><TabsTrigger value="tags">Tags</TabsTrigger><TabsTrigger value="manifest" disabled={!selectedTag}>Manifest</TabsTrigger></TabsList>
      </div>
      <TabsContent value="tags">
        <Card><CardContent className="pt-5"><TagsTable name={name} tags={tags.data?.tags ?? []} isLoading={tags.isLoading} onSelect={setSelectedTag} /></CardContent></Card>
      </TabsContent>
      <TabsContent value="manifest">{selectedTag && <ManifestView name={name} reference={selectedTag} isAdmin={isAdmin} />}</TabsContent>
    </Tabs>
  );
}

function TagsTable({ name, tags, isLoading, onSelect }: { name: string; tags: string[]; isLoading: boolean; onSelect: (tag: string) => void }) {
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading tags...</div>;
  return (
    <Table>
      <THead><TR><TH>Tag</TH><TH>Pull command</TH><TH className="w-16"></TH></TR></THead>
      <TBody>
        {tags.map((tag) => (
          <TR key={tag}>
            <TD className="font-medium">{tag}</TD>
            <TD><code className="break-all rounded bg-muted px-2 py-1 text-xs">docker pull {name}:{tag}</code></TD>
            <TD><Button variant="outline" size="sm" onClick={() => onSelect(tag)}><FileJson className="h-4 w-4" /> Open</Button></TD>
          </TR>
        ))}
        {!tags.length && <TR><TD colSpan={3} className="text-muted-foreground">No tags returned for this repository.</TD></TR>}
      </TBody>
    </Table>
  );
}

function ManifestView({ name, reference, isAdmin }: { name: string; reference: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const manifest = trpc.manifest.useQuery({ name, reference });
  const remove = trpc.deleteManifest.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const data = manifest.data;
  const layers = Array.isArray(data?.manifest?.layers) ? data.manifest.layers : [];
  const manifests = Array.isArray(data?.manifest?.manifests) ? data.manifest.manifests : [];
  const digest = data?.digest ?? data?.manifest?.config?.digest;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><CardTitle className="break-all">{reference}</CardTitle><CardDescription className="break-all">{data?.mediaType ?? "Loading manifest..."}</CardDescription></div>
            {isAdmin && digest && <ManifestActions name={name} reference={reference} digest={digest} onDelete={() => remove.mutate({ name, digest })} deleting={remove.isPending} />}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Meta label="Digest" value={digest} />
          <Meta label="Pull" value={`docker pull ${name}:${reference}`} copy />
          <ErrorText error={manifest.error?.message ?? remove.error?.message} />
        </CardContent>
      </Card>
      {!!layers.length && <LayerTable layers={layers} />}
      {!!manifests.length && <PlatformTable manifests={manifests} />}
      <Card><CardHeader><CardTitle>Raw manifest</CardTitle></CardHeader><CardContent><pre className="max-h-[520px] overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(data?.manifest ?? {}, null, 2)}</pre></CardContent></Card>
    </div>
  );
}

function ManifestActions({ name, reference, digest, onDelete, deleting }: { name: string; reference: string; digest: string; onDelete: () => void; deleting: boolean }) {
  const qc = useQueryClient();
  const retag = trpc.retag.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const [tag, setTag] = useState("");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent>
        <Dialog>
          <DialogTrigger asChild><DropdownMenuItem onSelect={(e) => e.preventDefault()}>Retag</DropdownMenuItem></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Retag manifest</DialogTitle><DialogDescription>Create a new tag from {reference}.</DialogDescription></DialogHeader>
            <div className="grid gap-3"><Field label="New tag"><Input value={tag} onChange={(e) => setTag(e.target.value)} /></Field><ErrorText error={retag.error?.message} /><Button onClick={() => retag.mutate({ name, sourceReference: reference, targetTag: tag })}>Retag</Button></div>
          </DialogContent>
        </Dialog>
        <DropdownMenuItem onClick={() => navigator.clipboard.writeText(digest)}><Copy className="mr-2 h-4 w-4" /> Copy digest</DropdownMenuItem>
        <Dialog>
          <DialogTrigger asChild><DropdownMenuItem className="text-destructive" onSelect={(e) => e.preventDefault()}><Trash2 className="mr-2 h-4 w-4" /> Delete</DropdownMenuItem></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete manifest</DialogTitle><DialogDescription className="break-all">Delete {name}@{digest}. This requires registry delete support and garbage collection to reclaim storage.</DialogDescription></DialogHeader>
            <Button variant="destructive" disabled={deleting} onClick={onDelete}>Delete digest</Button>
          </DialogContent>
        </Dialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LayerTable({ layers }: { layers: Array<{ mediaType?: string; digest?: string; size?: number }> }) {
  return <Card><CardHeader><CardTitle>Layers</CardTitle></CardHeader><CardContent><Table><THead><TR><TH>Digest</TH><TH>Media type</TH><TH>Size</TH></TR></THead><TBody>{layers.map((layer) => <TR key={layer.digest}><TD className="break-all font-mono text-xs">{layer.digest}</TD><TD>{layer.mediaType}</TD><TD>{prettyBytes(layer.size)}</TD></TR>)}</TBody></Table></CardContent></Card>;
}

function PlatformTable({ manifests }: { manifests: Array<{ digest?: string; mediaType?: string; platform?: { os?: string; architecture?: string; variant?: string } }> }) {
  return <Card><CardHeader><CardTitle>Platforms</CardTitle></CardHeader><CardContent><Table><THead><TR><TH>Platform</TH><TH>Digest</TH><TH>Media type</TH></TR></THead><TBody>{manifests.map((item) => <TR key={item.digest}><TD>{[item.platform?.os, item.platform?.architecture, item.platform?.variant].filter(Boolean).join("/")}</TD><TD className="break-all font-mono text-xs">{item.digest}</TD><TD>{item.mediaType}</TD></TR>)}</TBody></Table></CardContent></Card>;
}

function UsersView() {
  const qc = useQueryClient();
  const users = trpc.users.useQuery();
  const create = trpc.createUser.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const update = trpc.updateUser.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "viewer" as "admin" | "viewer" });
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card><CardHeader><CardTitle>Users</CardTitle><CardDescription>Control access to the UI. Registry access still uses the shared credential.</CardDescription></CardHeader><CardContent><Table><THead><TR><TH>Username</TH><TH>Role</TH><TH>Status</TH><TH></TH></TR></THead><TBody>{users.data?.map((user) => <TR key={user.id}><TD>{user.username}</TD><TD><select className="h-8 rounded-md border bg-background px-2 text-sm" value={user.role} onChange={(e) => update.mutate({ id: user.id, role: e.target.value as "admin" | "viewer", disabled: Boolean(user.disabled) })}><option value="viewer">viewer</option><option value="admin">admin</option></select></TD><TD>{user.disabled ? "Disabled" : "Active"}</TD><TD className="flex justify-end gap-2"><ResetPasswordDialog userId={user.id} role={user.role} disabled={Boolean(user.disabled)} onSave={(password) => update.mutate({ id: user.id, role: user.role, disabled: Boolean(user.disabled), password })} /><Button variant="outline" size="sm" onClick={() => update.mutate({ id: user.id, role: user.role, disabled: !user.disabled })}>{user.disabled ? "Enable" : "Disable"}</Button></TD></TR>)}</TBody></Table></CardContent></Card>
      <Card><CardHeader><CardTitle>Create user</CardTitle></CardHeader><CardContent className="grid gap-3"><Field label="Username"><Input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} /></Field><Field label="Password"><Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} /></Field><Field label="Role"><select className="h-9 rounded-md border bg-background px-3 text-sm" value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value as "admin" | "viewer" })}><option value="viewer">viewer</option><option value="admin">admin</option></select></Field><ErrorText error={create.error?.message ?? update.error?.message} /><Button onClick={() => create.mutate(newUser)}><UserCog className="h-4 w-4" /> Create user</Button></CardContent></Card>
    </div>
  );
}

function ResetPasswordDialog({ onSave }: { userId: number; role: "admin" | "viewer"; disabled: boolean; onSave: (password: string) => void }) {
  const [password, setPassword] = useState("");
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" size="sm">Reset password</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Reset password</DialogTitle><DialogDescription>Set a new UI password for this user.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <Field label="New password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Button onClick={() => onSave(password)}>Save password</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingsView() {
  const qc = useQueryClient();
  const settings = trpc.settings.useQuery();
  const save = trpc.updateSettings.useMutation({ onSuccess: () => qc.invalidateQueries() });
  const [form, setForm] = useState({ registryUrl: "", registryUsername: "", registryPassword: "", allowHttp: false });
  useEffect(() => {
    const data = settings.data;
    if (data) {
      setForm((current) => (current.registryUrl ? current : { registryUrl: data.registryUrl, registryUsername: data.registryUsername, allowHttp: data.allowHttp, registryPassword: "" }));
    }
  }, [settings.data]);
  return <Card className="max-w-2xl"><CardHeader><CardTitle>Registry settings</CardTitle><CardDescription>Changes are tested against /v2/ before being saved.</CardDescription></CardHeader><CardContent className="grid gap-4"><Field label="Registry URL"><Input value={form.registryUrl} onChange={(e) => setForm({ ...form, registryUrl: e.target.value })} /></Field><Field label="Registry username"><Input value={form.registryUsername} onChange={(e) => setForm({ ...form, registryUsername: e.target.value })} /></Field><Field label="Registry password"><Input type="password" value={form.registryPassword} onChange={(e) => setForm({ ...form, registryPassword: e.target.value })} /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.allowHttp} onChange={(e) => setForm({ ...form, allowHttp: e.target.checked })} /> Allow HTTP registries</label><ErrorText error={save.error?.message} /><Button disabled={save.isPending} onClick={() => save.mutate(form)}>Save settings</Button></CardContent></Card>;
}

function AuditView() {
  const audit = trpc.auditLog.useQuery();
  return <Card><CardHeader><CardTitle>Audit log</CardTitle><CardDescription>Recent authentication, user, settings, and registry management actions.</CardDescription></CardHeader><CardContent><Table><THead><TR><TH>Time</TH><TH>User</TH><TH>Action</TH><TH>Target</TH><TH>Result</TH></TR></THead><TBody>{audit.data?.map((row: any) => <TR key={row.id}><TD>{row.created_at}</TD><TD>{row.username ?? "-"}</TD><TD>{row.action}</TD><TD className="break-all">{row.target ?? "-"}</TD><TD><Badge variant={row.result === "success" ? "secondary" : "destructive"}>{row.result}</Badge></TD></TR>)}</TBody></Table></CardContent></Card>;
}

function AuthFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4"><Card className="w-full max-w-xl"><CardHeader><div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground"><Database className="h-5 w-5" /></div><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>;
}

function ErrorText({ error }: { error?: string | null }) {
  return error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return <Card><CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center"><FileJson className="mb-3 h-9 w-9 text-muted-foreground" /><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p></CardContent></Card>;
}

function ShellLoader() {
  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Loading Registry UI...</div>;
}

function NavButton({ active, icon, children, onClick }: { active: boolean; icon: React.ReactElement; children: React.ReactNode; onClick: () => void }) {
  return <button className={`mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`} onClick={onClick}>{icon}{children}</button>;
}

function Meta({ label, value, copy }: { label: string; value?: string | null; copy?: boolean }) {
  return <div className="grid gap-1"><div className="text-xs font-medium uppercase text-muted-foreground">{label}</div><div className="flex items-center gap-2"><code className="min-w-0 break-all rounded bg-muted px-2 py-1 text-xs">{value ?? "-"}</code>{copy && value && <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(value)}><Copy className="h-4 w-4" /></Button>}</div></div>;
}
