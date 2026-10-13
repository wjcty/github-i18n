export type ScopeConfig = {
  mode: "paths";
  includePaths: string[];
  excludePaths: string[];
};

export type TreeNode = {
  path: string;
  type: "file" | "dir";
  translatable: boolean;
  children?: TreeNode[];
};
