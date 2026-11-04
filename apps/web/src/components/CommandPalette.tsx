import { Kbd, Modal } from "@zhizhi/ui/ui";
import {
  CircleDot,
  Columns3,
  FolderKanban,
  Inbox,
  Keyboard,
  List,
  LogOut,
  PanelLeft,
  Plus,
  Settings,
} from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { useAuth } from "@/stores/auth";
import { useIssues } from "@/stores/issues";
import { type PickerKind, useUi } from "@/stores/ui";
import { useWorkspace } from "@/stores/workspace";
import { type CommandItem, CommandList } from "./CommandList";
import { StateIcon } from "./icons";

const ISSUE_ACTIONS: { kind: PickerKind; label: string; key: string }[] = [
  { kind: "state", label: "更改状态", key: "S" },
  { kind: "priority", label: "设置优先级", key: "P" },
  { kind: "assignee", label: "指派负责人", key: "A" },
  { kind: "labels", label: "设置标签", key: "L" },
  { kind: "due", label: "设置截止日期", key: "D" },
];

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const ui = useUi();
  const navigate = useNavigate();
  const { slug } = useParams();
  const projects = useWorkspace((s) => s.projects);
  const byId = useIssues((s) => s.byId);
  const meta = useIssues((s) => s.meta);
  const logout = useAuth((s) => s.logout);

  const close = () => ui.set({ paletteOpen: false });
  const target = ui.peekId ?? ui.focusedId;

  const items = ((): CommandItem[] => {
    if (!open) return [];
    const run = (fn: () => void) => () => {
      close();
      fn();
    };
    const list: CommandItem[] = [];
    if (target && byId[target]) {
      for (const a of ISSUE_ACTIONS) {
        list.push({
          id: `issue-${a.kind}`,
          group: "当前任务",
          label: a.label,
          icon: <CircleDot size={14} />,
          hint: <Kbd>{a.key}</Kbd>,
          onSelect: () => ui.set({ paletteOpen: false, picker: { kind: a.kind, issueId: target } }),
        });
      }
    }
    list.push(
      {
        id: "create",
        group: "操作",
        label: "新建任务",
        icon: <Plus size={14} />,
        hint: <Kbd>C</Kbd>,
        onSelect: run(() => ui.set({ createOpen: true })),
      },
      {
        id: "view-list",
        group: "操作",
        label: "切换为列表视图",
        keywords: "list liebiao",
        icon: <List size={14} />,
        onSelect: run(() => ui.set({ viewMode: "list" })),
      },
      {
        id: "view-board",
        group: "操作",
        label: "切换为看板视图",
        keywords: "board kanban",
        icon: <Columns3 size={14} />,
        onSelect: run(() => ui.set({ viewMode: "board" })),
      },
      {
        id: "sidebar",
        group: "操作",
        label: "切换侧边栏",
        icon: <PanelLeft size={14} />,
        hint: <Kbd>[</Kbd>,
        onSelect: run(() => ui.set({ sidebarCollapsed: !ui.sidebarCollapsed })),
      },
      {
        id: "help",
        group: "操作",
        label: "键盘快捷键",
        icon: <Keyboard size={14} />,
        hint: <Kbd>?</Kbd>,
        onSelect: run(() => ui.set({ helpOpen: true })),
      },
      {
        id: "go-my",
        group: "跳转",
        label: "我的任务",
        keywords: "my wode",
        icon: <Inbox size={14} />,
        hint: "G I",
        onSelect: run(() => navigate(`/${slug}`)),
      },
      ...projects.map((p) => ({
        id: `go-${p.id}`,
        group: "跳转",
        label: p.name,
        keywords: p.identifier,
        icon: <FolderKanban size={14} />,
        hint: p.identifier,
        onSelect: run(() => navigate(`/${slug}/projects/${p.id}`)),
      })),
      {
        id: "go-settings",
        group: "跳转",
        label: "工作区设置",
        icon: <Settings size={14} />,
        hint: "G S",
        onSelect: run(() => navigate(`/${slug}/settings`)),
      },
    );
    const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
    for (const issue of Object.values(byId)) {
      const p = projectById[issue.project_id];
      if (!p) continue;
      const st = meta[issue.project_id]?.states.find((s) => s.id === issue.state_id);
      list.push({
        id: `issue-${issue.id}`,
        group: "任务",
        label: issue.title,
        keywords: `${p.identifier}-${issue.seq}`,
        icon: st ? <StateIcon group={st.group} color={st.color} /> : <CircleDot size={14} />,
        hint: `${p.identifier}-${issue.seq}`,
        onSelect: run(() => navigate(`/${slug}/projects/${p.id}/issues/${issue.id}`)),
      });
    }
    list.push({
      id: "logout",
      group: "账户",
      label: "退出登录",
      icon: <LogOut size={14} />,
      onSelect: run(logout),
    });
    return list;
  })();

  return (
    <Modal open={open} onClose={close} className="max-w-xl">
      <CommandList
        items={items}
        placeholder="输入命令或搜索任务…"
        footer={
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> 选择
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> 执行
            </span>
            <span className="flex items-center gap-1">
              <Kbd>Esc</Kbd> 关闭
            </span>
          </span>
        }
      />
    </Modal>
  );
}
