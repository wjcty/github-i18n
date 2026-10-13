import type { ApiErrorBody } from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  const site = process.env.NEXT_PUBLIC_APP_URL;
  if (site) return site.replace(/\/$/, "");
  return process.env.API_URL?.replace(/\/$/, "") ?? "http://localhost:3001";
}

type FetchOptions = RequestInit & {
  json?: unknown;
};

export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { json, headers, ...rest } = options;
  const url = path.startsWith("http") ? path : `${getBaseUrl()}${path}`;

  const res = await fetch(url, {
    ...rest,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    cache: rest.cache ?? "no-store",
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T | ApiErrorBody) : null;

  if (!res.ok) {
    const err = data as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      err?.error?.code ?? "INTERNAL_ERROR",
      err?.error?.message ?? res.statusText,
      err?.error?.details,
    );
  }

  return data as T;
}
