import type { TreeNode } from "@/types/api";
import { isMarkdown } from "@/lib/translation/paths";

type FlatEntry = { path: string; type: "blob" | "tree" };

/** 目录在前、文件在后，各组内保持原有相对顺序（与 GitHub 仓库浏览一致） */
function finalizeSiblingOrder(nodes: TreeNode[]) {
  const dirs = nodes.filter((n) => n.type === "dir");
  const files = nodes.filter((n) => n.type === "file");
  nodes.splice(0, nodes.length, ...dirs, ...files);
  for (const n of dirs) {
    if (n.children?.length) finalizeSiblingOrder(n.children);
  }
}

/**
 * 仅包含 Markdown 文件及其祖先目录。
 * 兄弟节点顺序跟随 GitHub tree API 返回顺序（不再按字母重排）。
 */
export function buildNestedTree(entries: FlatEntry[]): {
  nodes: TreeNode[];
  truncated: boolean;
} {
  // 保留 API 原始顺序，只取 .md
  const files = entries
    .filter((e) => e.type === "blob" && isMarkdown(e.path))
    .map((e) => e.path);

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

  for (const file of files) {
    const fileNode: TreeNode = {
      path: file,
      type: "file",
      translatable: true,
    };
    const idx = file.lastIndexOf("/");
    if (idx === -1) {
      root.push(fileNode);
    } else {
      const dir = ensureDir(file.slice(0, idx + 1));
      dir.children!.push(fileNode);
    }
  }

  finalizeSiblingOrder(root);

  return { nodes: root, truncated: false };
}
