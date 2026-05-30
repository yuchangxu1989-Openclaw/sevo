import "@/app/globals.css";

export const metadata = { title: "SEVO 自演进执行中枢" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
