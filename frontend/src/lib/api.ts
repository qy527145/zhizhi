import type {
  Activity,
  Comment,
  Issue,
  IssuePatch,
  IssueState,
  Label,
  Member,
  Project,
  User,
  Workspace,
} from './types'

const TOKEN_KEY = 'zhizhi.token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 收到 401 时的回调，由 auth store 注册，用于统一登出。 */
let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (res.status === 401 && token) onUnauthorized()
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error ?? `请求失败（${res.status}）`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

const get = <T>(p: string) => request<T>('GET', p)
const post = <T>(p: string, b: unknown) => request<T>('POST', p, b)
const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b)
const del = (p: string) => request<void>('DELETE', p)

interface AuthResp {
  token: string
  user: User
}

export const api = {
  register: (b: { email: string; name: string; password: string }) => post<AuthResp>('/auth/register', b),
  login: (b: { email: string; password: string }) => post<AuthResp>('/auth/login', b),
  me: () => get<User>('/auth/me'),

  workspaces: () => get<Workspace[]>('/workspaces'),
  createWorkspace: (b: { name: string; slug: string }) => post<Workspace>('/workspaces', b),
  members: (slug: string) => get<Member[]>(`/workspaces/${slug}/members`),
  addMember: (slug: string, email: string) => post<Member>(`/workspaces/${slug}/members`, { email }),

  projects: (slug: string) => get<Project[]>(`/workspaces/${slug}/projects`),
  createProject: (slug: string, b: { name: string; identifier: string; description?: string }) =>
    post<Project>(`/workspaces/${slug}/projects`, b),
  updateProject: (id: string, b: { name?: string; description?: string }) => patch<Project>(`/projects/${id}`, b),
  deleteProject: (id: string) => del(`/projects/${id}`),
  states: (projectId: string) => get<IssueState[]>(`/projects/${projectId}/states`),
  labels: (projectId: string) => get<Label[]>(`/projects/${projectId}/labels`),
  createLabel: (projectId: string, b: { name: string; color: string }) =>
    post<Label>(`/projects/${projectId}/labels`, b),
  deleteLabel: (id: string) => del(`/labels/${id}`),

  issues: (projectId: string) => get<Issue[]>(`/projects/${projectId}/issues`),
  myIssues: (slug: string) => get<Issue[]>(`/workspaces/${slug}/my-issues`),
  issue: (id: string) => get<Issue>(`/issues/${id}`),
  createIssue: (projectId: string, b: IssuePatch & { title: string }) => post<Issue>(`/projects/${projectId}/issues`, b),
  updateIssue: (id: string, b: IssuePatch) => patch<Issue>(`/issues/${id}`, b),
  deleteIssue: (id: string) => del(`/issues/${id}`),
  comments: (id: string) => get<Comment[]>(`/issues/${id}/comments`),
  createComment: (id: string, body: string) => post<Comment>(`/issues/${id}/comments`, { body }),
  activities: (id: string) => get<Activity[]>(`/issues/${id}/activities`),
}
