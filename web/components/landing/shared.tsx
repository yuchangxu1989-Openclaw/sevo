/**
 * Shared Landing Page Design System
 * 
 * Reusable across KIVO, SEVO, and Claw Design landing pages.
 * Each product only changes: productName, productTagline, accentColor, content.
 */

// ─── Shared CSS Animations (inject via <style> tag) ───
export const LANDING_ANIMATIONS = `
@keyframes pulse-glow {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
@keyframes drift-up {
  0% { transform: translateY(0) scale(1); opacity: 0.3; }
  50% { opacity: 0.6; }
  100% { transform: translateY(-100vh) scale(0.5); opacity: 0; }
}
@keyframes line-flow {
  0% { stroke-dashoffset: 1000; }
  100% { stroke-dashoffset: 0; }
}
@keyframes fade-in-up {
  0% { opacity: 0; transform: translateY(30px); }
  100% { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes node-pulse {
  0%, 100% { r: 2; opacity: 0.6; }
  50% { r: 3.5; opacity: 1; }
}
.animate-fade-in-up {
  animation: fade-in-up 0.8s ease-out both;
}
.animate-fade-in-up-delay-1 {
  animation: fade-in-up 0.8s ease-out 0.15s both;
}
.animate-fade-in-up-delay-2 {
  animation: fade-in-up 0.8s ease-out 0.3s both;
}
.animate-fade-in-up-delay-3 {
  animation: fade-in-up 0.8s ease-out 0.45s both;
}
.shimmer-text {
  background-size: 200% auto;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  animation: shimmer 4s linear infinite;
}
.capability-item {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.capability-item:hover {
  background: rgba(255,255,255,0.03);
  transform: translateX(4px);
}
.capability-item:hover .cap-indicator {
  width: 24px;
}
`;

// ─── Product definitions ───
export type ProductId = 'kivo' | 'sevo' | 'claw-design';

export interface ProductDef {
  id: ProductId;
  name: string;
  tagline: string;
  url: string;
  accentFrom: string;
  accentTo: string;
}

export const PRODUCTS: ProductDef[] = [
  {
    id: 'kivo',
    name: 'KIVO',
    tagline: 'Knowledge Intelligence',
    url: process.env.NEXT_PUBLIC_KIVO_URL ?? '/kivo',
    accentFrom: 'from-purple-400',
    accentTo: 'to-cyan-400',
  },
  {
    id: 'sevo',
    name: 'SEVO',
    tagline: 'Dev Pipeline',
    url: process.env.NEXT_PUBLIC_SEVO_URL ?? '/sevo',
    accentFrom: 'from-emerald-400',
    accentTo: 'to-cyan-400',
  },
  {
    id: 'claw-design',
    name: 'Claw Design',
    tagline: 'AI Design Engine',
    url: process.env.NEXT_PUBLIC_CLAW_DESIGN_URL ?? '/claw-design',
    accentFrom: 'from-orange-400',
    accentTo: 'to-pink-400',
  },
];

// ─── Neural Network Background SVG (green/cyan for SEVO) ───
export function NeuralNetworkBg() {
  return (
    <div className="pointer-events-none fixed inset-0" aria-hidden="true">
      <svg className="absolute inset-0 w-full h-full opacity-[0.15]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="line-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#67e8f9" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        <line x1="10%" y1="20%" x2="30%" y2="35%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 8s linear infinite'}} />
        <line x1="30%" y1="35%" x2="55%" y2="25%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 12s linear infinite'}} />
        <line x1="55%" y1="25%" x2="80%" y2="40%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 10s linear infinite'}} />
        <line x1="20%" y1="60%" x2="45%" y2="50%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 9s linear infinite'}} />
        <line x1="45%" y1="50%" x2="70%" y2="65%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 11s linear infinite'}} />
        <line x1="70%" y1="65%" x2="90%" y2="55%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 7s linear infinite'}} />
        <line x1="15%" y1="80%" x2="40%" y2="70%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 13s linear infinite'}} />
        <line x1="60%" y1="80%" x2="85%" y2="75%" stroke="url(#line-grad)" strokeWidth="0.5" strokeDasharray="4 6" style={{animation: 'line-flow 9s linear infinite'}} />
        <line x1="30%" y1="35%" x2="45%" y2="50%" stroke="url(#line-grad)" strokeWidth="0.3" strokeDasharray="2 8" style={{animation: 'line-flow 15s linear infinite'}} />
        <line x1="55%" y1="25%" x2="70%" y2="65%" stroke="url(#line-grad)" strokeWidth="0.3" strokeDasharray="2 8" style={{animation: 'line-flow 14s linear infinite'}} />
        <circle cx="10%" cy="20%" fill="#34d399" style={{animation: 'node-pulse 3s ease-in-out infinite'}} r="2" />
        <circle cx="30%" cy="35%" fill="#67e8f9" style={{animation: 'node-pulse 3s ease-in-out 0.5s infinite'}} r="2" />
        <circle cx="55%" cy="25%" fill="#34d399" style={{animation: 'node-pulse 3s ease-in-out 1s infinite'}} r="2" />
        <circle cx="80%" cy="40%" fill="#67e8f9" style={{animation: 'node-pulse 3s ease-in-out 1.5s infinite'}} r="2" />
        <circle cx="20%" cy="60%" fill="#67e8f9" style={{animation: 'node-pulse 3s ease-in-out 0.8s infinite'}} r="2" />
        <circle cx="45%" cy="50%" fill="#34d399" style={{animation: 'node-pulse 3s ease-in-out 1.2s infinite'}} r="2" />
        <circle cx="70%" cy="65%" fill="#67e8f9" style={{animation: 'node-pulse 3s ease-in-out 2s infinite'}} r="2" />
        <circle cx="90%" cy="55%" fill="#34d399" style={{animation: 'node-pulse 3s ease-in-out 0.3s infinite'}} r="2" />
        <circle cx="15%" cy="80%" fill="#34d399" style={{animation: 'node-pulse 3s ease-in-out 1.8s infinite'}} r="2" />
        <circle cx="40%" cy="70%" fill="#67e8f9" style={{animation: 'node-pulse 3s ease-in-out 2.2s infinite'}} r="2" />
        <circle cx="60%" cy="80%" fill="#34d399" style={{animation: 'node-pulse 3s ease-in-out 0.6s infinite'}} r="2" />
        <circle cx="85%" cy="75%" fill="#67e8f9" style={{animation: 'node-pulse 3s ease-in-out 1.4s infinite'}} r="2" />
      </svg>
      {/* Floating particles */}
      <div className="absolute bottom-0 left-[12%] h-1 w-1 rounded-full bg-emerald-400/60" style={{animation: 'drift-up 8s linear infinite'}} />
      <div className="absolute bottom-0 left-[28%] h-1.5 w-1.5 rounded-full bg-cyan-400/40" style={{animation: 'drift-up 12s linear 2s infinite'}} />
      <div className="absolute bottom-0 left-[45%] h-1 w-1 rounded-full bg-emerald-400/50" style={{animation: 'drift-up 10s linear 4s infinite'}} />
      <div className="absolute bottom-0 left-[62%] h-1.5 w-1.5 rounded-full bg-cyan-400/60" style={{animation: 'drift-up 9s linear 1s infinite'}} />
      <div className="absolute bottom-0 left-[78%] h-1 w-1 rounded-full bg-emerald-400/40" style={{animation: 'drift-up 11s linear 3s infinite'}} />
      <div className="absolute bottom-0 left-[90%] h-1 w-1 rounded-full bg-cyan-400/50" style={{animation: 'drift-up 13s linear 5s infinite'}} />
      {/* Ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 h-[50vh] w-[80vw] bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_60%)]" />
      <div className="absolute bottom-0 right-0 h-[40vh] w-[50vw] bg-[radial-gradient(ellipse_at_center,rgba(56,200,220,0.05),transparent_60%)]" />
    </div>
  );
}

// ─── Product Navigation Bar ───
export function ProductNav({ current }: { current: ProductId }) {
  return (
    <nav className="fixed top-0 z-50 w-full border-b border-slate-200 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          {PRODUCTS.map((p) => (
            <a
              key={p.id}
              href={p.url}
              className={`text-sm font-medium transition-colors ${
                p.id === current
                  ? 'text-slate-950'
                  : 'text-slate-500 hover:text-slate-600'
              }`}
            >
              {p.name}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-5 text-xs text-slate-500">
          <span className="hidden sm:inline">by 于长煦</span>
          <a href="https://github.com/anthropics" target="_blank" rel="noopener noreferrer" className="transition hover:text-slate-600">
            GitHub
          </a>
        </div>
      </div>
    </nav>
  );
}

// ─── Shared Footer ───
export function LandingFooter({ current }: { current: ProductId }) {
  const product = PRODUCTS.find(p => p.id === current)!;
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col sm:flex-row items-center justify-between gap-4 px-6 py-6">
        <span className="text-xs text-slate-600">{product.name} · {product.tagline}</span>
        <div className="flex items-center gap-6 text-xs text-slate-600">
          {PRODUCTS.filter(p => p.id !== current).map(p => (
            <a key={p.id} href={p.url} className="transition hover:text-slate-600">{p.name}</a>
          ))}
          <span className="text-slate-700">|</span>
          <span>Self-Evolving Harness · 于长煦</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Install Block ───
export function InstallBlock({ packageName }: { packageName: string }) {
  return (
    <div className="inline-block w-full max-w-lg">
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200">
          <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="ml-2 text-[10px] text-slate-600 font-mono">terminal</span>
        </div>
        <div className="px-6 py-5 text-left">
          <code className="text-sm font-mono">
            <span className="text-emerald-400/70">$</span>
            <span className="text-slate-700 ml-2">npm install {packageName}</span>
          </code>
        </div>
      </div>
    </div>
  );
}
