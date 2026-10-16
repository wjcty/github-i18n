import { createHash } from "crypto";
import { LANGUAGES } from "@/lib/constants";

const BLOCK_START = "## 🌐 多语言版本 / Translations";
const BLOCK_END = "---";
const BLOCK_RE = /## 🌐 多语言版本 \/ Translations[\s\S]*?\n---/;
const LINK_LANG_RE = /\]\(\.?\/?translations\/([^/)]+)\//g;
const SOURCE_MARKER_RE = /<!-- github-i18n-source: ([a-f0-9]+) -->/;

export function isRootReadme(path: string): boolean {
  return path.toLowerCase() === "readme.md";
}

/** 去掉多语言链接区块，得到 README 的“正文”，用于翻译与变更判断 */
export function stripTranslationBlock(readme: string): string {
  return readme.replace(BLOCK_RE, "").replace(/^\s*\n/, "");
}

/** README 正文哈希；只改链接区块不会改变哈希 */
export function readmeSourceHash(readme: string): string {
  const normalized = stripTranslationBlock(readme)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return createHash("sha256")
    .update(normalized)
    .digest("hex")
    .slice(0, 16);
}

export function withSourceMarker(translated: string, hash: string): string {
  return `${translated.replace(SOURCE_MARKER_RE, "").trimEnd()}\n\n<!-- github-i18n-source: ${hash} -->\n`;
}

/** 已有译文是否由当前 README 正文翻译而来 */
export function isTranslationUpToDate(
  existingTranslation: string | null,
  hash: string,
): boolean {
  return existingTranslation?.match(SOURCE_MARKER_RE)?.[1] === hash;
}

function existingBlockLangs(readme: string): string[] {
  const block = readme.match(BLOCK_RE)?.[0];
  if (!block) return [];
  return [...block.matchAll(LINK_LANG_RE)].map((m) => decodeURI(m[1]));
}

/** 插入或更新链接区块：保留已有语言并追加新语言，链接文本统一使用英文名 */
export function upsertReadmeTranslationBlock(
  readme: string,
  langs: string[],
  baseLang: string,
): string {
  const merged = new Set([...existingBlockLangs(readme), ...langs]);
  merged.delete(baseLang);

  const links = LANGUAGES.filter((l) => merged.has(l.code))
    .map((l) => `[${l.name}](./translations/${l.code}/README.md)`)
    .join(" | ");

  const block = `${BLOCK_START}\n${links}\n${BLOCK_END}`;

  const existing = readme.match(BLOCK_RE);
  if (existing) {
    return readme.replace(existing[0], block);
  }

  const toc = readme.match(/^##\s+目录/m);
  if (toc?.index != null) {
    return readme.slice(0, toc.index) + block + "\n\n" + readme.slice(toc.index);
  }

  const firstH2 = readme.match(/^##\s+/m);
  if (firstH2?.index != null) {
    return (
      readme.slice(0, firstH2.index) + block + "\n\n" + readme.slice(firstH2.index)
    );
  }

  return block + "\n\n" + readme;
}
