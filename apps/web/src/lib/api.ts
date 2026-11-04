import type {
  Activity,
  ApiToken,
  Attachment,
  Comment,
  CreatedToken,
  Issue,
  IssuePatch,
  IssueState,
  Label,
  Member,
  Project,
  SavedView,
  User,
  ViewConfig,
  Workspace,
} from "@zhizhi/shared";

const TOKEN_KEY = "zhizhi.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** 收到 401 时的回调，由 auth store 注册，用于统一登出。 */
let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    // 服务端错误体固定为 {"error":{"code","message"}}，见 apps/server/src/error.rs。
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.message ?? `请求失败（${res.status}）`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** 上传单个文件，返回附件元数据；正文里用 `![说明](ATT-xxx)` 引用。 */
async function upload(slug: string, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file, file.name || "image.png");
  const token = tokenStore.get();
  const res = await fetch(`/api/workspaces/${slug}/files`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (res.status === 401 && token) onUnauthorized();
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new ApiError(res.status, data?.error?.message ?? `上传失败（${res.status}）`);
  }
  return res.json();
}

/** 附件需要鉴权，不能直接作为 <img src>；取回后转成 blob URL 并缓存。 */
const blobCache = new Map<string, Promise<string>>();
export function attachmentUrl(id: string): Promise<string> {
  let p = blobCache.get(id);
  if (!p) {
    const token = tokenStore.get();
    p = fetch(`/api/files/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, "附件加载失败");
      return URL.createObjectURL(await res.blob());
    });
    // 失败不缓存，下次重试。
    p.catch(() => blobCache.delete(id));
    blobCache.set(id, p);
  }
  return p;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b: unknown) => request<T>("POST", p, b);
const patch = <T>(p: string, b: unknown) => request<T>("PATCH", p, b);
const del = (p: string) => request<void>("DELETE", p);

interface AuthResp {
  token: string;
  user: User;
}

export const api = {
  register: (b: { email: string; name: string; password: string }) =>
    post<AuthResp>("/auth/register", b),
  login: (b: { email: string; password: string }) => post<AuthResp>("/auth/login", b),
  me: () => get<User>("/auth/me"),

  workspaces: () => get<Workspace[]>("/workspaces"),
  createWorkspace: (b: { name: string; slug: string }) => post<Workspace>("/workspaces", b),
  members: (slug: string) => get<Member[]>(`/workspaces/${slug}/members`),
  addMember: (slug: string, email: string) =>
    post<Member>(`/workspaces/${slug}/members`, { email }),

  projects: (slug: string) => get<Project[]>(`/workspaces/${slug}/projects`),
  createProject: (slug: string, b: { name: string; identifier: string; description?: string }) =>
    post<Project>(`/workspaces/${slug}/projects`, b),
  updateProject: (id: string, b: { name?: string; description?: string }) =>
    patch<Project>(`/projects/${id}`, b),
  deleteProject: (id: string) => del(`/projects/${id}`),
  states: (projectId: string) => get<IssueState[]>(`/projects/${projectId}/states`),
  labels: (projectId: string) => get<Label[]>(`/projects/${projectId}/labels`),
  createLabel: (projectId: string, b: { name: string; color: string }) =>
    post<Label>(`/projects/${projectId}/labels`, b),
  deleteLabel: (id: string) => del(`/labels/${id}`),

  issues: (projectId: string) => get<Issue[]>(`/projects/${projectId}/issues`),
  myIssues: (slug: string) => get<Issue[]>(`/workspaces/${slug}/my-issues`),
  issue: (id: string) => get<Issue>(`/issues/${id}`),
  createIssue: (projectId: string, b: IssuePatch & { title: string }) =>
    post<Issue>(`/projects/${projectId}/issues`, b),
  updateIssue: (id: string, b: IssuePatch) => patch<Issue>(`/issues/${id}`, b),
  deleteIssue: (id: string) => del(`/issues/${id}`),
  comments: (id: string) => get<Comment[]>(`/issues/${id}/comments`),
  createComment: (id: string, body: string, attachment_ids: string[] = []) =>
    post<Comment>(`/issues/${id}/comments`, { body, attachment_ids }),
  activities: (id: string) => get<Activity[]>(`/issues/${id}/activities`),

  upload,
  tokens: () => get<ApiToken[]>("/tokens"),
  createToken: (name: string) => post<CreatedToken>("/tokens", { name }),
  revokeToken: (id: string) => del(`/tokens/${id}`),

  views: (projectId: string) => get<SavedView[]>(`/projects/${projectId}/views`),
  createView: (projectId: string, b: { name: string; config: ViewConfig }) =>
    post<SavedView>(`/projects/${projectId}/views`, b),
  updateView: (id: string, b: { name?: string; config?: ViewConfig }) =>
    patch<SavedView>(`/views/${id}`, b),
  deleteView: (id: string) => del(`/views/${id}`),
};
