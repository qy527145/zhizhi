import { Spinner } from "@zhizhi/ui/ui";
import { useEffect, useState } from "react";
import { Navigate, Outlet, useNavigate, useParams } from "react-router";
import { CommandPalette } from "@/components/CommandPalette";
import { CreateIssueModal } from "@/components/CreateIssueModal";
import { PropertyPicker } from "@/components/PropertyPicker";
import { ShortcutHelp } from "@/components/ShortcutHelp";
import { Sidebar } from "@/components/Sidebar";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";

export function WorkspaceLayout() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const workspaces = useWorkspace((s) => s.workspaces);
  const enter = useWorkspace((s) => s.enter);
  const current = useWorkspace((s) => s.slug);
  const projects = useWorkspace((s) => s.projects);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const set = useUi((s) => s.set);
  const [error, setError] = useState(false);
  const exists = workspaces.some((w) => w.slug === slug);

  useEffect(() => {
    if (slug && exists) enter(slug).catch(() => setError(true));
  }, [slug, exists, enter]);

  const anyOverlay = () => {
    const u = useUi.getState();
    return u.paletteOpen || u.createOpen || u.helpOpen || !!u.picker;
  };
  useHotkeys({
    "mod+k": () => set({ paletteOpen: !useUi.getState().paletteOpen, picker: null }),
    c: () => !anyOverlay() && set({ createOpen: true }),
    "/": () => !anyOverlay() && set({ paletteOpen: true }),
    "?": () => !anyOverlay() && set({ helpOpen: true }),
    "[": () => set({ sidebarCollapsed: !useUi.getState().sidebarCollapsed }),
    v: () =>
      !anyOverlay() && set({ viewMode: useUi.getState().viewMode === "list" ? "board" : "list" }),
    "g i": () => navigate(`/${slug}`),
    "g s": () => navigate(`/${slug}/settings`),
    "g p": () => projects[0] && navigate(`/${slug}/projects/${projects[0].id}`),
  });

  if (!exists) return <Navigate to="/" replace />;
  if (error) return <div className="p-10 text-zinc-500">加载工作区失败，请刷新重试。</div>;
  if (current !== slug) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="flex h-full">
      {!collapsed && <Sidebar />}
      <main className="flex min-w-0 flex-1 flex-col">
        <Outlet />
      </main>
      <CommandPalette />
      <CreateIssueModal />
      <PropertyPicker />
      <ShortcutHelp />
    </div>
  );
}
