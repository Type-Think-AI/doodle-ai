import type { APIContext } from "astro";

export const prerender = false;

export async function POST(context: APIContext) {
  try {
    const body = await context.request.json();
    const { apiKey, prompt, imageUrl, mode, aspectRatio } = body as {
      apiKey: string;
      prompt: string;
      imageUrl?: string;
      mode: "generate" | "edit";
      aspectRatio?: string;
    };

    if (!apiKey || !prompt) {
      return json({ error: "API key and prompt are required" }, 400);
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    let url: string;
    let payload: Record<string, unknown>;

    if (mode === "edit" && imageUrl) {
      url = "https://api.picxstudio.com/v1/images/edit";
      payload = {
        model: "openai/gpt-image-2",
        instruction: prompt,
        image_urls: [imageUrl],
        size: "1K",
        aspect_ratio: aspectRatio || "1:1",
      };
    } else {
      url = "https://api.picxstudio.com/v1/images/generate";
      payload = {
        prompt,
        size: "1K",
        aspect_ratio: aspectRatio || "1:1",
      };
    }

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      const message =
        (errorData as { detail?: string }).detail ||
        (errorData as { message?: string }).message ||
        `API error: ${res.status}`;
      return json({ error: message }, res.status);
    }

    const data = await res.json();
    return json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: `Server error: ${message}` }, 500);
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
