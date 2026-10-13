import type { TreeNode } from "@/types/api";
import { isMarkdown } from "@/lib/translation/paths";

type FlatEntry = { path: string; type: "blob" | "tree" };

export function buildNestedTree(entries: FlatEntry[]): {
  nodes: TreeNode[];
  truncated: boolean;
} {
  const files = entries
    .filter((e) => e.type === "blob")
    .map((e) => e.path)
    .sort();

  const dirSet = new Set<string>();
  for (const f of files) {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(parts.slice(0, i).join("/") + "/");
    }
  }

  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  function ensureDir(dirPath: string): TreeNode {
    const existing = dirMap.get(dirPath);
    if (existing) return existing;
    const node: TreeNode = {
      path: dirPath,
      type: "dir",
      translatable: false,
      children: [],
    };
    dirMap.set(dirPath, node);
    const parentPath = dirPath.includes("/")
      ? dirPath.slice(0, dirPath.lastIndexOf("/", dirPath.length - 2) + 1)
      : "";
    if (!parentPath) {
      root.push(node);
    } else {
      const parent = ensureDir(parentPath);
      parent.children!.push(node);
    }
    return node;
  }

  for (const dir of [...dirSet].sort()) {
    ensureDir(dir);
  }

  for (const file of files) {
    const fileNode: TreeNode = {
      path: file,
      type: "file",
      translatable: isMarkdown(file),
    };
    const idx = file.lastIndexOf("/");
    if (idx === -1) {
      root.push(fileNode);
    } else {
      const dir = ensureDir(file.slice(0, idx + 1));
      dir.children!.push(fileNode);
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  };
  sortNodes(root);

  return { nodes: root, truncated: false };
}
