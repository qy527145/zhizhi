import type { Member, Project, Workspace } from "@zhizhi/shared";
import { create } from "zustand";
import { api } from "@/lib/api";

/** 未进入工作区时调用这些方法属于编程错误，明确报错而不是静默发往 `/undefined`。 */
function requireSlug(slug: string | null): string {
  if (!slug) throw new Error("当前没有选中的工作区");
  return slug;
}

interface WorkspaceState {
  workspaces: Workspace[];
  loaded: boolean;
  slug: string | null;
  projects: Project[];
  members: Member[];
  loadWorkspaces: () => Promise<Workspace[]>;
  enter: (slug: string) => Promise<void>;
  createWorkspace: (name: string, slug: string) => Promise<Workspace>;
  createProject: (b: {
    name: string;
    identifier: string;
    description?: string;
  }) => Promise<Project>;
  updateProject: (id: string, b: { name?: string; description?: string }) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addMember: (email: string) => Promise<void>;
  reset: () => void;
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  loaded: false,
  slug: null,
  projects: [],
  members: [],
  loadWorkspaces: async () => {
    const workspaces = await api.workspaces();
    set({ workspaces, loaded: true });
    return workspaces;
  },
  enter: async (slug) => {
    if (get().slug === slug) return;
    set({ slug, projects: [], members: [] });
    const [projects, members] = await Promise.all([api.projects(slug), api.members(slug)]);
    if (get().slug === slug) set({ projects, members });
  },
  createWorkspace: async (name, slug) => {
    const ws = await api.createWorkspace({ name, slug });
    set((s) => ({ workspaces: [...s.workspaces, ws] }));
    return ws;
  },
  createProject: async (b) => {
    const p = await api.createProject(requireSlug(get().slug), b);
    set((s) => ({ projects: [...s.projects, p] }));
    return p;
  },
  updateProject: async (id, b) => {
    const p = await api.updateProject(id, b);
    set((s) => ({ projects: s.projects.map((x) => (x.id === id ? p : x)) }));
  },
  deleteProject: async (id) => {
    await api.deleteProject(id);
    set((s) => ({ projects: s.projects.filter((x) => x.id !== id) }));
  },
  addMember: async (email) => {
    const m = await api.addMember(requireSlug(get().slug), email);
    set((s) => ({ members: [...s.members, m] }));
  },
  reset: () => set({ workspaces: [], loaded: false, slug: null, projects: [], members: [] }),
}));
