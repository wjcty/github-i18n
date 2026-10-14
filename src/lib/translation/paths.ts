/** 译文路径：translations/{lang}/{与基准语言相同的相对路径} */
export function translatedPath(lang: string, sourcePath: string): string {
  const normalized = sourcePath.replace(/^\.\//, "");
  return `translations/${lang}/${normalized}`;
}

export function isMarkdown(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}
