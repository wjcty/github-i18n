"use client";

import { useMemo } from "react";
import { FileMd, Folder } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TreeNode } from "@/lib/api/types";

function collectMdPaths(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    if (n.type === "file" && n.translatable) out.push(n.path);
    if (n.children?.length) out.push(...collectMdPaths(n.children));
  }
  return out;
}

function TreeRow({
  node,
  selected,
  onToggle,
  depth,
}: {
  node: TreeNode;
  selected: Set<string>;
  onToggle: (path: string, checked: boolean) => void;
  depth: number;
}) {
  const checked = selected.has(node.path);
  const isDir = node.type === "dir";

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-md py-1 pr-2 hover:bg-muted/60"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.translatable ? (
          <Checkbox
            id={`path-${node.path}`}
            checked={checked}
            onCheckedChange={(v) => onToggle(node.path, v === true)}
          />
        ) : (
          <span className="inline-block size-4 shrink-0" aria-hidden />
        )}
        {isDir ? (
          <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <FileMd className="size-4 shrink-0 text-primary" aria-hidden />
        )}
        <label
          htmlFor={node.translatable ? `path-${node.path}` : undefined}
          className="min-w-0 flex-1 cursor-pointer truncate font-mono text-xs"
        >
          {node.path.split("/").pop()}
          {isDir ? "/" : ""}
        </label>
      </div>
      {node.children?.length ? (
        <ul>
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              selected={selected}
              onToggle={onToggle}
              depth={depth + 1}
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
  const selected = useMemo(() => new Set(includePaths), [includePaths]);
  const allMd = useMemo(() => collectMdPaths(nodes), [nodes]);

  function toggle(path: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(path);
    else next.delete(path);
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
          {nodes.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              selected={selected}
              onToggle={toggle}
              depth={0}
            />
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}
