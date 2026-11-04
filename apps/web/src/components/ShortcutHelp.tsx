import { CloseButton, Kbd, Modal } from "@zhizhi/ui/ui";
import { modKey } from "@/lib/utils";
import { useUi } from "@/stores/ui";

const SECTIONS: { title: string; items: [string[], string][] }[] = [
  {
    title: "全局",
    items: [
      [[modKey, "K"], "打开命令面板"],
      [["C"], "新建任务"],
      [["/"], "搜索任务"],
      [["["], "折叠 / 展开侧边栏"],
      [["?"], "显示快捷键"],
    ],
  },
  {
    title: "导航",
    items: [
      [["G", "I"], "前往我的任务"],
      [["G", "P"], "前往第一个项目"],
      [["G", "S"], "前往工作区设置"],
      [["G", "C"], "接入 CLI 与 Agent"],
      [["V"], "切换视图（列表、看板、表格、日历、时间线）"],
    ],
  },
  {
    title: "任务列表",
    items: [
      [["J"], "下一个任务"],
      [["K"], "上一个任务"],
      [["↵"], "打开任务详情"],
      [["F"], "打开筛选"],
      [["Esc"], "关闭详情 / 弹窗"],
    ],
  },
  {
    title: "任务操作（选中后）",
    items: [
      [["S"], "更改状态"],
      [["P"], "设置优先级"],
      [["A"], "指派负责人"],
      [["I"], "指派给自己"],
      [["L"], "设置标签"],
      [["D"], "设置截止日期"],
      [["E"], "编辑标题"],
      [[modKey, "⌫"], "删除任务"],
    ],
  },
];

export function ShortcutHelp() {
  const open = useUi((s) => s.helpOpen);
  const set = useUi((s) => s.set);
  const close = () => set({ helpOpen: false });
  return (
    <Modal open={open} onClose={close} className="max-w-2xl">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
        <span className="text-sm font-medium">键盘快捷键</span>
        <CloseButton onClick={close} />
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-5 px-5 py-4">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <div className="mb-2 text-xs font-medium text-zinc-400">{s.title}</div>
            <div className="space-y-1.5">
              {s.items.map(([keys, label]) => (
                <div
                  key={label}
                  className="flex items-center justify-between text-[13px] text-zinc-700"
                >
                  <span>{label}</span>
                  <span className="flex gap-1">
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
