"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Workflow, TimerReset } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const LOGIN_HIGHLIGHTS = [
  {
    icon: Workflow,
    title: "看清整条 FR 管线",
    description: "登录后直接进入任务运营面板，查看 FR 状态、门禁、澄清与异常项。",
  },
  {
    icon: ShieldCheck,
    title: "关键决策有上下文",
    description: "审批前先看 blocker、失败原因与当前阶段，避免盲点决策。",
  },
  {
    icon: TimerReset,
    title: "问题会被及时顶出来",
    description: "失败、阻塞、待回复事项会集中展示，方便快速处理。",
  },
];

export default function LoginPageContent() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      } else if (res.status === 500) {
        const data = await res.json();
        if (data.code === "NO_PASSWORD") {
          setError("系统未配置访问密码，请联系管理员");
        } else {
          setError("服务器错误，请稍后重试");
        }
      } else {
        setError("密码错误，请检查后重试");
      }
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 text-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-emerald-500/18 via-teal-400/10 to-white p-8 shadow-sm shadow-emerald-900/20 lg:flex lg:flex-col lg:justify-between">
            <div className="space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-600">
                SEVO · Self-Evolving Harness
              </div>
              <div className="space-y-3">
                <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-slate-950">
                  这是给 FR 运营与决策使用的控制台，不只是一个密码入口。
                </h1>
                <p className="max-w-2xl text-base leading-7 text-slate-700">
                  进入后你会看到当前 FR 的推进情况、失败项、阻塞项、门禁审批和待回复澄清，第一眼就能知道哪里卡住、下一步该处理什么。
                </p>
              </div>
            </div>

            <div className="grid gap-3">
              {LOGIN_HIGHLIGHTS.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white/5 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-emerald-400/15 p-2 text-emerald-600">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                      <p className="text-sm leading-6 text-slate-700">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <Card className="w-full border-slate-200 bg-white shadow-sm shadow-slate-900/20 hover:shadow-sm">
            <CardHeader className="space-y-4 px-6 pb-0 pt-7 sm:px-8">
              <div className="inline-flex w-fit items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                受控访问
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl font-semibold tracking-tight text-slate-950">
                  登录 SEVO
                </CardTitle>
                <p className="text-sm leading-6 text-slate-600">
                  统一密码访问当前内测环境。登录失败、网络异常和配置问题都会在下方反馈区直接提示。
                </p>
              </div>
            </CardHeader>
            <CardContent className="px-6 pb-7 pt-6 sm:px-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="access-password" className="text-sm font-medium text-slate-800">
                    访问密码
                  </label>
                  <Input
                    id="access-password"
                    type="password"
                    placeholder="请输入访问密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    className="h-12 rounded-xl border-slate-200 px-4 text-base shadow-sm focus-visible:ring-emerald-500"
                    aria-describedby="login-help login-feedback"
                  />
                  <p id="login-help" className="text-sm text-slate-500">
                    仅限当前评审环境使用。输入后将进入 FR 控制台首页。
                  </p>
                </div>

                <div
                  id="login-feedback"
                  className={`min-h-[52px] rounded-xl border px-4 py-3 text-sm ${
                    error
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}
                >
                  {error
                    ? error
                    : loading
                      ? "正在验证访问权限，请稍候…"
                      : "登录后可查看 FR 总览、待处理事项、审批门禁和异常通知。"}
                </div>

                <Button
                  type="submit"
                  disabled={loading || !password}
                  className="h-12 w-full rounded-xl text-base font-semibold shadow-lg shadow-emerald-600/20"
                  aria-label="登录并进入控制台"
                >
                  {loading ? <><span className="mr-2 inline-flex"><svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" className="opacity-25" stroke="currentColor" strokeWidth="4" /><path d="M22 12a10 10 0 0 1-10 10" className="opacity-75" stroke="currentColor" strokeWidth="4" /></svg></span>登录中…</> : "进入控制台"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
