const apiUrl = process.env.SUBSCRIPTION_API_URL;
const apiKey = process.env.SUBSCRIPTION_API_KEY;

function configurationError(name: string) {
  throw new Response(`Missing server environment variable: ${name}`, {
    status: 500,
    statusText: "App configuration error",
  });
}

export async function backendRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!apiUrl) configurationError("SUBSCRIPTION_API_URL");
  if (!apiKey) configurationError("SUBSCRIPTION_API_KEY");

  const response = await fetch(new URL(path, apiUrl), {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Dashboard-Key": apiKey!,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error || `Subscription API returned ${response.status}`;
    throw new Response(message, { status: response.status });
  }

  return response.json() as Promise<T>;
}

export async function backendTextRequest(
  path: string,
  init: RequestInit = {},
): Promise<{ body: string; headers: Headers }> {
  if (!apiUrl) configurationError("SUBSCRIPTION_API_URL");
  if (!apiKey) configurationError("SUBSCRIPTION_API_KEY");

  const response = await fetch(new URL(path, apiUrl), {
    ...init,
    headers: {
      Accept: "text/csv",
      "X-Dashboard-Key": apiKey!,
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error || `Subscription API returned ${response.status}`;
    throw new Response(message, { status: response.status });
  }

  return { body: await response.text(), headers: response.headers };
}
