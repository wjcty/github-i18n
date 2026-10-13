# GitHub-i18n 后端 API 文档（MVP · 前端联调版）

> **版本**：v1.0.0（已定稿）  
> **日期**：2026-10-13  
> **依据**：[需求规格文档.md](./需求规格文档.md)、[技术实现方案.md](./技术实现方案.md) v1.1.1  
> **范围**：MVP P0 能力；翻译结果经 **功能分支 + Pull Request** 交付，不直接 push 默认分支。

**Base URL**：`{APP_URL}`（本地示例 `http://localhost:3123`）  
**协议**：生产环境 HTTPS  
**数据格式**：`application/json`（GitHub Webhook 除外）

---

## 0. 已定稿的设计决策

| 议题 | 结论 |
|------|------|
| 创建翻译任务 HTTP 状态 | **202 Accepted**，表示任务已入队、异步执行 |
| 失败重试 | **复用同一 `taskId`**：重置为 `pending` 并重新入队；`retryCount` 递增，**最多 3 次** |
| 文件树结构 | 根字段 **`nodes` 嵌套 `children`**，适配 shadcn/ui Tree；不提供扁平 `parentPath` 列表 |
| Session 扩展字段 | 固定使用 **`githubLogin`**、**`emailVerified`**（与 Auth.js 标准 `user` 并存） |

---

## 1. 通用约定

### 1.1 认证

| 场景 | 方式 |
|------|------|
| 浏览器 / 业务 API | NextAuth v5 会话 Cookie（GitHub **App** 用户授权） |
| 未登录访问业务 API | **401** |
| GitHub Webhook | 服务端 HMAC 验签，**前端不调用** |

**登录相关（Auth.js 标准路由）**

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/auth/signin` | 登录页 |
| GET | `/api/auth/signin/github` | 跳转 GitHub 授权 |
| POST | `/api/auth/signout` | 登出（或客户端 `signOut()`） |
| GET | `/api/auth/session` | 当前会话 JSON |

**`GET /api/auth/session` 响应示例**（业务字段由后端 `session` 回调注入）：

```json
{
  "user": {
    "id": "cuid...",
    "name": "charmy",
    "email": "user@example.com",
    "image": "https://avatars.githubusercontent.com/u/1"
  },
  "githubLogin": "charmy",
  "emailVerified": true
}
```

| 字段 | 说明 |
|------|------|
| `user.id` | 平台用户 ID，后续 API 鉴权主体 |
| `githubLogin` | GitHub 登录名 |
| `emailVerified` | 是否在 GitHub 存在 **已验证的主邮箱** |

**邮箱规则**：`emailVerified === false` 时允许浏览与改配置；**创建/重试翻译任务**返回 **403**，提示用户在 GitHub 验证主邮箱。

**GitHub App 安装**：见 `GET /api/meta/app` 的 `githubAppInstallUrl`；未安装时前端引导用户完成安装后再导入仓库。

---

### 1.2 错误响应

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "人类可读说明",
    "details": {}
  }
}
```

| HTTP | `code` 示例 | 含义 |
|------|-------------|------|
| 400 | `VALIDATION_ERROR` | 参数或业务校验失败 |
| 401 | `UNAUTHORIZED` | 未登录 |
| 403 | `FORBIDDEN` | 无权限、邮箱未验证、配额用尽、Key 未配置等 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `CONFLICT` | 如重复导入同一仓库 |
| 429 | `RATE_LIMITED` | 限流 |
| 500 | `INTERNAL_ERROR` | 服务端错误 |

---

### 1.3 分页与 ID

- 列表 Query：`page`（默认 `1`）、`pageSize`（默认 `20`，最大 `50`）。
- 路径中的 `installationId` 为 **GitHub Installation ID**（数字）。
- `repoId`、`taskId` 为平台内 **cuid** 字符串。

---

## 2. 枚举与常量

### 2.1 语言 code（`baseLanguage` / `targetLanguages` 仅允许下表）

| code | 英文名称 |
|------|----------|
| en | English |
| zh-CN | Simplified Chinese |
| zh-TW | Traditional Chinese |
| ja | Japanese |
| ko | Korean |
| es | Spanish |
| fr | French |
| de | German |
| pt | Portuguese |
| ru | Russian |
| ar | Arabic |
| hi | Hindi |
| it | Italian |
| nl | Dutch |
| pl | Polish |
| tr | Turkish |
| vi | Vietnamese |
| th | Thai |
| id | Indonesian |
| ms | Malay |

- 新建仓库默认 `baseLanguage`: `zh-CN`。
- `targetLanguages` 至少 1 项，且不得包含 `baseLanguage`。

### 2.2 翻译任务

| 字段 | 取值 |
|------|------|
| `mode` | `full` \| `incremental` |
| `trigger` | `manual` \| `webhook` |
| `status` | `pending` \| `running` \| `completed` \| `failed` \| `skipped` |

| `skipReason` | 含义 |
|--------------|------|
| `NO_FILES_TO_TRANSLATE` | 增量/全量筛选后无待译文件 |

### 2.3 计费模式

| `billingMode` | 说明 |
|---------------|------|
| `BYOK` | 用户 Settings 中配置 OpenRouter Key |
| `PLATFORM` | 使用平台 Key，受 `platformQuota` 限制 |

### 2.4 仓库列表态 `translationStatus`

`not_started` | `in_progress` | `synced` | `error`（由最近一次任务状态推导，仅供展示）

---

## 3. 元数据

### GET `/api/meta/languages`

静态语言表，可长期缓存。

**200**

```json
{
  "languages": [
    { "code": "en", "name": "English", "nativeName": "English" },
    { "code": "zh-CN", "name": "Simplified Chinese", "nativeName": "简体中文" }
  ]
}
```

---

### GET `/api/meta/models`

OpenRouter 模型列表（配置页下拉；建议缓存 1h）。

**200**

```json
{
  "models": [
    {
      "id": "openai/gpt-4o-mini",
      "name": "GPT-4o Mini",
      "contextLength": 128000
    }
  ],
  "defaultModelId": "openai/gpt-4o-mini"
}
```

---

### GET `/api/meta/app`

前端安装引导用（无需登录亦可，或登录后返回相同结构）。

**200**

```json
{
  "appName": "GitHub-i18n",
  "githubAppInstallUrl": "https://github.com/apps/{app-slug}/installations/new"
}
```

---

## 4. GitHub 安装与仓库

### GET `/api/installations`

当前用户可见的 App 安装列表。

**200**

```json
{
  "items": [
    {
      "installationId": 12345678,
      "accountLogin": "my-org",
      "accountType": "Organization",
      "repositorySelection": "selected"
    }
  ]
}
```

---

### GET `/api/installations/{installationId}/repos`

该安装下可导入仓库（分页）。

**Query**：`page`, `pageSize`, `q`（按仓库名过滤，可选）

**200**

```json
{
  "items": [
    {
      "githubRepoId": 987654321,
      "fullName": "owner/repo",
      "defaultBranch": "main",
      "private": false,
      "alreadyImported": false,
      "platformRepoId": null
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 42
}
```

---

### POST `/api/repos`

导入仓库。

**Body**

```json
{
  "installationId": 12345678,
  "githubRepoId": 987654321,
  "fullName": "owner/repo"
}
```

**201**：仓库对象（与下列字段一致）

```json
{
  "id": "repo_cuid",
  "owner": "owner",
  "name": "repo",
  "fullName": "owner/repo",
  "defaultBranch": "main",
  "baseLanguage": "zh-CN",
  "targetLanguages": [],
  "autoSyncEnabled": true,
  "lastTranslatedBaseCommit": null,
  "translationStatus": "not_started"
}
```

**409**：同一用户下该 `githubRepoId` 已导入。

---

### GET `/api/repos`

仪表盘仓库列表。

**Query**：`page`, `pageSize`

**200**

```json
{
  "items": [
    {
      "id": "repo_cuid",
      "fullName": "owner/repo",
      "defaultBranch": "main",
      "baseLanguage": "zh-CN",
      "targetLanguages": ["en", "ja"],
      "autoSyncEnabled": true,
      "lastTranslatedBaseCommit": "abc123...",
      "lastPrUrl": "https://github.com/owner/repo/pull/12",
      "lastTask": {
        "id": "task_cuid",
        "status": "completed",
        "finishedAt": "2026-10-13T06:00:00.000Z"
      },
      "translationStatus": "synced"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 5
}
```

---

### GET `/api/repos/{repoId}`

仓库详情、配置与最近任务。

**200**

```json
{
  "id": "repo_cuid",
  "installationId": 12345678,
  "owner": "owner",
  "name": "repo",
  "fullName": "owner/repo",
  "defaultBranch": "main",
  "baseLanguage": "zh-CN",
  "targetLanguages": ["en", "ja"],
  "autoSyncEnabled": true,
  "scopeConfig": {
    "mode": "paths",
    "includePaths": ["README.md", "docs/"],
    "excludePaths": []
  },
  "ignoreFileContent": "node_modules/\n",
  "lastTranslatedBaseCommit": "abc123...",
  "lastPrUrl": "https://github.com/owner/repo/pull/12",
  "lastPrNumber": 12,
  "recentTasks": [
    {
      "id": "task_cuid",
      "status": "completed",
      "mode": "full",
      "trigger": "manual",
      "createdAt": "2026-10-13T05:00:00.000Z",
      "prUrl": "https://github.com/owner/repo/pull/12"
    }
  ]
}
```

---

### PATCH `/api/repos/{repoId}`

更新翻译配置。配置保存于平台 DB；**`.github-i18n-ignore` 等内容在下次翻译任务的 PR 中一并提交**，不直接写默认分支。

**Body**（部分更新，仅传需修改字段）

```json
{
  "baseLanguage": "zh-CN",
  "targetLanguages": ["en", "ja"],
  "autoSyncEnabled": true,
  "scopeConfig": {
    "mode": "paths",
    "includePaths": ["README.md", "docs/"],
    "excludePaths": []
  },
  "ignoreFileContent": "node_modules/\nCHANGELOG.md\n"
}
```

**scopeConfig（MVP）**

- `mode` 固定 `"paths"`。
- `includePaths`：相对路径；目录以 `/` 结尾；**仅 `.md` 参与翻译**。
- 待译集合：`(include 命中的 .md) \ (.github-i18n-ignore 规则) \ (excludePaths)`。

**200**：与 `GET /api/repos/{repoId}` 相同结构。

---

### GET `/api/repos/{repoId}/tree`

默认分支文件树（可视化选范围；服务端缓存约 **5 分钟**）。

**Query**：`refresh=true` 强制刷新 GitHub 树。

**200**

```json
{
  "defaultBranch": "main",
  "commitSha": "abc123...",
  "cachedAt": "2026-10-13T06:00:00.000Z",
  "truncated": false,
  "nodes": [
    {
      "path": "README.md",
      "type": "file",
      "translatable": true
    },
    {
      "path": "docs/",
      "type": "dir",
      "translatable": false,
      "children": [
        {
          "path": "docs/guide.md",
          "type": "file",
          "translatable": true
        }
      ]
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `type` | `file` \| `dir` |
| `translatable` | 仅 `*.md` 为 `true` |
| `children` | 仅 `dir` 有；递归嵌套 |
| `truncated` | GitHub recursive tree 被截断时为 `true`，前端提示改用手动路径 / ignore |

---

## 5. 翻译任务

### POST `/api/repos/{repoId}/tasks`

创建任务并入队（MySQL Worker 异步执行）。

**Body**

```json
{
  "mode": "full",
  "targetLanguages": ["en", "ja"]
}
```

| 字段 | 说明 |
|------|------|
| `mode` | `full`：范围内全部待译；`incremental`：自 `lastTranslatedBaseCommit` 至当前默认分支 HEAD 的变更 `.md` |
| `targetLanguages` | 可选；省略则用仓库已保存配置 |

**403 示例场景**：邮箱未验证；BYOK 未配 Key；PLATFORM 配额用尽；仓库不属于当前用户。

**202 Accepted**

```json
{
  "taskId": "task_cuid",
  "status": "pending",
  "mode": "full",
  "trigger": "manual",
  "progressUrl": "/api/tasks/task_cuid",
  "eventsUrl": "/api/tasks/task_cuid/events"
}
```

---

### GET `/api/repos/{repoId}/tasks`

任务历史。

**Query**：`page`, `pageSize`, `status`（可选，过滤任务状态）

**200**

```json
{
  "items": [
    {
      "id": "task_cuid",
      "status": "completed",
      "mode": "incremental",
      "trigger": "webhook",
      "progress": {
        "totalFiles": 3,
        "doneFiles": 3,
        "currentFile": null,
        "percent": 100
      },
      "prUrl": "https://github.com/owner/repo/pull/13",
      "skipReason": null,
      "errorMessage": null,
      "retryCount": 0,
      "createdAt": "2026-10-13T06:00:00.000Z",
      "finishedAt": "2026-10-13T06:05:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 10
}
```

---

### GET `/api/tasks/{taskId}`

任务详情与进度。建议 **2s 轮询**，或与 SSE 二选一。

**200**

```json
{
  "id": "task_cuid",
  "repositoryId": "repo_cuid",
  "fullName": "owner/repo",
  "status": "running",
  "mode": "full",
  "trigger": "manual",
  "progress": {
    "totalFiles": 12,
    "doneFiles": 5,
    "currentFile": "docs/guide.md",
    "percent": 42
  },
  "targetLanguages": ["en", "ja"],
  "headBranch": "github-i18n/repo_cuid-20261013-a1b2",
  "prUrl": null,
  "prNumber": null,
  "skipReason": null,
  "errorMessage": null,
  "retryCount": 0,
  "createdAt": "2026-10-13T06:00:00.000Z",
  "finishedAt": null
}
```

| `status` | 前端要点 |
|----------|----------|
| `completed` | 展示 `prUrl`，引导 Review / Merge |
| `skipped` | 展示 `skipReason`（如 `NO_FILES_TO_TRANSLATE`），可无 `prUrl` |
| `failed` | 展示 `errorMessage`，可调用重试接口 |

---

### GET `/api/tasks/{taskId}/events`

Server-Sent Events，`Content-Type: text/event-stream`。需携带会话 Cookie。

| event | data（JSON 字符串） |
|-------|---------------------|
| `progress` | `{"doneFiles":5,"totalFiles":12,"currentFile":"docs/a.md","percent":42}` |
| `status` | `{"status":"running"}` |
| `completed` | `{"status":"completed","prUrl":"...","prNumber":13}` |
| `failed` | `{"status":"failed","errorMessage":"..."}` |
| `skipped` | `{"status":"skipped","skipReason":"NO_FILES_TO_TRANSLATE"}` |

断线后回退 `GET /api/tasks/{taskId}`。

---

### GET `/api/tasks/{taskId}/preview`

任务 **completed** 或 **skipped** 且存在预览缓存时可用（译文来自任务执行结果，不依赖 PR 是否合并）。

**Query**

| 参数 | 必填 | 说明 |
|------|------|------|
| `lang` | 是 | 如 `en` |
| `path` | 是 | 基准语言相对路径，如 `docs/guide.md` |

**200**

```json
{
  "lang": "en",
  "sourcePath": "docs/guide.md",
  "translatedPath": "translations/en/docs/guide.md",
  "content": "# Translated markdown...",
  "encoding": "utf-8"
}
```

**404**：任务进行中、或该文件不在本次任务译文中。

---

### POST `/api/tasks/{taskId}/retry`

仅 **`status === failed`** 且 `retryCount < 3` 时可调用。

**Body**：`{}`

**202 Accepted**（**复用同一 `taskId`**）

```json
{
  "taskId": "task_cuid",
  "status": "pending",
  "mode": "full",
  "trigger": "manual",
  "progressUrl": "/api/tasks/task_cuid",
  "eventsUrl": "/api/tasks/task_cuid/events",
  "retryCount": 1
}
```

**403**：已达最大重试次数或非 failed 状态。

---

## 6. 用户设置

### GET `/api/settings`

**200**

```json
{
  "billingMode": "BYOK",
  "defaultModelId": "openai/gpt-4o-mini",
  "defaultTargetLangs": ["en"],
  "openrouterKeyConfigured": true,
  "openrouterKeyMask": "sk-or-v1...abcd",
  "platformQuota": {
    "monthlyCharLimit": 500000,
    "monthlyCharUsed": 12000,
    "resetAt": "2026-11-01T00:00:00.000Z"
  }
}
```

永不返回 Key 或 GitHub Token 明文。

---

### PUT `/api/settings`

**Body**

```json
{
  "billingMode": "BYOK",
  "openrouterApiKey": "sk-or-v1-...",
  "defaultModelId": "openai/gpt-4o-mini",
  "defaultTargetLangs": ["en", "ja"]
}
```

- `"openrouterApiKey": ""` → 清除 BYOK Key。
- 省略 `openrouterApiKey` → 不修改已有 Key。

**200**：与 `GET /api/settings` 相同。

---

### DELETE `/api/user`

删除账户及关联仓库、任务、加密字段。

**Body**（建议二次确认）

```json
{ "confirm": "DELETE" }
```

**204** No Content

---

## 7. 仅后端使用的接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/webhooks/github` | GitHub App Webhook：`push`（默认分支）触发 incremental 任务；`installation*` 同步安装状态 |

前端无需对接；知晓存在即可（用于理解 Webhook 自动同步）。

---

## 8. 端到端流程（前端视角）

```text
GET /api/auth/session（或 signin）
  → GET /api/meta/app → 引导 githubAppInstallUrl
  → GET /api/installations
  → GET /api/installations/{id}/repos
  → POST /api/repos
  → GET /api/repos/{id}/tree + PATCH /api/repos/{id}（语言、范围、ignore、autoSync）
  → POST /api/repos/{id}/tasks  → 202
  → GET /api/tasks/{id}/events 或轮询 GET /api/tasks/{id}
  → GET /api/tasks/{id}/preview
  → 打开 prUrl（GitHub Review & Merge）
```

**Git 交付约定**

| 项 | 值 |
|----|-----|
| 功能分支 | `github-i18n/{repoId}-{yyyyMMdd}-{shortTaskId}` |
| PR base | 仓库默认分支 |
| 译文路径 | `translations/{lang}/{原相对路径}` |
| README | 插入/更新多语言切换区块（由 Worker 写入 PR） |

---

## 9. 已定稿实现说明（v1.0.0）

与 §0 一致：`POST .../tasks` 返回 **202**；`POST .../tasks/{id}/retry` **复用 taskId**；文件树 **嵌套 children**；Session 含 **githubLogin**、**emailVerified**。

---

## 10. 接口索引

| 方法 | 路径 |
|------|------|
| GET | `/api/meta/languages` |
| GET | `/api/meta/models` |
| GET | `/api/meta/app` |
| GET | `/api/installations` |
| GET | `/api/installations/{installationId}/repos` |
| POST | `/api/repos` |
| GET | `/api/repos` |
| GET/PATCH | `/api/repos/{repoId}` |
| GET | `/api/repos/{repoId}/tree` |
| POST | `/api/repos/{repoId}/tasks` |
| GET | `/api/repos/{repoId}/tasks` |
| GET | `/api/tasks/{taskId}` |
| GET | `/api/tasks/{taskId}/events` |
| GET | `/api/tasks/{taskId}/preview` |
| POST | `/api/tasks/{taskId}/retry` |
| GET/PUT | `/api/settings` |
| DELETE | `/api/user` |
| * | `/api/auth/*` |

---

**文档变更**

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0.0 | 2026-10-13 | 定稿并实现：202 创建任务、重试复用 taskId、嵌套文件树、session 字段；`/api/meta/app`；`retryCount` / `skipReason` |
