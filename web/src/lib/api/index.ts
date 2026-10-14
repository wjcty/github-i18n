import { apiFetch } from "./client";
import type {
  AppMeta,
  AppSession,
  InstallRepoItem,
  Installation,
  LanguageMeta,
  ModelMeta,
  Paginated,
  RepoDetail,
  RepoListItem,
  RepoTree,
  TaskCreated,
  TaskDetail,
  TaskFiles,
  TaskPreview,
  UserSettings,
} from "./types";

export const metaApi = {
  languages: () =>
    apiFetch<{ languages: LanguageMeta[] }>("/api/meta/languages"),
  models: () =>
    apiFetch<{ models: ModelMeta[]; defaultModelId: string }>(
      "/api/meta/models",
    ),
  app: () => apiFetch<AppMeta>("/api/meta/app"),
};

export const authApi = {
  session: () => apiFetch<AppSession>("/api/auth/session"),
};

export const installationsApi = {
  list: () => apiFetch<{ items: Installation[] }>("/api/installations"),
  repos: (
    installationId: number,
    params?: { page?: number; q?: string; all?: boolean },
  ) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set("page", String(params.page));
    if (params?.q) sp.set("q", params.q);
    if (params?.all) sp.set("all", "true");
    const qs = sp.toString();
    return apiFetch<Paginated<InstallRepoItem>>(
      `/api/installations/${installationId}/repos${qs ? `?${qs}` : ""}`,
    );
  },
};

export const reposApi = {
  list: (page = 1, pageSize = 20) =>
    apiFetch<Paginated<RepoListItem>>(
      `/api/repos?page=${page}&pageSize=${pageSize}`,
    ),
  get: (repoId: string) => apiFetch<RepoDetail>(`/api/repos/${repoId}`),
  import: (body: {
    installationId: number;
    githubRepoId: number;
    fullName: string;
  }) => apiFetch<RepoListItem>("/api/repos", { method: "POST", json: body }),
  patch: (repoId: string, body: Partial<RepoDetail>) =>
    apiFetch<RepoDetail>(`/api/repos/${repoId}`, {
      method: "PATCH",
      json: body,
    }),
  tree: (repoId: string, refresh?: boolean) =>
    apiFetch<RepoTree>(
      `/api/repos/${repoId}/tree${refresh ? "?refresh=true" : ""}`,
    ),
  createTask: (
    repoId: string,
    body: { mode: "full" | "incremental"; targetLanguages?: string[] },
  ) =>
    apiFetch<TaskCreated>(`/api/repos/${repoId}/tasks`, {
      method: "POST",
      json: body,
    }),
  tasks: (repoId: string, page = 1) =>
    apiFetch<Paginated<TaskDetail>>(
      `/api/repos/${repoId}/tasks?page=${page}&pageSize=20`,
    ),
};

export const tasksApi = {
  get: (taskId: string) => apiFetch<TaskDetail>(`/api/tasks/${taskId}`),
  files: (taskId: string) =>
    apiFetch<TaskFiles>(`/api/tasks/${taskId}/files`),
  preview: (taskId: string, lang: string, path: string) =>
    apiFetch<TaskPreview>(
      `/api/tasks/${taskId}/preview?lang=${encodeURIComponent(lang)}&path=${encodeURIComponent(path)}`,
    ),
  retry: (taskId: string) =>
    apiFetch<TaskCreated>(`/api/tasks/${taskId}/retry`, {
      method: "POST",
      json: {},
    }),
};

export const settingsApi = {
  get: () => apiFetch<UserSettings>("/api/settings"),
  put: (body: Partial<UserSettings & { openrouterApiKey?: string }>) =>
    apiFetch<UserSettings>("/api/settings", { method: "PUT", json: body }),
  deleteUser: () =>
    apiFetch<void>("/api/user", {
      method: "DELETE",
      json: { confirm: "DELETE" },
    }),
};
