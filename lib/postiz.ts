// Postiz API client — lightweight hand-rolled fetch (no SDK)
// Pattern follows lib/google-calendar.ts and lib/twitter.ts

const POSTIZ_API_URL = process.env.POSTIZ_API_URL || "https://app.postiz.com/api/v1";
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY || "";

// --- Types ---

export interface PostizIntegration {
  id: string;
  name: string;
  platform: string;
  picture?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

export type PostizPostState = "draft" | "scheduled" | "published" | "error";

export interface PostizPostEntry {
  integration: { id: string };
  value: { content: string; image?: { id: string; path: string }[] }[];
  settings: Record<string, unknown> & { __type: string };
}

export interface PostizCreatePostRequest {
  type: "draft" | "schedule" | "now";
  date?: string; // ISO 8601 for schedule
  shortLink?: boolean;
  tags?: string[];
  posts: PostizPostEntry[];
}

export interface PostizPost {
  id: string;
  state: PostizPostState;
  date?: string;
  posts: PostizPostEntry[];
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

// --- Fetch helper ---

async function postizFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${POSTIZ_API_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: POSTIZ_API_KEY,
    ...(options.headers as Record<string, string> | undefined),
  };

  // Only set Content-Type for requests with a body
  if (options.body) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Postiz API error ${res.status}: ${body || res.statusText}`);
  }

  // Some endpoints (DELETE) may return 204 with no body
  if (res.status === 204) return undefined as T;

  // Guard against non-JSON success responses (e.g. reverse proxy HTML error pages)
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Postiz API returned non-JSON response (${contentType || "no content-type"}): ${text.slice(0, 200)}`
    );
  }

  return res.json() as Promise<T>;
}

// --- API endpoints ---

export async function getIntegrations(): Promise<PostizIntegration[]> {
  return postizFetch<PostizIntegration[]>("/integrations");
}

export async function createPost(
  request: PostizCreatePostRequest
): Promise<PostizPost> {
  return postizFetch<PostizPost>("/posts", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function getPosts(
  startDate?: string,
  endDate?: string
): Promise<PostizPost[]> {
  const params = new URLSearchParams();
  if (startDate) params.set("startDate", startDate);
  if (endDate) params.set("endDate", endDate);
  const query = params.toString();
  return postizFetch<PostizPost[]>(`/posts${query ? `?${query}` : ""}`);
}

export async function deletePost(postId: string): Promise<void> {
  return postizFetch<void>(`/posts/${postId}`, { method: "DELETE" });
}

export async function uploadMedia(
  file: Buffer | Blob,
  filename: string
): Promise<{ id: string; path: string }> {
  const formData = new FormData();
  const blob = file instanceof Blob ? file : new Blob([new Uint8Array(file)]);
  formData.append("file", blob, filename);

  const url = `${POSTIZ_API_URL}/upload`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: POSTIZ_API_KEY,
      // Do NOT set Content-Type — let fetch set multipart/form-data with boundary
    },
    body: formData,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Postiz upload error ${res.status}: ${body || res.statusText}`);
  }

  const uploadContentType = res.headers.get("content-type") || "";
  if (!uploadContentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Postiz upload returned non-JSON response (${uploadContentType || "no content-type"}): ${text.slice(0, 200)}`
    );
  }

  return res.json() as Promise<{ id: string; path: string }>;
}

export async function findSlot(
  integrationId: string
): Promise<{ date: string; [key: string]: unknown }> {
  return postizFetch<{ date: string }>(`/find-slot/${integrationId}`);
}
