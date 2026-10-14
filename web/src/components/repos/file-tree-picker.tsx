"use client";

import { useMemo, useState } from "react";
import {
  CaretDownIcon,
  CaretRightIcon,
  FileMdIcon,
  FolderIcon,
} from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TreeNode } from "@/lib/api/types";

/** 只保留 Markdown 文件及含 Markdown 的目录（兼容旧缓存树） */
function filterMarkdownTree(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  for (const n of nodes) {
    if (n.type === "file") {
      const isMd =
        n.translatable ?? n.path.toLowerCase().endsWith(".md");
      if (isMd) out.push({ ...n, translatable: true });
      continue;
    }
    const children = filterMarkdownTree(n.children ?? []);
    if (children.length > 0) {
      out.push({ ...n, children });
    }
  }
  return out;
}

function collectMdPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "file" && n.translatable) out.push(n.path);
    if (n.children?.length) out.push(...collectMdPaths(n.children));
  }
  return out;
}

function collectMdUnder(node: TreeNode): string[] {
  if (node.type === "file") return node.translatable ? [node.path] : [];
  return (node.children ?? []).flatMap(collectMdUnder);
}

function TreeRow({
  node,
  selected,
  onToggle,
  depth,
  expanded,
  onToggleExpand,
}: {
  node: TreeNode;
  selected: Set<string>;
  onToggle: (path: string, checked: boolean, node: TreeNode) => void;
  depth: number;
  expanded: Set<string>;
  onToggleExpand: (path: string) => void;
}) {
  const mdUnder = collectMdUnder(node);
  const isDir = node.type === "dir";
  const checked = isDir
    ? mdUnder.length > 0 && mdUnder.every((p) => selected.has(p))
    : selected.has(node.path);
  const canToggle = node.translatable || (isDir && mdUnder.length > 0);
  const isExpanded = isDir && expanded.has(node.path);
  const hasChildren = Boolean(node.children?.length);

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {isDir && hasChildren ? (
          <button
            type="button"
            className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "折叠目录" : "展开目录"}
            onClick={() => onToggleExpand(node.path)}
          >
            {isExpanded ? (
              <CaretDownIcon className="size-3.5" weight="bold" aria-hidden />
            ) : (
              <CaretRightIcon className="size-3.5" weight="bold" aria-hidden />
            )}
          </button>
        ) : (
          <span className="inline-block size-4 shrink-0" aria-hidden />
        )}
        {canToggle ? (
          <Checkbox
            id={`path-${node.path}`}
            checked={checked}
            onCheckedChange={(v) => onToggle(node.path, v === true, node)}
          />
        ) : (
          <span className="inline-block size-4 shrink-0" aria-hidden />
        )}
        {isDir ? (
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <FileMdIcon className="size-4 shrink-0 text-primary" aria-hidden />
        )}
        <label
          htmlFor={canToggle ? `path-${node.path}` : undefined}
          className="min-w-0 flex-1 cursor-pointer truncate font-mono text-xs"
        >
          {node.path.split("/").filter(Boolean).pop()}
          {isDir ? "/" : ""}
        </label>
      </div>
      {isDir && isExpanded && hasChildren ? (
        <ul>
          {node.children!.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              selected={selected}
              onToggle={onToggle}
              depth={depth + 1}
              expanded={expanded}
              onToggleExpand={onToggleExpand}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTreePicker({
  nodes,
  includePaths,
  onChange,
}: {
  nodes: TreeNode[];
  includePaths: string[];
  onChange: (paths: string[]) => void;
}) {
  const mdNodes = useMemo(() => filterMarkdownTree(nodes), [nodes]);
  const selected = useMemo(() => new Set(includePaths), [includePaths]);
  const allMd = useMemo(() => collectMdPaths(mdNodes), [mdNodes]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggle(path: string, checked: boolean, node: TreeNode) {
    const next = new Set(selected);
    const targets =
      node.type === "dir" ? collectMdUnder(node) : node.translatable ? [path] : [];
    for (const p of targets) {
      if (checked) next.add(p);
      else next.delete(p);
    }
    onChange(Array.from(next));
  }

  function selectAll() {
    onChange(allMd);
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          type="button"
          className="cursor-pointer text-xs font-medium text-primary underline-offset-4 hover:underline"
          onClick={selectAll}
        >
          全选 Markdown
        </button>
        <button
          type="button"
          className="cursor-pointer text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={clearAll}
        >
          清空
        </button>
      </div>
      <ScrollArea className="h-72 rounded-lg border border-border bg-card/50">
        <ul className="p-2">
          {mdNodes.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              selected={selected}
              onToggle={toggle}
              depth={0}
              expanded={expanded}
              onToggleExpand={toggleExpand}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
