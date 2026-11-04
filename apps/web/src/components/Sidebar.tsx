import { Kbd } from "@zhizhi/ui/ui";
import { Bot, ChevronsUpDown, Inbox, Plus, Search, Settings } from "lucide-react";
import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { cn, modKey } from "@/lib/utils";
import { useAuth } from "@/stores/auth";
import { useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { CreateProjectModal } from "./CreateProjectModal";
import { Avatar } from "./icons";
import { ProjectNav } from "./ProjectNav";

const navItem = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-200/60",
    isActive && "bg-zinc-200/70 font-medium text-zinc-900",
  );

export function Sidebar() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const workspaces = useWorkspace((s) => s.workspaces);
  const projects = useWorkspace((s) => s.projects);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const set = useUi((s) => s.set);
  const [menu, setMenu] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const ws = workspaces.find((w) => w.slug === slug);

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-200/80 bg-zinc-50/80">
      <div className="relative p-2">
        <button
          type="button"
          onClick={() => setMenu((m) => !m)}
          className="flex h-9 w-full items-center gap-2 rounded-md px-2 hover:bg-zinc-200/60"
        >
          <span className="flex size-5 items-center justify-center rounded-md bg-zinc-900 text-[11px] font-semibold text-white">
            {ws?.name.charAt(0)}
          </span>
          <span className="flex-1 truncate text-left text-[13px] font-semibold">{ws?.name}</span>
          <ChevronsUpDown size={13} className="text-zinc-400" />
        </button>
        {menu && (
          <>
            <button
              type="button"
              aria-label="关闭菜单"
              className="fixed inset-0 z-30"
              onClick={() => setMenu(false)}
            />
            <div className="absolute left-2 right-2 top-11 z-40 animate-in rounded-lg bg-white p-1 shadow-pop">
              <div className="px-2 py-1.5 text-[11px] text-zinc-400">{user?.email}</div>
              {workspaces.map((w) => (
                <button
                  type="button"
                  key={w.id}
                  onClick={() => {
                    setMenu(false);
                    navigate(`/${w.slug}`);
                  }}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] hover:bg-zinc-100",
                    w.slug === slug && "font-medium",
                  )}
                >
                  <span className="flex size-4 items-center justify-center rounded bg-zinc-800 text-[10px] text-white">
                    {w.name.charAt(0)}
                  </span>
                  {w.name}
                </button>
              ))}
              <div className="my-1 h-px bg-zinc-100" />
              <button
                type="button"
                onClick={() => navigate("/new")}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-zinc-600 hover:bg-zinc-100"
              >
                <Plus size={14} /> 新建工作区
              </button>
              <button
                type="button"
                onClick={logout}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-zinc-600 hover:bg-zinc-100"
              >
                退出登录
              </button>
            </div>
          </>
        )}
      </div>

      <div className="space-y-0.5 px-2">
        <button
          type="button"
          onClick={() => set({ paletteOpen: true })}
          className="mb-1 flex h-7 w-full items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-400 shadow-xs hover:border-zinc-300"
        >
          <Search size={13} />
          <span className="flex-1 text-left">搜索或执行命令</span>
          <span className="flex gap-0.5">
            <Kbd>{modKey}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <NavLink to={`/${slug}`} end className={navItem}>
          <Inbox size={14} /> 我的任务
        </NavLink>
        <NavLink to={`/${slug}/connect`} className={navItem}>
          <Bot size={14} /> 接入 CLI
        </NavLink>
        <NavLink to={`/${slug}/settings`} className={navItem}>
          <Settings size={14} /> 设置
        </NavLink>
      </div>

      <div className="mt-5 flex items-center justify-between px-4 text-[11px] font-medium text-zinc-400">
        <span>项目</span>
        <button
          type="button"
          onClick={() => setNewProject(true)}
          className="rounded p-0.5 hover:bg-zinc-200 hover:text-zinc-700"
          aria-label="新建项目"
        >
          <Plus size={13} />
        </button>
      </div>
      <nav className="mt-1 flex-1 space-y-0.5 overflow-y-auto px-2">
        {projects.map((p) => (
          <ProjectNav key={p.id} project={p} />
        ))}
        {projects.length === 0 && (
          <button
            type="button"
            onClick={() => setNewProject(true)}
            className="w-full rounded-md px-2 py-1.5 text-left text-xs text-zinc-400 hover:bg-zinc-100"
          >
            + 创建第一个项目
          </button>
        )}
      </nav>

      <div className="flex items-center gap-2 border-t border-zinc-200/80 px-4 py-2.5">
        {user && <Avatar name={user.name} size={20} />}
        <span className="flex-1 truncate text-[13px] text-zinc-700">{user?.name}</span>
        <button
          type="button"
          onClick={() => set({ helpOpen: true })}
          className="text-zinc-400 hover:text-zinc-700"
          title="键盘快捷键"
        >
          <Kbd>?</Kbd>
        </button>
      </div>
      <CreateProjectModal open={newProject} onClose={() => setNewProject(false)} />
    </aside>
  );
}
