/**
 * Post-tsc build step: copy non-TypeScript assets from src/ to dist/.
 * Currently handles: evaluators/builtins/ (shell scripts, JS evaluators)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

const assetDirs = ['evaluators/builtins'];
const assetFiles = ['engine/default-stage-standards.json'];

for (const relDir of assetDirs) {
  const srcPath = path.join(srcDir, relDir);
  const distPath = path.join(distDir, relDir);

  if (!fs.existsSync(srcPath)) continue;

  fs.mkdirSync(distPath, { recursive: true });

  const files = fs.readdirSync(srcPath);
  for (const file of files) {
    // Skip TypeScript source files (already compiled by tsc)
    if (file.endsWith('.ts')) continue;

    const src = path.join(srcPath, file);
    const dest = path.join(distPath, file);

    fs.copyFileSync(src, dest);

    // Preserve executable permission for shell scripts
    if (file.endsWith('.sh')) {
      fs.chmodSync(dest, 0o755);
    }
  }

  console.log(`Copied ${files.filter(f => !f.endsWith('.ts')).length} asset(s) to dist/${relDir}/`);
}

// Copy individual asset files
for (const relFile of assetFiles) {
  const src = path.join(srcDir, relFile);
  const dest = path.join(distDir, relFile);

  if (!fs.existsSync(src)) continue;

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`Copied asset: dist/${relFile}`);
}
