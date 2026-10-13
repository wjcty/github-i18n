import { LANGUAGES } from "@/lib/constants";

const BLOCK_START = "## 🌐 多语言版本 / Translations";
const BLOCK_END = "---";

export function upsertReadmeTranslationBlock(
  readme: string,
  langs: string[],
  baseLang: string,
): string {
  const links = langs
    .filter((l) => l !== baseLang)
    .map((lang) => {
      const meta = LANGUAGES.find((l) => l.code === lang);
      const label = meta?.nativeName ?? lang;
      return `[${label}](./translations/${lang}/README.md)`;
    })
    .join(" | ");

  const block = `${BLOCK_START}\n${links}\n${BLOCK_END}`;

  const existing = readme.match(
    /## 🌐 多语言版本 \/ Translations[\s\S]*?---/,
  );
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
