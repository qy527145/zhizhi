import type { Issue, StateGroup } from "@zhizhi/shared";
import { Spinner } from "@zhizhi/ui/ui";
import {
  AlarmClock,
  CircleCheckBig,
  CircleDot,
  Flame,
  FolderKanban,
  LayoutDashboard,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Avatar } from "@/components/icons";
import { PRIORITIES, STATE_GROUP_LABEL } from "@/lib/constants";
import { computeStats, GROUP_ORDER, type Stats, type TrendPoint } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { useIssues } from "@/stores/issues";
import { useWorkspace } from "@/stores/workspace";

const GROUP_COLOR: Record<StateGroup, string> = {
  backlog: "#a1a1aa",
  unstarted: "#7a5af8",
  started: "#3f5bd9",
  completed: "#12a150",
  cancelled: "#d4d4d8",
};

/** 数字从 0 缓动到目标值；目标变化时从当前值继续过渡。 */
function useCountUp(target: number, duration = 900) {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      from.current = target;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const v = origin + (target - origin) * (1 - (1 - p) ** 4);
      setValue(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** 首帧后才置 true，让 CSS transition 有起点可过渡。 */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setM(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return m;
}

export function DashboardPage() {
  const { slug } = useParams();
  const projects = useWorkspace((s) => s.projects);
  const members = useWorkspace((s) => s.members);
  const projectIssues = useIssues((s) => s.projectIssues);
  const byId = useIssues((s) => s.byId);
  const meta = useIssues((s) => s.meta);
  const loadProject = useIssues((s) => s.loadProject);
  const [scope, setScope] = useState<string>("all");
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all(projects.map((p) => loadProject(p.id))).catch((e) => setError(e.message));
  }, [projects, loadProject]);

  const loaded = projects.every((p) => projectIssues[p.id] && meta[p.id]);
  const scoped = scope === "all" ? projects : projects.filter((p) => p.id === scope);

  const { stats, perProject } = useMemo(() => {
    const stateMap = new Map<string, StateGroup>();
    for (const p of projects) for (const s of meta[p.id]?.states ?? []) stateMap.set(s.id, s.group);
    const lookup = (id: string) => stateMap.get(id);
    const issuesOf = (pid: string): Issue[] =>
      (projectIssues[pid] ?? []).flatMap((id) => byId[id] ?? []);
    return {
      stats: computeStats(
        scoped.flatMap((p) => issuesOf(p.id)),
        lookup,
      ),
      perProject: projects.map((p) => ({
        project: p,
        stats: computeStats(issuesOf(p.id), lookup),
      })),
    };
  }, [projects, scoped, meta, projectIssues, byId]);

  if (error) return <div className="p-10 text-zinc-500">{error}</div>;
  if (!loaded) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const memberName = (id: string | null) =>
    id ? (members.find((m) => m.id === id)?.name ?? "未知成员") : "未分配";

  return (
    <div className="relative flex-1 overflow-y-auto bg-surface">
      <div
        aria-hidden
        className="dash-aurora pointer-events-none absolute inset-x-0 top-0 h-80 opacity-70"
      />
      <div className="relative mx-auto max-w-6xl px-8 py-8">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-medium text-zinc-500">
              <LayoutDashboard size={14} /> 统计看板
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
              {scope === "all" ? "全部项目概览" : scoped[0]?.name}
            </h1>
          </div>
          <ScopeSwitch
            value={scope}
            onChange={setScope}
            options={[{ id: "all", name: "全部" }, ...projects]}
          />
        </header>

        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white/60 p-16 text-center text-zinc-500">
            还没有项目，创建一个项目后这里会出现统计。
          </div>
        ) : (
          <div key={scope} className="space-y-4">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <KpiCard i={0} icon={ListTodo} label="任务总数" value={stats.total} tone="#3f5bd9" />
              <KpiCard
                i={1}
                icon={CircleDot}
                label="进行中"
                value={stats.started}
                tone="#7a5af8"
                sub={`${stats.open} 个未关闭`}
              />
              <KpiCard
                i={2}
                icon={CircleCheckBig}
                label="已完成"
                value={stats.completed}
                tone="#12a150"
                spark={stats.trend.map((t) => t.completed)}
              />
              <KpiCard
                i={3}
                icon={AlarmClock}
                label="已逾期"
                value={stats.overdue}
                tone={stats.overdue > 0 ? "#ef4444" : "#a1a1aa"}
                sub={`${stats.dueSoon} 个 7 天内到期`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card i={4} title="完成率" className="flex flex-col">
                <ProgressRing stats={stats} />
              </Card>
              <Card i={5} title="近 14 天趋势" className="lg:col-span-2" extra={<Legend />}>
                <TrendChart data={stats.trend} />
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card i={6} title="优先级分布">
                <PriorityBars stats={stats} />
              </Card>
              <Card i={7} title="成员负载" className="lg:col-span-2">
                <Workload stats={stats} name={memberName} />
              </Card>
            </div>

            {scope === "all" && (
              <Card i={8} title="项目进度">
                <div className="divide-y divide-zinc-100">
                  {perProject.map(({ project, stats: s }, idx) => (
                    <ProjectRow
                      key={project.id}
                      slug={slug ?? ""}
                      project={project}
                      stats={s}
                      idx={idx}
                    />
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ScopeSwitch({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; name: string }[];
}) {
  return (
    <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-xl bg-white/70 p-1 shadow-xs ring-1 ring-zinc-200/80 backdrop-blur">
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "press h-7 shrink-0 rounded-lg px-3 text-[12px] whitespace-nowrap text-zinc-500 transition-all duration-200 hover:text-zinc-900",
            value === o.id && "bg-zinc-900 text-white shadow-sm hover:text-white",
          )}
        >
          {o.name}
        </button>
      ))}
    </div>
  );
}

function Card({
  i,
  title,
  extra,
  className,
  children,
}: {
  i: number;
  title: string;
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{ animationDelay: `${i * 50}ms` } as CSSProperties}
      className={cn(
        "dash-card rounded-2xl border border-zinc-200/70 bg-white/85 shadow-xs p-5 backdrop-blur animate-rise",
        className,
      )}
    >
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-zinc-800">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function KpiCard({
  i,
  icon: Icon,
  label,
  value,
  tone,
  sub,
  spark,
}: {
  i: number;
  icon: LucideIcon;
  label: string;
  value: number;
  tone: string;
  sub?: string;
  spark?: number[];
}) {
  const v = useCountUp(value);
  return (
    <section
      style={{ animationDelay: `${i * 50}ms`, "--tone": tone } as CSSProperties}
      className="dash-card group relative overflow-hidden rounded-2xl border border-zinc-200/70 bg-white/85 shadow-xs p-5 backdrop-blur animate-rise"
    >
      <div
        aria-hidden
        className="absolute -top-10 -right-10 size-32 rounded-full opacity-15 blur-2xl transition-opacity duration-500 group-hover:opacity-30"
        style={{ background: tone }}
      />
      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
        <span
          className="flex size-6 items-center justify-center rounded-lg"
          style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
        >
          <Icon size={13} />
        </span>
        {label}
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">
          {Math.round(v)}
        </span>
        {spark && <Sparkline data={spark} color={tone} />}
      </div>
      {sub && <div className="mt-1 text-[11px] text-zinc-400">{sub}</div>}
    </section>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 72;
  const h = 24;
  const max = Math.max(1, ...data);
  const pts = data.map((d, i) => `${(i / (data.length - 1)) * w},${h - (d / max) * (h - 2) - 1}`);
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="dash-draw"
      />
    </svg>
  );
}

function ProgressRing({ stats }: { stats: Stats }) {
  const mounted = useMounted();
  const pct = useCountUp(stats.completionRate * 100, 1200);
  const r = 62;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, stats.total);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5">
      <div className="relative">
        <svg width={160} height={160} viewBox="0 0 160 160" className="-rotate-90" aria-hidden>
          <defs>
            <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3f5bd9" />
              <stop offset="100%" stopColor="#12a150" />
            </linearGradient>
          </defs>
          <circle cx={80} cy={80} r={r} fill="none" stroke="#f4f4f5" strokeWidth={12} />
          <circle
            cx={80}
            cy={80}
            r={r}
            fill="none"
            stroke="url(#ring-grad)"
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={mounted ? c * (1 - stats.completionRate) : c}
            style={{ transition: "stroke-dashoffset 1.2s var(--ease-out)" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums tracking-tight">
            {pct.toFixed(0)}%
          </span>
          <span className="text-[11px] text-zinc-400">不含已取消</span>
        </div>
      </div>
      <div className="w-full">
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          {GROUP_ORDER.map((g) => {
            const w = (stats.byGroup[g] / total) * 100;
            return (
              <div
                key={g}
                title={`${STATE_GROUP_LABEL[g]} ${stats.byGroup[g]}`}
                style={{
                  width: mounted ? `${w}%` : 0,
                  background: GROUP_COLOR[g],
                  transition: "width 900ms var(--ease-out)",
                }}
              />
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px] text-zinc-500">
          {GROUP_ORDER.map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: GROUP_COLOR[g] }} />
              {STATE_GROUP_LABEL[g]}
              <span className="ml-auto tabular-nums text-zinc-800">{stats.byGroup[g]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-3 text-[11px] text-zinc-500">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded bg-[#3f5bd9]" /> 新建
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-3 rounded bg-[#12a150]" /> 完成
      </span>
    </div>
  );
}

/** 平滑曲线：Catmull-Rom 转三次贝塞尔。 */
function smooth(pts: [number, number][]) {
  const first = pts[0];
  if (!first || pts.length < 2) return "";
  let d = `M${first[0]},${first[1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    if (!p1 || !p2) break;
    const p0 = pts[i - 1] ?? p1;
    const p3 = pts[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function TrendChart({ data }: { data: TrendPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = 200;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const max = Math.max(4, ...data.map((d) => Math.max(d.created, d.completed)));
  const x = (i: number) => pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const line = (k: "created" | "completed") => smooth(data.map((d, i) => [x(i), y(d[k])]));
  const area = (k: "created" | "completed") =>
    `${line(k)} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, Math.round(max / 2), max];
  const cur = hover === null ? undefined : data[hover];

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-52 w-full"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
        role="img"
        aria-label="近 14 天新建与完成趋势"
      >
        <defs>
          {(["#3f5bd9", "#12a150"] as const).map((c) => (
            <linearGradient key={c} id={`area-${c.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c} stopOpacity={0.22} />
              <stop offset="100%" stopColor={c} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(t)}
              y2={y(t)}
              stroke="#f0f0f0"
              strokeDasharray="3 4"
            />
            <text x={pad.l - 8} y={y(t) + 3} textAnchor="end" className="fill-zinc-400 text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          i % 2 === 0 || i === data.length - 1 ? (
            <text
              key={d.day}
              x={x(i)}
              y={H - 4}
              textAnchor="middle"
              className="fill-zinc-400 text-[10px]"
            >
              {d.day.slice(5)}
            </text>
          ) : null,
        )}
        <path d={area("created")} fill="url(#area-3f5bd9)" className="animate-fade" />
        <path d={area("completed")} fill="url(#area-12a150)" className="animate-fade" />
        <path
          d={line("created")}
          fill="none"
          stroke="#3f5bd9"
          strokeWidth={2}
          pathLength={1}
          className="dash-draw"
        />
        <path
          d={line("completed")}
          fill="none"
          stroke="#12a150"
          strokeWidth={2}
          pathLength={1}
          className="dash-draw"
          style={{ animationDelay: "150ms" }}
        />
        {cur && hover !== null && (
          <g className="pointer-events-none">
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} stroke="#d4d4d8" />
            <circle
              cx={x(hover)}
              cy={y(cur.created)}
              r={4}
              fill="white"
              stroke="#3f5bd9"
              strokeWidth={2}
            />
            <circle
              cx={x(hover)}
              cy={y(cur.completed)}
              r={4}
              fill="white"
              stroke="#12a150"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
      {cur && hover !== null && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg bg-zinc-900/90 px-2.5 py-1.5 text-[11px] text-white shadow-lg backdrop-blur transition-[left] duration-100"
          style={{
            left: `${(x(hover) / W) * 100}%`,
            transform: `translateX(${hover > data.length / 2 ? "calc(-100% - 10px)" : "10px"})`,
          }}
        >
          <div className="mb-0.5 text-zinc-400">{cur.day}</div>
          <div>新建 {cur.created}</div>
          <div>完成 {cur.completed}</div>
        </div>
      )}
    </div>
  );
}

function PriorityBars({ stats }: { stats: Stats }) {
  const mounted = useMounted();
  const max = Math.max(1, ...Object.values(stats.byPriority));
  return (
    <div className="space-y-3">
      {PRIORITIES.map((p, i) => {
        const n = stats.byPriority[p.key];
        return (
          <div key={p.key} className="group">
            <div className="mb-1 flex justify-between text-[12px]">
              <span className="flex items-center gap-1.5 text-zinc-600">
                {p.key === "urgent" ? (
                  <Flame size={12} style={{ color: p.color }} />
                ) : (
                  <span className="size-2 rounded-full" style={{ background: p.color }} />
                )}
                {p.label}
              </span>
              <span className="tabular-nums text-zinc-800">{n}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full transition-[width,filter] duration-700 group-hover:brightness-110"
                style={{
                  width: mounted ? `${(n / max) * 100}%` : 0,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${p.color} 60%, white), ${p.color})`,
                  transitionDelay: `${i * 60}ms`,
                  transitionTimingFunction: "var(--ease-out)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Workload({ stats, name }: { stats: Stats; name: (id: string | null) => string }) {
  const mounted = useMounted();
  const rows = stats.workload.slice(0, 6);
  const max = Math.max(1, ...rows.map((r) => r.open));
  if (rows.length === 0) {
    return (
      <div className="py-10 text-center text-[12px] text-zinc-400">
        没有未关闭的任务，干得漂亮。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={r.assigneeId ?? "none"} className="flex items-center gap-3">
          <Avatar name={name(r.assigneeId)} size={22} />
          <span className="w-24 truncate text-[12px] text-zinc-700">{name(r.assigneeId)}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-zinc-100/80">
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-[#7a5af8]/25 transition-[width] duration-700"
              style={{
                width: mounted ? `${(r.open / max) * 100}%` : 0,
                transitionDelay: `${i * 60}ms`,
              }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-[#3f5bd9] to-[#7a5af8] transition-[width] duration-700"
              style={{
                width: mounted ? `${(r.started / max) * 100}%` : 0,
                transitionDelay: `${i * 60 + 100}ms`,
              }}
            />
          </div>
          <span className="w-16 text-right text-[11px] tabular-nums text-zinc-500">
            <span className="text-zinc-900">{r.started}</span> / {r.open}
          </span>
        </div>
      ))}
      <div className="flex gap-4 pt-1 text-[11px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[#3f5bd9]" /> 进行中
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[#7a5af8]/25" /> 未关闭
        </span>
      </div>
    </div>
  );
}

function ProjectRow({
  slug,
  project,
  stats,
  idx,
}: {
  slug: string;
  project: { id: string; name: string; identifier: string };
  stats: Stats;
  idx: number;
}) {
  const mounted = useMounted();
  const total = Math.max(1, stats.total);
  return (
    <Link
      to={`/${slug}/projects/${project.id}`}
      className="group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-zinc-50"
    >
      <FolderKanban size={15} className="text-zinc-400 transition-colors group-hover:text-accent" />
      <span className="w-40 truncate text-[13px] font-medium text-zinc-800">{project.name}</span>
      <span className="font-mono text-[10px] text-zinc-400">{project.identifier}</span>
      <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
        {(["completed", "started", "unstarted", "backlog"] as StateGroup[]).map((g) => (
          <div
            key={g}
            style={{
              width: mounted ? `${(stats.byGroup[g] / total) * 100}%` : 0,
              background: GROUP_COLOR[g],
              transition: `width 900ms var(--ease-out) ${idx * 70}ms`,
            }}
          />
        ))}
      </div>
      <span className="w-12 text-right text-[12px] font-medium tabular-nums text-zinc-800">
        {Math.round(stats.completionRate * 100)}%
      </span>
      <span className="w-20 text-right text-[11px] tabular-nums text-zinc-400">
        {stats.completed}/{stats.total - stats.byGroup.cancelled} 完成
      </span>
    </Link>
  );
}
