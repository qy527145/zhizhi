import type { Issue, Project, SortBy, TableColumn } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo } from "react";
import { ALL_COLUMNS } from "@/lib/issueView";
import { relativeTime } from "@/lib/utils";
import { useUi } from "@/stores/ui";
import {
  AssigneeButton,
  DueButton,
  LabelChips,
  PriorityButton,
  StartButton,
  StateButton,
} from "./IssueProps";

const SORTABLE: Partial<Record<TableColumn, SortBy>> = {
  priority: "priority",
  start_date: "start_date",
  due_date: "due_date",
  updated_at: "updated_at",
};

function Cell({ issue, col }: { issue: Issue; col: TableColumn }) {
  switch (col) {
    case "state":
      return <StateButton issue={issue} withLabel />;
    case "priority":
      return <PriorityButton issue={issue} withLabel />;
    case "assignee":
      return <AssigneeButton issue={issue} withLabel />;
    case "labels":
      return <LabelChips issue={issue} max={2} />;
    case "start_date":
      return <StartButton issue={issue} />;
    case "due_date":
      return <DueButton issue={issue} withLabel />;
    case "updated_at":
      return <span className="px-1 text-xs text-zinc-500">{relativeTime(issue.updated_at)}</span>;
  }
}

function Header({
  label,
  by,
  sortBy,
  sortDesc,
  onSort,
}: {
  label: string;
  by?: SortBy;
  sortBy: SortBy;
  sortDesc: boolean;
  onSort: (by: SortBy, desc: boolean) => void;
}) {
  if (!by) return <span className="px-1">{label}</span>;
  const active = sortBy === by;
  return (
    <button
      type="button"
      onClick={() => onSort(by, active ? !sortDesc : false)}
      className={cn(
        "press inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-zinc-200/70",
        active && "text-zinc-900",
      )}
    >
      {label}
      {active && (sortDesc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
    </button>
  );
}

/** 表格视图：点表头排序，单元格直接改属性，列的显隐在「显示」菜单里。 */
export function IssueTable({
  issues,
  projects,
  columns,
  sortBy,
  sortDesc,
  onSort,
  onOpen,
}: {
  issues: Issue[];
  projects: Project[];
  columns: TableColumn[];
  sortBy: SortBy;
  sortDesc: boolean;
  onSort: (by: SortBy, desc: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const focusedId = useUi((s) => s.focusedId);
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);
  const visible = ALL_COLUMNS.filter((c) => columns.includes(c.key));

  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <table className="w-full border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-zinc-50/95 backdrop-blur">
          <tr className="h-9 border-b border-zinc-200/80 text-xs font-medium text-zinc-500">
            <th className="w-20 pl-5 font-medium">编号</th>
            <th className="min-w-64 font-medium">
              <Header label="标题" by="title" sortBy={sortBy} sortDesc={sortDesc} onSort={onSort} />
            </th>
            {visible.map((c) => (
              <th key={c.key} className="whitespace-nowrap pr-3 font-medium">
                <Header
                  label={c.label}
                  by={SORTABLE[c.key]}
                  sortBy={sortBy}
                  sortDesc={sortDesc}
                  onSort={onSort}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr
              key={i.id}
              data-issue={i.id}
              onClick={() => onOpen(i.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen(i.id);
              }}
              onMouseMove={() => focusedId !== i.id && useUi.getState().set({ focusedId: i.id })}
              className={cn(
                "h-10 cursor-pointer border-b border-zinc-100",
                focusedId === i.id ? "bg-zinc-100/80" : "hover:bg-zinc-50",
              )}
            >
              <td className="whitespace-nowrap pl-5 font-mono text-xs text-zinc-400">
                {projectById[i.project_id]?.identifier}-{i.seq}
              </td>
              <td className="max-w-96 truncate pr-3 text-[13px] text-zinc-800">{i.title}</td>
              {visible.map((c) => (
                <td key={c.key} className="whitespace-nowrap pr-3">
                  <Cell issue={i} col={c.key} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
