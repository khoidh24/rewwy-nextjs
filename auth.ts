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
  if (!backendUrl || !backendApiKey) {
    return null;
  }

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

const loginWithRetry = async (
  email: string,
  password: string,
  shouldRetry: boolean,
) => {
  const maxAttempts = shouldRetry ? 6 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${backendUrl}/v1/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rewwy-api-key": backendApiKey ?? "",
        },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = (await response.json()) as {
          metadata?: { accessToken?: string; refreshToken?: string };
        };
        return {
          accessToken: data.metadata?.accessToken ?? null,
          refreshToken: data.metadata?.refreshToken ?? null,
        };
      }
    } catch {
      // Keep retrying for transient network/serverless startup issues.
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return { accessToken: null, refreshToken: null };
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

const backendUrl = process.env.BACKEND_URL ?? "";
const backendApiKey = process.env.BACKEND_X_API_KEY ?? "";
const nextAuthSecret = process.env.NEXTAUTH_SECRET;
const nextAuthUrl = process.env.NEXTAUTH_URL;

if (process.env.NODE_ENV === "production" && !nextAuthSecret) {
  throw new Error("Missing NEXTAUTH_SECRET environment variable");
}

if (process.env.NODE_ENV === "production" && !nextAuthUrl) {
  throw new Error("Missing NEXTAUTH_URL environment variable");
}

export const authOptions: NextAuthOptions = {
  secret: nextAuthSecret,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const rawCredentials = credentials as
          | Record<string, string | undefined>
          | undefined;
        const email = rawCredentials?.email;
        const password = rawCredentials?.password;
        const autoFromSignup = rawCredentials?.autoFromSignup === "1";

        if (!email || !password) return null;

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPassword = password.trim();
        if (!backendUrl || !backendApiKey) {
          return null;
        }
        const { accessToken, refreshToken } = await loginWithRetry(
          normalizedEmail,
          normalizedPassword,
          autoFromSignup,
        );
        if (!accessToken || !refreshToken) return null;

        const userId = decodeUserIdFromJwt(accessToken);
        if (!userId) return null;

        return {
          id: userId,
          email: normalizedEmail,
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
