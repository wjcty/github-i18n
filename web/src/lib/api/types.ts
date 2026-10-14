export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type TranslationStatus =
  | "not_started"
  | "in_progress"
  | "synced"
  | "error";

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type TaskMode = "full" | "incremental";
export type TaskTrigger = "manual" | "webhook";
export type BillingMode = "BYOK" | "PLATFORM";

export type LanguageMeta = {
  code: string;
  name: string;
  nativeName: string;
};

export type ModelMeta = {
  id: string;
  name: string;
  contextLength: number;
};

export type AppMeta = {
  appName: string;
  githubAppInstallUrl: string;
};

export type Installation = {
  installationId: number;
  accountLogin: string;
  accountType: string;
  repositorySelection: string;
};

export type InstallRepoItem = {
  githubRepoId: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  alreadyImported: boolean;
  platformRepoId: string | null;
};

export type ScopeConfig = {
  mode: "paths";
  includePaths: string[];
  excludePaths: string[];
};

export type TaskProgress = {
  totalFiles: number;
  doneFiles: number;
  currentFile: string | null;
  percent: number;
};

export type RepoListItem = {
  id: string;
  fullName: string;
  defaultBranch: string;
  baseLanguage: string;
  targetLanguages: string[];
  autoSyncEnabled: boolean;
  lastTranslatedBaseCommit: string | null;
  lastPrUrl: string | null;
  lastTask: {
    id: string;
    status: TaskStatus;
    finishedAt: string | null;
  } | null;
  translationStatus: TranslationStatus;
};

export type RepoDetail = {
  id: string;
  installationId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  baseLanguage: string;
  targetLanguages: string[];
  autoSyncEnabled: boolean;
  scopeConfig: ScopeConfig;
  ignoreFileContent: string;
  lastTranslatedBaseCommit: string | null;
  lastPrUrl: string | null;
  lastPrNumber: number | null;
  recentTasks: Array<{
    id: string;
    status: TaskStatus;
    mode: TaskMode;
    trigger: TaskTrigger;
    createdAt: string;
    prUrl: string | null;
  }>;
};

export type TreeNode = {
  path: string;
  type: "file" | "dir";
  translatable?: boolean;
  children?: TreeNode[];
};

export type RepoTree = {
  defaultBranch: string;
  commitSha: string;
  cachedAt: string;
  truncated: boolean;
  nodes: TreeNode[];
  empty?: boolean;
};

export type TaskDetail = {
  id: string;
  repositoryId: string;
  fullName: string;
  status: TaskStatus;
  mode: TaskMode;
  trigger: TaskTrigger;
  progress: TaskProgress;
  targetLanguages: string[];
  headBranch: string | null;
  prUrl: string | null;
  prNumber: number | null;
  skipReason: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: string;
  finishedAt: string | null;
};

export type TaskCreated = {
  taskId: string;
  status: TaskStatus;
  mode: TaskMode;
  trigger: TaskTrigger;
  progressUrl: string;
  eventsUrl: string;
  retryCount?: number;
};

export type TaskFile = {
  sourcePath: string;
  items: { lang: string; translatedPath: string }[];
};

export type TaskFiles = {
  files: TaskFile[];
  count: number;
  finishedAt: string | null;
};

export type TaskPreview = {
  lang: string;
  sourcePath: string;
  translatedPath: string;
  content: string;
  encoding: string;
};

export type UserSettings = {
  billingMode: BillingMode;
  defaultModelId: string;
  defaultTargetLangs: string[];
  openrouterKeyConfigured: boolean;
  openrouterKeyMask: string | null;
  platformQuota: {
    monthlyCharLimit: number;
    monthlyCharUsed: number;
    resetAt: string;
  };
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type AppSession = {
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  githubLogin?: string;
  emailVerified?: boolean;
};
