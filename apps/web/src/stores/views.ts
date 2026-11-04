import type { SavedView, ViewConfig } from "@zhizhi/shared";
import { create } from "zustand";
import { api } from "@/lib/api";

interface ViewsState {
  /** 每个项目保存的视图；存在即表示已加载。 */
  byProject: Record<string, SavedView[]>;
  load: (projectId: string) => Promise<void>;
  create: (projectId: string, name: string, config: ViewConfig) => Promise<SavedView>;
  update: (v: SavedView, b: { name?: string; config?: ViewConfig }) => Promise<void>;
  remove: (v: SavedView) => Promise<void>;
}

const inflight = new Set<string>();

export const useViews = create<ViewsState>((set, get) => ({
  byProject: {},
  load: async (projectId) => {
    if (get().byProject[projectId] || inflight.has(projectId)) return;
    inflight.add(projectId);
    try {
      const views = await api.views(projectId);
      set((s) => ({ byProject: { ...s.byProject, [projectId]: views } }));
    } finally {
      inflight.delete(projectId);
    }
  },
  create: async (projectId, name, config) => {
    const v = await api.createView(projectId, { name, config });
    set((s) => ({
      byProject: { ...s.byProject, [projectId]: [...(s.byProject[projectId] ?? []), v] },
    }));
    return v;
  },
  update: async (v, b) => {
    const next = await api.updateView(v.id, b);
    set((s) => ({
      byProject: {
        ...s.byProject,
        [v.project_id]: (s.byProject[v.project_id] ?? []).map((x) => (x.id === v.id ? next : x)),
      },
    }));
  },
  remove: async (v) => {
    await api.deleteView(v.id);
    set((s) => ({
      byProject: {
        ...s.byProject,
        [v.project_id]: (s.byProject[v.project_id] ?? []).filter((x) => x.id !== v.id),
      },
    }));
  },
}));
