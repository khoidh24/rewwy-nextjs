import { NextResponse } from "next/server";

const backendUrl = process.env.BACKEND_URL ?? "";
const backendApiKey = process.env.BACKEND_X_API_KEY ?? "";

if (!backendUrl) {
  throw new Error("Missing BACKEND_URL environment variable");
}

if (!backendApiKey) {
  throw new Error("Missing BACKEND_X_API_KEY environment variable");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      displayName?: string;
    };

    const response = await fetch(`${backendUrl}/v1/api/signup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rewwy-api-key": backendApiKey,
      },
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      }),
    });

    const rawBody = await response.text();
    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      parsedBody = null;
    }

    const message =
      (typeof parsedBody?.message === "string" && parsedBody.message) ||
      (typeof parsedBody?.error === "string" && parsedBody.error) ||
      (response.ok ? "Signup successful" : `Signup failed (${response.status})`);

    const payload = parsedBody ?? { message };
    return NextResponse.json(payload, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Cannot reach signup service" },
      { status: 500 },
    );
  }
}
