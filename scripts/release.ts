// 生成 CLI 发布产物并维护 latest.json，供 /install.sh、/install.ps1 与 /download 下发。
//
//   bun run release                     # 当前平台
//   bun run release --target x86_64-unknown-linux-musl
//   bun run release --dir ./dist/releases
//
// 默认只构建本机目标：跨平台编译需要额外工具链（Linux 用 cargo-zigbuild，Windows 用 cargo-xwin），
// 交给 CI 的矩阵任务分别执行，各自上传自己的产物后合并 latest.json。

import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { $ } from "bun";

const root = join(import.meta.dir, "..");
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

/** 只打当前平台，避免在没有交叉工具链的机器上产出坏包。 */
function hostTarget(): string {
  const arch =
    process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch;
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  return `${arch}-unknown-linux-musl`;
}

const target = flag("target") ?? hostTarget();
const outDir = flag("dir") ?? join(root, "data", "releases");
const windows = target.includes("windows");
const exe = windows ? ".exe" : "";
const pkg = `zhizhi-${target}${windows ? ".zip" : ".tar.gz"}`;

const version = (await Bun.file(join(root, "Cargo.toml")).text()).match(
  /\[workspace\.package\][\s\S]*?version\s*=\s*"([^"]+)"/,
)?.[1];
if (!version) throw new Error("Cargo.toml 中未找到 workspace.package.version");

// 目标平台和本机不一致时要求显式提供交叉编译方式，避免静默产出错架构的包。
const host = hostTarget();
if (target !== host) {
  throw new Error(
    `不能在 ${host} 上直接构建 ${target}。请在对应平台的 CI 任务里运行本脚本，或先安装交叉工具链后扩展这里。`,
  );
}

console.log(`\n▸ zhizhi ${version} → ${target}`);
await $`cargo build --release --manifest-path apps/cli/Cargo.toml --bin zhizhi`.cwd(root);

const bin = join(root, "target", "release", `zhizhi${exe}`);
const tmp = await mkdtemp(join(tmpdir(), "zhizhi-release-"));
try {
  const staged = join(tmp, `zhizhi${exe}`);
  await copyFile(bin, staged);
  if (!windows) {
    // 体积交给系统 strip：release profile 里 strip=false 是有原因的，见 AGENTS.md。
    await $`strip ${process.platform === "darwin" ? "-S" : "--strip-all"} ${staged}`.nothrow();
  }

  await mkdir(outDir, { recursive: true });
  const dest = join(outDir, pkg);
  if (windows) {
    await $`zip -qj ${dest} ${staged}`;
  } else {
    // macOS 自带 bsdtar，`-C` 里只放一个文件，包内路径就是 zhizhi。
    await $`tar -czf ${dest} -C ${tmp} ${basename(staged)}`;
  }

  const sum = createHash("sha256")
    .update(await readFile(dest))
    .digest("hex");

  // 合并已有清单：多个 CI 任务各产出一个平台，谁最后跑谁负责把清单写全。
  const manifestPath = join(outDir, "latest.json");
  let artifacts: { target: string; url: string; sha256: string }[] = [];
  try {
    const old = JSON.parse(await readFile(manifestPath, "utf8"));
    artifacts = (old.artifacts ?? []).filter((a: { target: string }) => a.target !== target);
  } catch {
    // 首次发布没有旧清单。
  }
  artifacts.push({ target, url: `/dl/${pkg}`, sha256: sum });
  artifacts.sort((a, b) => a.target.localeCompare(b.target));

  const manifest = { version, artifacts };
  const next = join(outDir, "latest.json.tmp");
  await writeFile(next, `${JSON.stringify(manifest, null, 2)}\n`);
  // 用 rename 落盘：安装脚本不会读到指向不存在产物的清单。
  await rename(next, manifestPath);

  console.log(`\n✓ ${dest}`);
  console.log(`  sha256 ${sum}`);
  console.log(`  target ${target}`);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
