import type { Project, SavedView } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { Bookmark, FolderKanban, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "@/stores/toast";
import { useViews } from "@/stores/views";

const item = (active: boolean) =>
  cn(
    "flex h-7 items-center gap-2 rounded-md px-2 text-[13px] text-zinc-600 transition-colors hover:bg-zinc-200/60",
    active && "bg-zinc-200/70 font-medium text-zinc-900",
  );

/** 侧栏的项目入口，下面挂这个项目保存的视图。 */
export function ProjectNav({ project }: { project: Project }) {
  const { slug } = useParams();
  const load = useViews((s) => s.load);
  const views = useViews((s) => s.byProject[project.id]);
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const base = `/${slug}/projects/${project.id}`;
  const viewId = pathname === base ? params.get("view") : null;

  useEffect(() => {
    load(project.id).catch(() => {});
  }, [project.id, load]);

  return (
    <div>
      <NavLink to={base} end className={({ isActive }) => item(isActive && !viewId)}>
        <FolderKanban size={14} className="text-zinc-400" />
        <span className="flex-1 truncate">{project.name}</span>
        <span className="font-mono text-[10px] text-zinc-400">{project.identifier}</span>
      </NavLink>
      {views?.map((v) => (
        <ViewRow key={v.id} view={v} base={base} active={viewId === v.id} />
      ))}
    </div>
  );
}

function ViewRow({ view, base, active }: { view: SavedView; base: string; active: boolean }) {
  const update = useViews((s) => s.update);
  const remove = useViews((s) => s.remove);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(view.name);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (editing) {
    const commit = () => {
      setEditing(false);
      const next = name.trim();
      if (next && next !== view.name) run(() => update(view, { name: next }));
      else setName(view.name);
    };
    return (
      <input
        // 由「重命名」按钮触发，用户期望直接开始输入。
        ref={(el) => el?.focus()}
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            e.stopPropagation();
            setName(view.name);
            setEditing(false);
          }
        }}
        className="ml-5 h-7 w-[calc(100%-1.25rem)] rounded-md border border-accent bg-white px-2 text-[13px] outline-none"
      />
    );
  }
  return (
    <div className="group relative ml-5">
      <NavLink to={`${base}?view=${view.id}`} className={() => cn(item(active), "pr-12")}>
        <Bookmark size={12} className="shrink-0 text-zinc-400" />
        <span className="truncate">{view.name}</span>
      </NavLink>
      <span className="absolute top-1 right-1 hidden gap-0.5 group-hover:flex">
        <button
          type="button"
          aria-label={`重命名视图 ${view.name}`}
          onClick={() => setEditing(true)}
          className="press rounded p-1 text-zinc-400 hover:bg-zinc-300/60 hover:text-zinc-700"
        >
          <Pencil size={11} />
        </button>
        <button
          type="button"
          aria-label={`删除视图 ${view.name}`}
          onClick={() => {
            if (!confirm(`确定删除视图「${view.name}」？任务不受影响。`)) return;
            run(async () => {
              await remove(view);
              if (active) navigate(base, { replace: true });
            });
          }}
          className="press rounded p-1 text-zinc-400 hover:bg-zinc-300/60 hover:text-red-600"
        >
          <Trash2 size={11} />
        </button>
      </span>
    </div>
  );
}
