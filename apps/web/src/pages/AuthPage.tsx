import { Button, Field, Input } from "@zhizhi/ui/ui";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/stores/auth";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isLogin) await login(email, password);
      else await register(email, name, password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/favicon.svg" className="size-10" alt="" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {isLogin ? "登录知之" : "创建知之账户"}
            </h1>
            <p className="mt-1 text-[13px] text-zinc-500">知之为知之，让每一项任务都清清楚楚</p>
          </div>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-xs"
        >
          {!isLogin && (
            <Field label="姓名">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="你的名字"
                autoFocus
                required
              />
            </Field>
          )}
          <Field label="邮箱">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoFocus={isLogin}
              autoComplete="email"
              required
            />
          </Field>
          <Field label="密码">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? "输入密码" : "至少 8 位"}
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
            />
          </Field>
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</div>
          )}
          <Button type="submit" variant="primary" className="h-9 w-full" disabled={busy}>
            {isLogin ? "登录" : "注册"}
          </Button>
        </form>
        <p className="mt-5 text-center text-[13px] text-zinc-500">
          {isLogin ? "还没有账户？" : "已有账户？"}
          <Link
            to={isLogin ? "/register" : "/login"}
            className="font-medium text-zinc-900 hover:underline"
          >
            {isLogin ? "立即注册" : "去登录"}
          </Link>
        </p>
      </div>
    </div>
  );
}
