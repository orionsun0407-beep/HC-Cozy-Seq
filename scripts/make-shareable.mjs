import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const shareDir = path.join(root, 'share');
const indexPath = path.join(distDir, 'index.html');
const outputPath = path.join(shareDir, 'hc-cozyseq.html');

const mimeByExtension = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function resolveDistAsset(assetRef, baseDir = distDir) {
  const cleanRef = assetRef.replace(/^\.\//, '').replace(/^\//, '');
  return assetRef.startsWith('/') || assetRef.startsWith('assets/') ? path.join(distDir, cleanRef) : path.resolve(baseDir, assetRef);
}

async function inlineCssAssets(css, cssDir) {
  const urlPattern = /url\((["']?)(?!data:|https?:|#)([^)"']+)\1\)/g;
  const replacements = await Promise.all(
    [...css.matchAll(urlPattern)].map(async (match) => {
      const assetRef = match[2];
      const assetPath = resolveDistAsset(assetRef, cssDir);
      const extension = path.extname(assetPath).toLowerCase();
      const mime = mimeByExtension.get(extension) ?? 'application/octet-stream';
      const buffer = await readFile(assetPath);
      return [match[0], `url("data:${mime};base64,${buffer.toString('base64')}")`];
    }),
  );

  return replacements.reduce((nextCss, [from, to]) => nextCss.replace(from, to), css);
}

async function main() {
  let html = await readFile(indexPath, 'utf8');

  const styleMatches = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">/g)];
  for (const match of styleMatches) {
    const cssPath = resolveDistAsset(match[1]);
    const css = await inlineCssAssets(await readFile(cssPath, 'utf8'), path.dirname(cssPath));
    html = html.replace(match[0], () => `<style>\n${css}\n</style>`);
  }

  const scriptMatches = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
  for (const match of scriptMatches) {
    const jsPath = resolveDistAsset(match[1]);
    const js = (await readFile(jsPath, 'utf8')).replace(/<\/script/gi, '<\\/script');
    html = html.replace(match[0], () => `<script type="module">\n${js}\n</script>`);
  }

  await mkdir(shareDir, { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  console.log(`Shareable single-file app written to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
