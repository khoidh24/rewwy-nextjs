import { put } from "@vercel/blob";
import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { authOptions } from "@/auth";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const ALLOWED_DOCUMENT_EXTENSIONS = new Set(["pdf", "doc", "docx", "txt", "md"]);

const getFileExtension = (fileName: string) =>
  fileName.split(".").pop()?.toLowerCase() ?? "";

const resolveFileKind = (file: File): "image" | "document" | null => {
  const mimeType = file.type.toLowerCase();
  const extension = getFileExtension(file.name);

  if (
    ALLOWED_IMAGE_MIME_TYPES.has(mimeType) ||
    ALLOWED_IMAGE_EXTENSIONS.has(extension)
  ) {
    return "image";
  }

  if (
    ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType) ||
    ALLOWED_DOCUMENT_EXTENSIONS.has(extension)
  ) {
    return "document";
  }

  return null;
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

export async function POST(request: NextRequest) {
  try {
    const accessToken = await resolveAccessToken(request);
    if (!accessToken) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { message: "Missing BLOB_READ_WRITE_TOKEN" },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const rawFile = formData.get("file");
    if (!(rawFile instanceof File)) {
      return NextResponse.json({ message: "File is required" }, { status: 400 });
    }

    if (rawFile.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { message: "File is too large (max 10MB)" },
        { status: 400 },
      );
    }

    const fileKind = resolveFileKind(rawFile);
    if (!fileKind) {
      return NextResponse.json(
        {
          message:
            "Only image or document files are supported (jpg, png, webp, gif, pdf, doc, docx, txt, md).",
        },
        { status: 400 },
      );
    }

    const resolvedAccess =
      process.env.BLOB_STORE_ACCESS === "public" ? "public" : "private";

    const blob = await put(rawFile.name, rawFile, {
      access: resolvedAccess,
      addRandomSuffix: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      contentType: rawFile.type || undefined,
    });

    return NextResponse.json({
      message: "File uploaded",
      metadata: {
        url: blob.url,
        downloadUrl: blob.downloadUrl,
        name: rawFile.name,
        contentType: rawFile.type || undefined,
        kind: fileKind,
        size: rawFile.size,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
