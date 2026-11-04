import { Spinner } from "@zhizhi/ui/ui";
import { useEffect } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router";
import { Toaster } from "@/components/Toaster";
import { AuthPage } from "@/pages/AuthPage";
import { ConnectPage } from "@/pages/ConnectPage";
import { IssuePage } from "@/pages/IssuePage";
import { MyIssuesPage } from "@/pages/MyIssuesPage";
import { NewWorkspacePage } from "@/pages/NewWorkspacePage";
import { ProjectIssuesPage } from "@/pages/ProjectIssuesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { WorkspaceLayout } from "@/pages/WorkspaceLayout";
import { useAuth } from "@/stores/auth";
import { useWorkspace } from "@/stores/workspace";

function FullSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner />
    </div>
  );
}

/** 登录守卫：未登录跳转登录页；已登录则确保工作区列表已加载。 */
function RequireAuth() {
  const user = useAuth((s) => s.user);
  const loaded = useWorkspace((s) => s.loaded);
  const loadWorkspaces = useWorkspace((s) => s.loadWorkspaces);
  const reset = useWorkspace((s) => s.reset);

  useEffect(() => {
    if (user) loadWorkspaces();
    else reset();
  }, [user, loadWorkspaces, reset]);

  if (!user) return <Navigate to="/login" replace />;
  if (!loaded) return <FullSpinner />;
  return <Outlet />;
}

function GuestOnly() {
  const user = useAuth((s) => s.user);
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

function Home() {
  const workspaces = useWorkspace((s) => s.workspaces);
  const last = localStorage.getItem("zhizhi.lastWorkspace");
  const target = workspaces.find((w) => w.slug === last) ?? workspaces[0];
  return <Navigate to={target ? `/${target.slug}` : "/new"} replace />;
}

export default function App() {
  const bootstrapping = useAuth((s) => s.bootstrapping);
  const bootstrap = useAuth((s) => s.bootstrap);
  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(
    () =>
      useWorkspace.subscribe((s, prev) => {
        if (s.slug && s.slug !== prev.slug) localStorage.setItem("zhizhi.lastWorkspace", s.slug);
      }),
    [],
  );

  if (bootstrapping) return <FullSpinner />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<GuestOnly />}>
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route index element={<Home />} />
          <Route path="/new" element={<NewWorkspacePage />} />
          <Route path="/:slug" element={<WorkspaceLayout />}>
            <Route index element={<MyIssuesPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="connect" element={<ConnectPage />} />
            <Route path="projects/:projectId" element={<ProjectIssuesPage />} />
            <Route path="projects/:projectId/issues/:issueId" element={<IssuePage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
