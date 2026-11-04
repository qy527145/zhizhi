import type {
  FilterDimension,
  GroupBy,
  IssueFilter,
  Priority,
  SortBy,
  TableColumn,
  ViewConfig,
} from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { Bookmark, Check, ChevronDown, Search, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ALL_COLUMNS, EMPTY_FILTER } from "@/lib/issueView";
import { type CommandItem, CommandList } from "./CommandList";
import { Popover } from "./DraftPicker";

export interface FilterOption {
  id: string;
  label: string;
  icon?: ReactNode;
  keywords?: string;
}

/** 单个多选维度：选值用可搜索列表，底部可切换为「排除所选」。 */
function DimensionChip({
  title,
  dim,
  options,
  values,
  negate,
  onChange,
}: {
  title: string;
  dim: FilterDimension;
  options: FilterOption[];
  values: string[];
  negate: FilterDimension[];
  onChange: (values: string[], negate: FilterDimension[]) => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const negated = negate.includes(dim);
  const names = options.filter((o) => values.includes(o.id)).map((o) => o.label);
  const items: CommandItem[] = options.map((o) => ({
    id: o.id,
    label: o.label,
    keywords: o.keywords,
    icon: o.icon,
    selected: values.includes(o.id),
    onSelect: () =>
      onChange(
        values.includes(o.id) ? values.filter((v) => v !== o.id) : [...values, o.id],
        negate,
      ),
  }));
  const active = values.length > 0;
  return (
    <>
      <button
        type="button"
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={cn(
          "press inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors",
          active
            ? "border-accent/30 bg-accent-soft text-accent-ink"
            : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
        )}
      >
        {title}
        {active && (
          <span className="max-w-36 truncate font-medium">
            {negated ? "不是 " : ""}
            {names.length > 2 ? `${names.length} 项` : names.join("、")}
          </span>
        )}
        <ChevronDown size={12} className="opacity-60" />
      </button>
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)}>
          <CommandList
            items={items}
            placeholder={`筛选${title}…`}
            footer={
              <button
                type="button"
                onClick={() =>
                  onChange(values, negated ? negate.filter((d) => d !== dim) : [...negate, dim])
                }
                className="flex w-full items-center justify-between text-left hover:text-zinc-700"
              >
                排除所选
                {negated && <Check size={13} className="text-accent" />}
              </button>
            }
          />
        </Popover>
      )}
    </>
  );
}

const DUE_OPTIONS: { value: IssueFilter["due"]; label: string }[] = [
  { value: "overdue", label: "已逾期" },
  { value: "week", label: "7 天内到期" },
  { value: "none", label: "无截止日期" },
];

export function FilterBar({
  filter,
  onChange,
  options,
  inputRef,
}: {
  filter: IssueFilter;
  onChange: (f: IssueFilter) => void;
  options: {
    states: FilterOption[];
    priorities: FilterOption[];
    assignees: FilterOption[];
    labels: FilterOption[];
  };
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const toggleClass = (on: boolean) =>
    cn(
      "press inline-flex h-7 items-center rounded-full border px-2.5 text-xs transition-colors",
      on
        ? "border-accent/30 bg-accent-soft font-medium text-accent-ink"
        : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
    );
  const dirty = JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER);
  return (
    <div className="flex shrink-0 animate-fade flex-wrap items-center gap-1.5 border-b border-zinc-200/80 bg-zinc-50/60 px-5 py-2">
      <div className="relative">
        <Search
          size={12}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-zinc-400"
        />
        <input
          ref={inputRef}
          value={filter.text}
          onChange={(e) => onChange({ ...filter, text: e.target.value })}
          onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLElement).blur()}
          placeholder="搜索标题、描述或编号…"
          className="h-7 w-52 rounded-full border border-zinc-200 bg-white pr-2.5 pl-7 text-xs outline-none transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-3 focus:ring-accent/10"
        />
      </div>
      <DimensionChip
        title="状态"
        dim="states"
        options={options.states}
        values={filter.states}
        negate={filter.negate}
        onChange={(states, negate) => onChange({ ...filter, states, negate })}
      />
      <DimensionChip
        title="优先级"
        dim="priorities"
        options={options.priorities}
        values={filter.priorities}
        negate={filter.negate}
        onChange={(priorities, negate) =>
          onChange({ ...filter, priorities: priorities as Priority[], negate })
        }
      />
      <DimensionChip
        title="负责人"
        dim="assignees"
        options={options.assignees}
        values={filter.assignees}
        negate={filter.negate}
        onChange={(assignees, negate) => onChange({ ...filter, assignees, negate })}
      />
      <DimensionChip
        title="标签"
        dim="labels"
        options={options.labels}
        values={filter.labels}
        negate={filter.negate}
        onChange={(labels, negate) => onChange({ ...filter, labels, negate })}
      />
      {DUE_OPTIONS.map((d) => (
        <button
          type="button"
          key={d.value}
          onClick={() => onChange({ ...filter, due: filter.due === d.value ? "any" : d.value })}
          className={toggleClass(filter.due === d.value)}
        >
          {d.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...filter, hideClosed: !filter.hideClosed })}
        className={toggleClass(filter.hideClosed)}
      >
        隐藏已关闭
      </button>
      {dirty && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER)}
          className="press inline-flex h-7 items-center gap-1 px-1.5 text-xs text-zinc-500 hover:text-zinc-800"
        >
          <X size={12} /> 清除
        </button>
      )}
    </div>
  );
}

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "state", label: "状态" },
  { value: "priority", label: "优先级" },
  { value: "assignee", label: "负责人" },
  { value: "label", label: "标签" },
  { value: "none", label: "不分组" },
];
const SORTS: { value: SortBy; label: string }[] = [
  { value: "manual", label: "手动" },
  { value: "priority", label: "优先级" },
  { value: "due_date", label: "截止日期" },
  { value: "start_date", label: "开始日期" },
  { value: "updated_at", label: "更新时间" },
  { value: "created_at", label: "创建时间" },
  { value: "title", label: "标题" },
];

function Option({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "press rounded-md border px-2 py-1 text-xs transition-colors",
        on
          ? "border-accent/30 bg-accent-soft font-medium text-accent-ink"
          : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
      )}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-zinc-500">{title}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

/** 「显示」菜单：分组、排序、表格列。只展示当前视图用得上的设置。 */
export function DisplayMenu({
  config,
  onChange,
  anchor,
  onClose,
}: {
  config: ViewConfig;
  onChange: (patch: Partial<ViewConfig>) => void;
  anchor: HTMLElement;
  onClose: () => void;
}) {
  const grouped = config.kind === "list" || config.kind === "board";
  const sorted = grouped || config.kind === "table";
  const toggleColumn = (c: TableColumn) =>
    onChange({
      columns: config.columns.includes(c)
        ? config.columns.filter((x) => x !== c)
        : [...config.columns, c],
    });
  return (
    <Popover anchor={anchor} onClose={onClose} width={300}>
      <div className="space-y-3 p-3">
        {grouped && (
          <Section title="分组">
            {GROUPS.map((g) => (
              <Option
                key={g.value}
                on={config.groupBy === g.value}
                onClick={() => onChange({ groupBy: g.value })}
              >
                {g.label}
              </Option>
            ))}
          </Section>
        )}
        {sorted && (
          <Section title="排序">
            {SORTS.map((s) => (
              <Option
                key={s.value}
                on={config.sortBy === s.value}
                onClick={() => onChange({ sortBy: s.value })}
              >
                {s.label}
              </Option>
            ))}
            {config.sortBy !== "manual" && (
              <Option on={config.sortDesc} onClick={() => onChange({ sortDesc: !config.sortDesc })}>
                倒序
              </Option>
            )}
          </Section>
        )}
        {config.kind === "table" && (
          <Section title="表格列">
            {ALL_COLUMNS.map((c) => (
              <Option
                key={c.key}
                on={config.columns.includes(c.key)}
                onClick={() => toggleColumn(c.key)}
              >
                {c.label}
              </Option>
            ))}
          </Section>
        )}
        {!sorted && (
          <p className="text-xs leading-relaxed text-zinc-500">
            这个视图按日期排布，没有分组和排序设置。
          </p>
        )}
      </div>
    </Popover>
  );
}

/** 把当前筛选和显示设置存成命名视图。 */
export function SaveViewPopover({
  anchor,
  onClose,
  onSave,
}: {
  anchor: HTMLElement;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Popover anchor={anchor} onClose={onClose} width={280}>
      <form
        className="flex items-center gap-2 p-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim() || busy) return;
          setBusy(true);
          try {
            await onSave(name.trim());
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Bookmark size={14} className="ml-1 shrink-0 text-zinc-400" />
        <input
          // Popover 先测量位置才渲染内容，外层 effect 运行时输入框还没挂载，所以在挂载回调里聚焦。
          ref={(el) => el?.focus()}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="视图名称，如「本周紧急」"
          className="h-8 min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400"
        />
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="press h-7 shrink-0 rounded-md bg-accent px-2.5 text-xs font-medium text-white disabled:opacity-50"
        >
          保存视图
        </button>
      </form>
    </Popover>
  );
}
