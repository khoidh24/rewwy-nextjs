import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";

const decodeUserIdFromJwt = (token: string): string | null => {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return null;
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { userId?: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
};

type AuthorizedUser = {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
};

const getJwtExpirationMs = (token: string): number | null => {
  try {
    const payloadBase64 = token.split(".")[1];
    if (!payloadBase64) return null;
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { exp?: number };
    if (!payload.exp || typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
};

const isAccessTokenStale = (accessToken: string) => {
  const expirationMs = getJwtExpirationMs(accessToken);
  if (!expirationMs) return true;
  const now = Date.now();
  const refreshWindowMs = 60_000; // refresh 1 minute before expiration
  return expirationMs - now <= refreshWindowMs;
};

const refreshAccessToken = async (refreshToken: string) => {
  const response = await fetch(`${backendUrl}/v1/api/refresh-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-rewwy-api-key": backendApiKey ?? "",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    metadata?: { accessToken?: string; refreshToken?: string };
  };
  const nextAccessToken = data.metadata?.accessToken;
  const nextRefreshToken = data.metadata?.refreshToken;
  if (!nextAccessToken || !nextRefreshToken) {
    return null;
  }

  return {
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
  };
};

const isAuthorizedUser = (
  user: unknown,
): user is AuthorizedUser => {
  if (!user || typeof user !== "object") return false;

  const candidate = user as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.email === "string" &&
    typeof candidate.accessToken === "string" &&
    typeof candidate.refreshToken === "string"
  );
};

const backendUrl = process.env.BACKEND_URL;
const backendApiKey = process.env.BACKEND_X_API_KEY;

if (!backendUrl) {
  throw new Error("Missing BACKEND_URL environment variable");
}

if (!backendApiKey) {
  throw new Error("Missing BACKEND_X_API_KEY environment variable");
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const response = await fetch(`${backendUrl}/v1/api/login`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rewwy-api-key": backendApiKey,
          },
          body: JSON.stringify({ email, password }),
        });

        if (!response.ok) return null;

        const data = (await response.json()) as {
          metadata?: { accessToken?: string; refreshToken?: string };
        };

        const accessToken = data.metadata?.accessToken;
        const refreshToken = data.metadata?.refreshToken;
        if (!accessToken || !refreshToken) return null;

        const userId = decodeUserIdFromJwt(accessToken);
        if (!userId) return null;

        return {
          id: userId,
          email,
          accessToken,
          refreshToken,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    jwt: async ({ token, user }) => {
      if (isAuthorizedUser(user)) {
        token.userId = user.id;
        token.email = user.email;
        token.accessToken = user.accessToken;
        token.refreshToken = user.refreshToken;
        return token;
      }

      const accessToken = token.accessToken;
      const refreshToken = token.refreshToken;
      if (
        typeof accessToken !== "string" ||
        typeof refreshToken !== "string" ||
        !accessToken ||
        !refreshToken
      ) {
        return token;
      }

      if (!isAccessTokenStale(accessToken)) {
        return token;
      }

      const refreshed = await refreshAccessToken(refreshToken);
      if (refreshed) {
        token.accessToken = refreshed.accessToken;
        token.refreshToken = refreshed.refreshToken;
      }
      return token;
    },
    session: async ({ session, token }) => {
      session.user.id = token.userId as string;
      session.user.email = token.email as string;
      session.accessToken = token.accessToken as string;
      session.refreshToken = token.refreshToken as string;
      return session;
    },
  },
};

const nextAuthHandler = NextAuth(authOptions);
export { nextAuthHandler as GET, nextAuthHandler as POST };
