import type { ApiToken, CreatedToken, Info } from "@zhizhi/shared";
import { cn } from "@zhizhi/ui/lib/utils";
import { Button, Input, Kbd, Segmented } from "@zhizhi/ui/ui";
import { ArrowRight, Bot, Check, Copy, KeyRound, Sparkles, Terminal, Wand2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "@/lib/api";
import { toast } from "@/stores/toast";
import { useWorkspace } from "@/stores/workspace";

type StepKey = "install" | "token" | "login" | "skill" | "use";

interface Step {
  key: StepKey;
  title: string;
  sub: string;
  icon: ReactNode;
}

interface ClientSpec {
  key: Client;
  label: string;
  path: string;
  cmd: string;
  desc: string;
}

const STEPS: Step[] = [
  { key: "install", title: "安装命令行", sub: "一行命令", icon: <Terminal size={15} /> },
  { key: "token", title: "创建访问令牌", sub: "绑定你的账号", icon: <KeyRound size={15} /> },
  { key: "login", title: "登录", sub: "保存到本机", icon: <Wand2 size={15} /> },
  { key: "skill", title: "安装 Skill", sub: "让 Agent 会用", icon: <Bot size={15} /> },
  { key: "use", title: "开始使用", sub: "对人、对 Agent", icon: <Sparkles size={15} /> },
];

const DONE_KEY = "zhizhi:guide-done";

type Platform = "unix" | "windows";
type Client = "claude" | "project" | "custom";

const CLIENTS: ClientSpec[] = [
  {
    key: "claude",
    label: "Claude Code",
    path: "~/.claude/skills/zhizhi/",
    cmd: "zhizhi skill install",
    desc: "装到当前用户目录，本机所有项目里的 Agent 都能用。",
  },
  {
    key: "project",
    label: "随仓库提交",
    path: "./.claude/skills/zhizhi/",
    cmd: "zhizhi skill install --scope project",
    desc: "装进当前仓库，团队成员拉代码就有了同一份说明。",
  },
  {
    key: "custom",
    label: "其他客户端",
    path: "<skills 目录>/zhizhi/",
    cmd: "zhizhi skill install --dir <skills 目录>",
    desc: "传它自己的 skills 目录，CLI 会在下面建 zhizhi/。",
  },
];

// 键是有限联合类型，标注成 Record 后取值不会是 undefined。
const STEP_BY_KEY = Object.fromEntries(STEPS.map((s) => [s.key, s])) as Record<StepKey, Step>;
const CLIENT_BY_KEY = Object.fromEntries(CLIENTS.map((c) => [c.key, c])) as Record<
  Client,
  ClientSpec
>;

/**
 * 接入 CLI 与 Agent 的引导。每步给出能直接复制的命令，令牌生成后自动填进后面的命令里。
 * 挂在工作区下的 /connect。
 */
export function ConnectPage() {
  const { slug } = useParams();
  const ws = useWorkspace((s) => s.workspaces.find((w) => w.slug === slug));
  const [info, setInfo] = useState<Info | null>(null);
  const [step, setStep] = useState<StepKey>("install");
  const [done, setDone] = useState<Set<StepKey>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as StepKey[]);
    } catch {
      return new Set();
    }
  });
  const [platform, setPlatform] = useState<Platform>(() =>
    /Win/i.test(navigator.userAgent) ? "windows" : "unix",
  );
  const [client, setClient] = useState<Client>("claude");
  const [token, setToken] = useState<CreatedToken | null>(null);

  useEffect(() => {
    api
      .info()
      .then(setInfo)
      .catch(() => {});
  }, []);
  useEffect(() => {
    localStorage.setItem(DONE_KEY, JSON.stringify([...done]));
  }, [done]);

  // 服务端声明的对外地址最准；拿不到时退回当前页面来源（开发模式下就是 Vite 端口）。
  const origin = info?.public_base_url || location.origin;
  const skill = CLIENT_BY_KEY[client];
  const current = STEP_BY_KEY[step];

  const complete = (k: StepKey) => {
    setDone((d) => new Set(d).add(k));
    const i = STEPS.findIndex((s) => s.key === k);
    const next = STEPS[i + 1];
    if (next) setStep(next.key);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200/80 px-5">
        <Bot size={15} className="text-zinc-400" />
        <h1 className="text-[14px] font-medium">接入 CLI 与 Agent</h1>
        <span className="flex-1" />
        <a
          href="/download"
          className="text-[13px] text-zinc-500 hover:text-zinc-900"
          target="_blank"
          rel="noreferrer"
        >
          手动下载
        </a>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-8 max-md:px-4 lg:grid-cols-[212px_1fr]">
          <ol className="flex flex-col lg:sticky lg:top-0 lg:self-start">
            {STEPS.map((s, i) => {
              const isDone = done.has(s.key);
              const isCur = step === s.key;
              return (
                <li key={s.key} className="relative">
                  {i < STEPS.length - 1 && (
                    <span
                      className={cn(
                        "absolute top-9 left-[15px] h-[calc(100%-22px)] w-px",
                        isDone ? "bg-accent/50" : "bg-zinc-200",
                      )}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => setStep(s.key)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                      isCur ? "bg-white shadow-card" : "hover:bg-zinc-100/70",
                    )}
                  >
                    <span
                      className={cn(
                        "relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                        isDone
                          ? "bg-accent text-white"
                          : isCur
                            ? "bg-zinc-900 text-white"
                            : "border border-zinc-300 bg-white text-zinc-500",
                      )}
                    >
                      {isDone ? <Check size={13} strokeWidth={3} /> : i + 1}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-[13px]",
                          isCur ? "font-semibold" : "text-zinc-800",
                        )}
                      >
                        {s.title}
                      </span>
                      <span className="block text-xs text-zinc-400">{s.sub}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="min-w-0">
            <StepCard
              key={current.key}
              icon={current.icon}
              title={current.title}
              lead={
                {
                  install:
                    "按你的系统选一条命令。装完 zhizhi 就能在终端里管理任务，人和 Agent 用同一套。",
                  token: `令牌代表你本人的身份，能访问你在「${ws?.name ?? "工作区"}」里的全部项目。明文只显示一次。`,
                  login: token
                    ? "命令里已经填好刚生成的令牌，复制到终端运行即可。"
                    : "把命令里的 <令牌> 换成你的令牌后运行；也可以在设置页随时生成新的。",
                  skill:
                    "Skill 告诉 Agent 什么时候、怎样调用 zhizhi：怎么读任务、怎么建任务、哪些事不能自作主张。",
                  use: "可以直接对 Agent 说，也可以自己敲命令。两者用的是同一套接口。",
                }[step]
              }
              nextLabel={step === "use" ? "完成" : "下一步"}
              onNext={() => complete(step)}
              extra={
                step === "use" && (
                  <Link to={`/${slug}`}>
                    <Button variant="primary">
                      进入工作区 <ArrowRight size={13} />
                    </Button>
                  </Link>
                )
              }
            >
              {step === "install" && (
                <div className="space-y-3">
                  <Segmented
                    value={platform}
                    onChange={setPlatform}
                    shape="text"
                    options={[
                      { value: "unix", label: "macOS / Linux" },
                      { value: "windows", label: "Windows" },
                    ]}
                  />
                  <CopyField
                    value={
                      platform === "unix"
                        ? `curl -fsSL ${origin}/install.sh | sh`
                        : `irm ${origin}/install.ps1 | iex`
                    }
                  />
                  <Checklist
                    items={[
                      <>
                        装完运行 <code>zhizhi --version</code>，看到版本号就成功了。
                      </>,
                      platform === "unix" ? (
                        <>
                          提示找不到命令时，把 <code>~/.local/bin</code> 加进 PATH。
                        </>
                      ) : (
                        <>Windows 脚本会把安装目录写进用户 PATH，重开一个终端即可。</>
                      ),
                      <>
                        也可以到{" "}
                        <a className="text-accent hover:underline" href="/download">
                          下载页
                        </a>{" "}
                        手动下载对应平台的二进制。
                      </>,
                    ]}
                  />
                </div>
              )}

              {step === "token" && (
                <TokenStep token={token} onCreated={setToken} onSkip={() => complete("token")} />
              )}

              {step === "login" && (
                <div className="space-y-3">
                  <CopyField
                    multiline
                    value={`zhizhi login --url ${origin} --token ${token?.token ?? "<令牌>"} --workspace ${slug ?? "<工作区>"}`}
                  />
                  <Checklist
                    items={[
                      <>
                        运行 <code>zhizhi whoami</code>，看到你的名字和工作区说明配置生效了。
                      </>,
                      <>
                        凭证存在 <code>~/.config/zhizhi/config.toml</code>，多个环境用{" "}
                        <code>zhizhi profile list</code> 切换。
                      </>,
                    ]}
                  />
                  <details className="group rounded-lg border border-zinc-200">
                    <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium select-none group-open:border-b group-open:border-zinc-100">
                      在团队仓库里共享配置
                    </summary>
                    <div className="space-y-3 p-4">
                      <p className="text-[13px] leading-relaxed text-zinc-600">
                        在仓库根目录提交 <code>.zhizhi.toml</code>，Agent
                        在仓库里运行命令时会自动认出环境。 令牌放环境变量，不进仓库。
                      </p>
                      <CopyField
                        multiline
                        label=".zhizhi.toml"
                        value={`url = "${origin}"\nworkspace = "${slug ?? "<工作区>"}"`}
                      />
                      <CopyField
                        label="环境变量"
                        value={`export ZHIZHI_TOKEN="${token?.token ?? "zhz_…"}"`}
                      />
                    </div>
                  </details>
                </div>
              )}

              {step === "skill" && (
                <div className="space-y-3">
                  <Segmented
                    value={client}
                    onChange={setClient}
                    shape="text"
                    options={CLIENTS.map((c) => ({ value: c.key, label: c.label }))}
                  />
                  <CopyField value={skill.cmd} />
                  <p className="text-xs text-zinc-500">
                    {skill.desc} 装到 <code>{skill.path}</code>。
                  </p>
                  <Checklist
                    items={[
                      <>已有 Skill 时重新运行即可覆盖，版本始终和 CLI 一致。</>,
                      <>
                        装好后在 Claude Code 里输入 <code>/zhizhi</code>{" "}
                        或直接说「看看知之里的任务」。
                      </>,
                    ]}
                  />
                </div>
              )}

              {step === "use" && <UseCases origin={origin} />}
            </StepCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepCard({
  icon,
  title,
  lead,
  children,
  onNext,
  nextLabel,
  extra,
}: {
  icon: ReactNode;
  title: string;
  lead: string;
  children: ReactNode;
  onNext: () => void;
  nextLabel: string;
  extra?: ReactNode;
}) {
  return (
    <section className="animate-rise overflow-hidden rounded-xl border border-zinc-200 bg-white">
      <div className="px-6 py-6">
        <div className="mb-4 grid size-9 place-items-center rounded-lg bg-accent-soft text-accent">
          {icon}
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1.5 mb-5 text-[13.5px] leading-relaxed text-zinc-500">{lead}</p>
        {children}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-6 py-3">
        {extra}
        <Button variant="accent" onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    </section>
  );
}

function TokenStep({
  token,
  onCreated,
  onSkip,
}: {
  token: CreatedToken | null;
  onCreated: (t: CreatedToken) => void;
  onSkip: () => void;
}) {
  const [name, setName] = useState("我的笔记本");
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<ApiToken[] | null>(null);

  useEffect(() => {
    api
      .tokens()
      .then(setExisting)
      .catch(() => setExisting([]));
  }, []);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const t = await api.createToken(name.trim());
      onCreated(t);
      toast.success("令牌已创建，下一步的命令里已经填好了");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (token) {
    return (
      <div className="animate-in space-y-3 rounded-lg border border-accent/30 bg-accent-soft p-4">
        <div className="text-[13px] font-medium text-accent-ink">
          已生成「{token.name}」，请现在复制，之后无法再次查看
        </div>
        <CopyField value={token.token} />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          placeholder="令牌名称，如「我的笔记本」"
        />
        <Button
          variant="primary"
          className="h-8 shrink-0"
          disabled={!name.trim() || busy}
          onClick={create}
        >
          <KeyRound size={14} /> 生成令牌
        </Button>
      </div>
      <p className="text-xs text-zinc-500">
        令牌权限等同于你的账号：能看你所在工作区的全部项目。之后可以在{" "}
        <Link to="../settings" className="text-accent hover:underline">
          设置 › 访问令牌
        </Link>{" "}
        查看和吊销。
      </p>
      {existing && existing.length > 0 && (
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
        >
          我已经有令牌了，跳过
        </button>
      )}
    </div>
  );
}

function UseCases({ origin }: { origin: string }) {
  const [tab, setTab] = useState<"agent" | "shell">("agent");
  const cases = [
    {
      say: "看看知之里我负责的任务，挑最紧急的一条跟我讲讲。",
      cli: `zhizhi issue list --mine --json\nzhizhi issue get CORE-12 --download --json`,
    },
    {
      say: "把刚才那个 bug 提交到知之，附上这张截图，优先级高。",
      cli: `zhizhi issue create --title "登录页在 Safari 下按钮错位" \\\n  --desc "复现步骤…" --priority high --attach ./shot.png --json`,
    },
    {
      say: "这条任务我已经做完并推了代码，更新一下状态并留个说明。",
      cli: `zhizhi issue comment CORE-12 "已合并到 main\nPR #128" --json\nzhizhi issue move CORE-12 completed --json`,
    },
  ];
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        {(
          [
            ["agent", "对 Agent 说"],
            ["shell", "自己敲"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px border-b-2 px-3 pb-2 text-[13px] transition-colors",
              tab === k
                ? "border-accent font-medium text-accent-ink"
                : "border-transparent text-zinc-500 hover:text-zinc-800",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {cases.map((c) => (
          <div key={c.say} className="rounded-lg border border-zinc-200 p-3">
            {tab === "agent" ? (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0 text-xs text-zinc-400">你说</span>
                <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed">{c.say}</p>
                <CopyButton value={c.say} />
              </div>
            ) : (
              <CopyField multiline value={c.cli} />
            )}
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs leading-relaxed text-zinc-500">
        退出码：0 成功 / 2 未认证 / 3 不存在 / 6 参数错误，Agent 会据此决定下一步。服务地址{" "}
        <code>{origin}</code>。
      </p>
    </div>
  );
}

/** 等宽命令块，右上角复制。命令可能很长，横向滚动而不换行打乱缩进。 */
export function CopyField({
  value,
  label,
  multiline,
}: {
  value: string;
  label?: string;
  multiline?: boolean;
}) {
  return (
    <div className="group relative rounded-lg border border-zinc-200 bg-zinc-50">
      {label && (
        <div className="border-b border-zinc-200 px-3 py-1.5 font-mono text-[11px] text-zinc-500">
          {label}
        </div>
      )}
      <div className="flex items-start gap-1 p-2">
        <pre
          className={cn(
            "min-w-0 flex-1 overflow-x-auto px-1 font-mono text-[12.5px] leading-relaxed text-zinc-800",
            !multiline && "truncate",
          )}
        >
          {value}
        </pre>
        <CopyButton value={value} />
      </div>
    </div>
  );
}

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("复制失败，请手动选择");
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label="复制"
      className="press shrink-0 rounded-md p-1.5 text-zinc-400 hover:bg-white hover:text-zinc-700"
    >
      {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
    </button>
  );
}

function Checklist({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        // 提示文字不是列表项语义上的编号，按出现顺序稳定即可。
        // biome-ignore lint/suspicious/noArrayIndexKey: 见上
        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-zinc-500">
          <span className="mt-[7px] size-1 shrink-0 rounded-full bg-zinc-300" />
          <span className="min-w-0">{it}</span>
        </li>
      ))}
    </ul>
  );
}

/** 引导里用到的组合键提示，保持和其它页面一致的视觉。 */
export function HintKeys({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex gap-0.5">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </span>
  );
}

/** 侧栏进入引导的入口提示：首次进工作区时显示一次。 */
export function useFirstVisit() {
  const { slug } = useParams();
  const key = useMemo(() => `zhizhi:guide-seen.${slug}`, [slug]);
  const [fresh, setFresh] = useState(() => !localStorage.getItem(key));
  const dismiss = () => {
    localStorage.setItem(key, "1");
    setFresh(false);
  };
  return { fresh, dismiss };
}
