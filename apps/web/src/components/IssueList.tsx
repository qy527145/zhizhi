import type { Issue, IssueState, Project } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { ChevronDown, Plus } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useUi } from "@/stores/ui";
import { AssigneeButton, DueButton, LabelChips, PriorityButton, StateButton } from "./IssueProps";
import { StateIcon } from "./icons";

export interface IssueGroup {
  key: string;
  title: string;
  state?: IssueState;
  issues: Issue[];
}

const Row = memo(function Row({
  issue,
  project,
  focused,
  onOpen,
}: {
  issue: Issue;
  project?: Project;
  focused: boolean;
  onOpen: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const flash = useUi((s) => s.flashId === issue.id);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: "nearest" });
  }, [focused]);
  return (
    // 行内含属性按钮，不能整体换成 <button>；用 role + 键盘处理补齐可访问性。
    // biome-ignore lint/a11y/useSemanticElements: 内部还有属性按钮，不能嵌套 <button>
    <div
      ref={ref}
      role="button"
      tabIndex={-1}
      data-issue={issue.id}
      onClick={() => onOpen(issue.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(issue.id);
      }}
      onAnimationEnd={() => flash && useUi.getState().set({ flashId: null })}
      onMouseMove={() => !focused && useUi.getState().set({ focusedId: issue.id })}
      className={cn(
        "group flex h-10 cursor-pointer items-center gap-2 border-b border-zinc-100 pl-5 pr-4 transition-colors",
        focused ? "bg-zinc-100/80" : "hover:bg-zinc-50",
        flash && "animate-flash",
      )}
    >
      <PriorityButton issue={issue} />
      <span className="w-[64px] shrink-0 font-mono text-xs text-zinc-400">
        {project?.identifier}-{issue.seq}
      </span>
      <StateButton issue={issue} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-800">{issue.title}</span>
      <LabelChips issue={issue} />
      <DueButton issue={issue} />
      <AssigneeButton issue={issue} />
    </div>
  );
});

export function IssueList({
  groups,
  projects,
  onOpen,
  onQuickCreate,
}: {
  groups: IssueGroup[];
  projects: Project[];
  onOpen: (id: string) => void;
  onQuickCreate?: (stateId: string) => void;
}) {
  const focusedId = useUi((s) => s.focusedId);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  return (
    <div className="flex-1 overflow-y-auto">
      {groups.map((g) => (
        <section key={g.key}>
          <div className="sticky top-0 z-10 flex h-9 items-center gap-2 border-b border-zinc-100 bg-zinc-50/95 pl-4 pr-4 backdrop-blur">
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
              className="flex items-center gap-2 text-[13px] font-medium text-zinc-700"
            >
              <ChevronDown
                size={13}
                className={cn(
                  "text-zinc-400 transition-transform",
                  collapsed[g.key] && "-rotate-90",
                )}
              />
              {g.state && <StateIcon group={g.state.group} color={g.state.color} />}
              {g.title}
              <span className="font-normal text-zinc-400">{g.issues.length}</span>
            </button>
            <span className="flex-1" />
            {onQuickCreate && g.state && (
              <button
                type="button"
                onClick={() => onQuickCreate(g.state?.id ?? "")}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                aria-label="在此状态下新建任务"
              >
                <Plus size={13} />
              </button>
            )}
          </div>
          {!collapsed[g.key] &&
            g.issues.map((i) => (
              <Row
                key={i.id}
                issue={i}
                project={projectById[i.project_id]}
                focused={focusedId === i.id}
                onOpen={onOpen}
              />
            ))}
        </section>
      ))}
    </div>
  );
}
