import {
  LANDING_ANIMATIONS,
  NeuralNetworkBg,
  ProductNav,
  LandingFooter,
  InstallBlock,
} from '@/components/landing/shared';

export default function SevoLandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-950 selection:bg-emerald-500/20 overflow-hidden">
      <style>{LANDING_ANIMATIONS}</style>

      <NeuralNetworkBg />
      <ProductNav current="sevo" />

      {/* ═══════════════ SCREEN 1: HERO ═══════════════ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-16">
        <div className="relative z-10 max-w-4xl text-center">
          {/* Badge */}
          <div className="animate-fade-in-up mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" style={{animation: 'pulse-glow 2s ease-in-out infinite'}} />
            <span className="text-xs font-medium text-emerald-600 tracking-wide">18 阶段全自动研发流水线</span>
          </div>

          {/* Main headline */}
          <h1 className="animate-fade-in-up-delay-1 text-4xl font-bold leading-[1.15] tracking-tight sm:text-5xl lg:text-6xl">
            <span className="text-slate-900">AI Agent 写代码很快</span>
            <br />
            <span className="text-slate-900">但谁来保证写出来的东西</span>
            <br />
            <span className="shimmer-text" style={{background: 'linear-gradient(90deg, #34d399, #67e8f9, #34d399)', backgroundSize: '200% auto'}}>
              用户真的能用？
            </span>
          </h1>

          {/* Subtitle */}
          <p className="animate-fade-in-up-delay-2 mx-auto mt-8 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg">
            SEVO 把 AI Agent 的产出从「能跑」推到「能用」
          </p>

          {/* Stats bar */}
          <div className="animate-fade-in-up-delay-3 mt-12 inline-flex flex-wrap items-center justify-center gap-6 rounded-2xl border border-slate-200 bg-white px-8 py-4">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-emerald-400">18</span>
              <span className="text-[11px] text-slate-500 mt-0.5">流水线阶段</span>
            </div>
            <div className="h-8 w-px bg-slate-100" />
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-cyan-400">4</span>
              <span className="text-[11px] text-slate-500 mt-0.5">产品在管</span>
            </div>
            <div className="h-8 w-px bg-slate-100" />
            <div className="flex flex-col items-center">
              <span className="text-2xl font-bold text-emerald-400">36</span>
              <span className="text-[11px] text-slate-500 mt-0.5">FR 全覆盖</span>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-600">作者本人已用 SEVO 管理 4 个产品的完整研发生命周期</p>
        </div>

        {/* Scroll hint */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <div className="h-8 w-[1px] bg-gradient-to-b from-white/20 to-transparent animate-bounce" />
        </div>
      </section>

      {/* ═══════════════ SCREEN 2: CAPABILITIES ═══════════════ */}
      <section className="relative mx-auto max-w-5xl px-6 py-24 sm:py-32">
        <div className="text-center mb-16">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            核心能力
          </h2>
          <p className="mt-3 text-sm text-slate-500">从需求到部署，每个环节自动把关</p>
        </div>

        {/* Capabilities - compact list */}
        <div className="grid gap-0 divide-y divide-white/[0.04]">
          {[
            { id: '01', name: '主动澄清', desc: '需求不清不动手，主动追问补全边界' },
            { id: '02', name: '四方会审', desc: '产品/开发/质量/体验四视角并行把关' },
            { id: '03', name: '自主收敛引擎', desc: '围绕终局目标持续收敛，差距不归零不放行' },
            { id: '04', name: '18 阶段全自动', desc: '需求→门禁→架构→编码→审计→测试→验收→部署' },
            { id: '05', name: '终局交付', desc: 'README 同步、版本决策、多平台发布、逐条差距扫描' },
            { id: '06', name: '全链路可追溯', desc: '每步输入输出结论记录在案，出问题秒级定位' },
          ].map((cap, i) => (
            <div key={cap.id} className="capability-item flex items-center gap-6 py-5 px-4 rounded-lg cursor-default">
              <span className="text-[11px] font-mono text-slate-600 w-6 shrink-0">{cap.id}</span>
              <div className={`cap-indicator h-[2px] w-3 rounded-full shrink-0 transition-all duration-300 ${i % 2 === 0 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-cyan-500 to-cyan-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{cap.name}</span>
                  <span className="text-xs text-slate-500 leading-relaxed">{cap.desc}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════════════ SCREEN 3: INSTALL + FOOTER ═══════════════ */}
      <section id="quickstart" className="relative border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            开始使用
          </h2>
          <p className="mt-3 text-sm text-slate-500">一行命令，接管你的研发流水线</p>

          <div className="mt-10">
            <InstallBlock packageName="sevo-pipeline" />
          </div>

          {/* Links */}
          <div className="mt-10 flex items-center justify-center gap-8 text-sm">
            <a
              href="https://github.com/anthropics/sevo-pipeline"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 transition hover:text-slate-700"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              GitHub
            </a>
            <a
              href="https://www.npmjs.com/package/sevo-pipeline"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-600 transition hover:text-slate-700"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M0 7.334v8h6.666v1.332H12v-1.332h12v-8H0zm6.666 6.664H5.334v-4H3.999v4H1.335V8.667h5.331v5.331zm4 0v1.336H8.001V8.667h5.334v5.332h-2.669v-.001zm12.001 0h-1.33v-4h-1.336v4h-1.335v-4h-1.33v4h-2.671V8.667h8.002v5.331zM10.665 10H12v2.667h-1.335V10z"/></svg>
              npm
            </a>
          </div>
        </div>
      </section>

      <LandingFooter current="sevo" />
    </div>
  );
}
