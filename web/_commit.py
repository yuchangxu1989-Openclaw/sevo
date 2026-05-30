import subprocess, os
os.chdir("/root/.openclaw/workspace")
files = [
    "projects/sevo/web/components/ui/pagination.tsx",
    "projects/sevo/web/app/(dashboard)/projects/page.tsx",
    "projects/sevo/web/app/api/v1/projects/route.ts",
    "projects/sevo/web/lib/engine-service.ts",
    "projects/sevo/web/lib/api-client.ts",
    "projects/sevo/web/types/index.ts",
    "projects/sevo/web/components/app-shell.tsx",
    "projects/sevo/web/app/(dashboard)/frs/page.tsx",
    "projects/sevo/web/app/(dashboard)/todos/page.tsx",
    "projects/sevo/web/app/(dashboard)/notifications/page.tsx",
    "projects/sevo/web/app/(dashboard)/deliverables/page.tsx",
    "projects/sevo/web/app/(dashboard)/ledger/page.tsx",
]
subprocess.run(["git", "add"] + files, check=True)
# Remove temp scripts dir
import shutil
tmp = "projects/sevo/web/scripts"
if os.path.exists(tmp):
    shutil.rmtree(tmp)
msg = """sevo: Projects页面+全局分页 — 新建项目列表页+Pagination组件+5页面分页统一(cc)

- 新增 /projects 页面：按项目分组展示 FR 概览（完成进度、状态统计）
- 新增通用 Pagination 组件，替换 frs/todos/notifications 内联分页
- deliverables 和 ledger 页面新增客户端分页（每页20条）
- 侧边栏新增"项目"导航入口
- engine-service 新增 listProjects + API route + api-client hook
- 构建验证通过

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"""
result = subprocess.run(["git", "commit", "-m", msg], capture_output=True, text=True)
print(result.stdout)
print(result.stderr)
