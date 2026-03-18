import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { authOptions } from "@/auth";

const backendUrl = process.env.BACKEND_URL ?? "";
const backendApiKey = process.env.BACKEND_X_API_KEY ?? "";

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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; messageId: string }> },
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

    const body = (await request.json()) as { text?: string };
    const { id, messageId } = await context.params;

    const response = await fetch(
      `${backendUrl}/v1/api/conversations/${id}/messages/${messageId}/resend`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rewwy-api-key": backendApiKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ text: body.text }),
        cache: "no-store",
      },
    );

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      return NextResponse.json(
        { message: errorText || "Failed to start resend stream" },
        { status: response.status || 500 },
      );
    }

    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "Cannot process resend stream" },
      { status: 500 },
    );
  }
}
