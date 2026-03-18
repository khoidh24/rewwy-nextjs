import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/auth";

const backendUrl = process.env.BACKEND_URL ?? "";
const backendApiKey = process.env.BACKEND_X_API_KEY ?? "";

const parseBackendResponse = async (response: Response) => {
  const rawBody = await response.text();
  try {
    return JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return {
      message: response.ok
        ? "Conversation fetched"
        : `Request failed with status ${response.status}`,
    };
  }
};

const resolveAccessToken = async (request: NextRequest) => {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const headerToken = authHeader.slice("Bearer ".length).trim();
    if (headerToken) return headerToken;
  }

  const session = await getServerSession(authOptions);
  if (session?.accessToken) return session.accessToken;

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });
  return token && typeof token.accessToken === "string"
    ? token.accessToken
    : null;
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    void request;

    if (!backendUrl || !backendApiKey) {
      return NextResponse.json(
        { message: "Backend configuration is missing" },
        { status: 500 },
      );
    }

    const accessToken = await resolveAccessToken(request);

    if (!accessToken) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const response = await fetch(`${backendUrl}/v1/api/conversations/${id}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-rewwy-api-key": backendApiKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = await parseBackendResponse(response);
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Cannot fetch conversation detail" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    if (!backendUrl || !backendApiKey) {
      return NextResponse.json(
        { message: "Backend configuration is missing" },
        { status: 500 },
      );
    }

    const accessToken = await resolveAccessToken(request);

    if (!accessToken) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const response = await fetch(`${backendUrl}/v1/api/conversations/${id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "x-rewwy-api-key": backendApiKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const data = await parseBackendResponse(response);
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json(
      { message: "Cannot delete conversation" },
      { status: 500 },
    );
  }
}
