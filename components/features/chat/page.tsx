"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import ConversationSidebar from "@/components/features/chat/sidebar";
import ChatComposer from "@/components/features/chat/composer";
import ChatMessageList from "@/components/features/chat/message-list";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CircleHelp, LogOut, Menu, Settings } from "lucide-react";

type ConversationListItem = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

type ConversationMessage = {
  id: string;
  sender: "user" | "assistant";
  content: string;
  createdAt: string;
  attachments?: Array<{
    id: string;
    url: string;
    name: string;
    kind?: "image" | "document";
    contentType?: string;
  }>;
};

const ATTACHMENT_MARKER_REGEX =
  /\n\n\[\[rewwy_attachments:([A-Za-z0-9_-]+)\]\]\s*$/;

const decodeBase64Url = (input: string) => {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
};

const parseStoredMessage = (message: ConversationMessage): ConversationMessage => {
  const match = message.content.match(ATTACHMENT_MARKER_REGEX);
  if (!match) return message;

  try {
    const encoded = match[1];
    if (!encoded) return message;
    const jsonText = decodeBase64Url(encoded);
    const parsed = JSON.parse(jsonText) as Array<{
      url?: string;
      name?: string;
      kind?: "image" | "document";
      contentType?: string;
    }>;
    const attachments = Array.isArray(parsed)
      ? parsed
          .filter((item) => typeof item.url === "string" && item.url.length > 0)
          .map((item, index) => ({
            id: `stored-${message.id}-${index}`,
            url: item.url || "",
            name: item.name || `file-${index + 1}`,
            kind: item.kind,
            contentType: item.contentType,
          }))
      : [];

    return {
      ...message,
      content: message.content.replace(ATTACHMENT_MARKER_REGEX, "").trim(),
      attachments,
    };
  } catch {
    return {
      ...message,
      content: message.content.replace(ATTACHMENT_MARKER_REGEX, "").trim(),
    };
  }
};

type UploadedAttachment = {
  id: string;
  url: string;
  previewUrl?: string;
  name: string;
  contentType?: string;
  kind?: "image" | "document";
  size?: number;
  status: "uploading" | "ready" | "error";
};

type ConversationDetailResponse = {
  message?: string;
  metadata?: {
    id?: string;
    title?: string;
    messages?: ConversationMessage[];
  };
};

type ChatAppProps = {
  routeConversationId: string | null;
};

export default function ChatApp({ routeConversationId }: ChatAppProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(routeConversationId);
  const [dataError, setDataError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isStreamingReply, setIsStreamingReply] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<
    string | null
  >(null);
  const [streamingMessages, setStreamingMessages] = useState<
    ConversationMessage[] | null
  >(null);
  const preserveStreamingOnNextRouteChangeRef = useRef(false);

  const isAllowedAttachmentFile = (file: File) => {
    const mimeType = file.type.toLowerCase();
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowedImageMimes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ]);
    const allowedDocumentMimes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/markdown",
    ]);
    const allowedImageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
    const allowedDocumentExtensions = new Set(["pdf", "doc", "docx", "txt", "md"]);

    return (
      allowedImageMimes.has(mimeType) ||
      allowedDocumentMimes.has(mimeType) ||
      allowedImageExtensions.has(extension) ||
      allowedDocumentExtensions.has(extension)
    );
  };

  const requiresAuth = status !== "loading" && !session?.user?.id;
  const accessToken = session?.accessToken;

  const authHeaders = useMemo<Record<string, string>>(() => {
    const headers: Record<string, string> = {};
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }, [accessToken]);

  const conversationsQuery = useQuery({
    queryKey: ["conversations", accessToken],
    enabled: Boolean(session?.user?.id && accessToken),
    queryFn: async (): Promise<ConversationListItem[]> => {
      const response = await fetch("/api/conversations", {
        cache: "no-store",
        headers: authHeaders,
      });
      const data = (await response.json()) as {
        message?: string;
        metadata?: ConversationListItem[];
      };

      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load conversations");
      }
      return Array.isArray(data.metadata) ? data.metadata : [];
    },
  });

  const conversationDetailQuery = useQuery({
    queryKey: ["conversation", accessToken, selectedConversationId],
    enabled: Boolean(
      session?.user?.id && accessToken && selectedConversationId,
    ),
    queryFn: async (): Promise<{ messages: ConversationMessage[] }> => {
      const response = await fetch(
        `/api/conversations/${selectedConversationId}`,
        {
          cache: "no-store",
          headers: authHeaders,
        },
      );
      const data = (await response.json()) as ConversationDetailResponse;
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to load conversation");
      }
      const rawMessages = Array.isArray(data.metadata?.messages)
        ? data.metadata.messages
        : [];
      return {
        messages: rawMessages.map(parseStoredMessage),
      };
    },
  });

  const conversations = conversationsQuery.data ?? [];
  const messages =
    streamingMessages ?? conversationDetailQuery.data?.messages ?? [];

  useEffect(() => {
    setSelectedConversationId(routeConversationId);

    if (
      preserveStreamingOnNextRouteChangeRef.current ||
      (isStreamingReply && (streamingMessages?.length ?? 0) > 0)
    ) {
      preserveStreamingOnNextRouteChangeRef.current = false;
      setDataError(null);
      return;
    }

    setStreamingMessages(null);
    setAttachments([]);
    setDataError(null);
  }, [isStreamingReply, routeConversationId, streamingMessages]);

  const ensureConversationIdForMessage = async (
    titleSeed: string,
    preserveStreamingOnRouteChange = false,
    optimisticMessages?: ConversationMessage[],
  ) => {
    if (selectedConversationId) return selectedConversationId;

    const createResponse = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({
        title: titleSeed.slice(0, 40) || "New conversation",
      }),
    });
    const createData = (await createResponse.json()) as {
      message?: string;
      metadata?: ConversationListItem;
    };

    if (!createResponse.ok || !createData.metadata?.id) {
      throw new Error(createData.message ?? "Failed to create conversation");
    }

    const createdConversation = createData.metadata;
    queryClient.setQueryData<ConversationListItem[]>(
      ["conversations", accessToken],
      (prev) => [createdConversation, ...(prev ?? [])],
    );
    if (optimisticMessages && optimisticMessages.length > 0) {
      queryClient.setQueryData(
        ["conversation", accessToken, createdConversation.id],
        { messages: optimisticMessages },
      );
    }
    setSelectedConversationId(createdConversation.id);
    if (preserveStreamingOnRouteChange) {
      preserveStreamingOnNextRouteChangeRef.current = true;
    }
    router.push(`/${createdConversation.id}`);
    return createdConversation.id;
  };
  useEffect(() => {
    if (conversationsQuery.error instanceof Error) {
      setDataError(conversationsQuery.error.message);
      return;
    }
    if (conversationDetailQuery.error instanceof Error) {
      setDataError(conversationDetailQuery.error.message);
      return;
    }
    if (!conversationsQuery.error && !conversationDetailQuery.error) {
      setDataError(null);
    }
  }, [conversationsQuery.error, conversationDetailQuery.error]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setIsSubmitting(false);

    if (!result || result.error) {
      setLoginError("Invalid email or password");
      return;
    }

    setEmail("");
    setPassword("");
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    await signOut({ redirect: false });
    router.refresh();
    setIsSigningOut(false);
  };

  const handleSelectConversation = (conversationId: string) => {
    setSelectedConversationId(conversationId);
    setStreamingMessages(null);
    router.push(`/${conversationId}`);
  };

  // New button should do nothing on the "new conversation" screen.
  const handleGoToNewConversation = () => {
    if (!selectedConversationId) return;
    setSelectedConversationId(null);
    setStreamingMessages(null);
    setDataError(null);
    router.push("/");
  };

  const handleDeleteConversation = async (conversationId: string) => {
    if (!session?.user?.id || deletingConversationId) return;

    setDeletingConversationId(conversationId);
    setDataError(null);
    try {
      const response = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        throw new Error(data.message ?? "Failed to delete conversation");
      }

      const filtered = conversations.filter(
        (item) => item.id !== conversationId,
      );
      queryClient.setQueryData(["conversations", accessToken], filtered);
      queryClient.removeQueries({
        queryKey: ["conversation", accessToken, conversationId],
      });
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null);
        setStreamingMessages(null);
        router.push("/");
      }
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "Failed to delete conversation",
      );
    } finally {
      setDeletingConversationId(null);
    }
  };

  const consumeChatSse = async (
    response: Response,
    assistantMessageId: string,
    initialMessages: ConversationMessage[],
  ) => {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No stream body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let doneReceived = false;
    let nextMessages = [...initialMessages];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const rawEvent of events) {
        const lines = rawEvent
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
        const eventType =
          lines
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim() ?? "message";
        const dataLine = lines.find((line) => line.startsWith("data:"));
        const rawData = dataLine?.slice(5).trim() ?? "{}";

        let payload: { chunk?: string; reply?: string; message?: string } = {};
        try {
          payload = JSON.parse(rawData) as {
            chunk?: string;
            reply?: string;
            message?: string;
          };
        } catch {
          payload = {};
        }

        if (eventType === "chunk" && payload.chunk) {
          nextMessages = nextMessages.map((message) =>
            message.id === assistantMessageId
              ? { ...message, content: message.content + payload.chunk }
              : message,
          );
          setStreamingMessages([...nextMessages]);
        }

        if (eventType === "done") {
          doneReceived = true;
          if (payload.reply) {
            nextMessages = nextMessages.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: payload.reply ?? message.content }
                : message,
            );
            setStreamingMessages([...nextMessages]);
          }
        }

        if (eventType === "error") {
          throw new Error(payload.message ?? "Streaming error");
        }
      }
    }

    if (!doneReceived) {
      throw new Error("Stream ended unexpectedly");
    }

    return nextMessages;
  };

  const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session?.user?.id || isStreamingReply) return;

    const text = composerText.trim();
    const readyAttachments = attachments.filter(
      (attachment) => attachment.status === "ready" && Boolean(attachment.url),
    );
    if (!text && readyAttachments.length === 0) return;

    const selectedAttachments = [...readyAttachments];
    const fallbackAttachmentLabel = selectedAttachments[0]?.name
      ? `Analyze file: ${selectedAttachments[0].name}`
      : "Analyze uploaded file";
    const userVisibleContent = text || fallbackAttachmentLabel;

    const nowIso = new Date().toISOString();
    const currentMessages = [...messages];
    const userMessage: ConversationMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      content: userVisibleContent,
      createdAt: nowIso,
      attachments: selectedAttachments.map((attachment) => ({
        id: attachment.id,
        url: attachment.url,
        name: attachment.name,
        kind: attachment.kind,
        contentType: attachment.contentType,
      })),
    };
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantPlaceholder: ConversationMessage = {
      id: assistantMessageId,
      sender: "assistant",
      content: "",
      createdAt: nowIso,
    };

    setComposerText("");
    setAttachments([]);
    setDataError(null);
    let nextMessages = [...currentMessages, userMessage, assistantPlaceholder];
    setStreamingMessages(nextMessages);
    setIsStreamingReply(true);

    try {
      const conversationId = await ensureConversationIdForMessage(
        text || selectedAttachments[0]?.name || "New conversation",
        true,
        nextMessages,
      );

      const response = await fetch(
        `/api/conversations/${conversationId}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            text,
            attachments: selectedAttachments.map((attachment) => ({
              url: attachment.url,
              name: attachment.name,
              contentType: attachment.contentType,
              kind: attachment.kind,
            })),
          }),
        },
      );

      if (!response.ok || !response.body) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(errorBody.message ?? "Failed to start chat stream");
      }
      nextMessages = await consumeChatSse(
        response,
        assistantMessageId,
        nextMessages,
      );

      queryClient.setQueryData(["conversation", accessToken, conversationId], {
        messages: nextMessages,
      });
      setStreamingMessages(null);
      await queryClient.invalidateQueries({
        queryKey: ["conversations", accessToken],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send message";
      setDataError(message);
      setAttachments(selectedAttachments);
      setStreamingMessages(currentMessages);
    } finally {
      setIsStreamingReply(false);
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!session?.user?.id || isStreamingReply || files.length === 0) return;

    const validFiles = files.filter((file) => isAllowedAttachmentFile(file));
    if (validFiles.length !== files.length) {
      setDataError(
        "Some files were skipped. Only image/document files are supported (jpg, png, webp, gif, pdf, doc, docx, txt, md).",
      );
    } else {
      setDataError(null);
    }

    for (const file of validFiles) {
      const fileId = `attachment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const localUrl = URL.createObjectURL(file);
      const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
      const localKind: "image" | "document" =
        file.type.startsWith("image/") ||
        ["jpg", "jpeg", "png", "webp", "gif"].includes(extension)
          ? "image"
          : "document";

      setAttachments((prev) => [
        ...prev,
        {
          id: fileId,
          url: "",
          previewUrl: localUrl,
          name: file.name,
          contentType: file.type || undefined,
          kind: localKind,
          size: file.size,
          status: "uploading",
        },
      ]);

      await uploadSingleAttachment(file, fileId);
    }
  };

  const uploadSingleAttachment = async (file: File, fileId: string) => {
    if (!session?.user?.id || isStreamingReply) return;
    setIsUploadingAttachment(true);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/files/upload", {
        method: "POST",
        headers: authHeaders,
        body: formData,
      });
      const data = (await response.json()) as {
        message?: string;
        metadata?: {
          url: string;
          downloadUrl?: string;
          name: string;
          contentType?: string;
          kind?: "image" | "document";
          size?: number;
        };
      };

      if (!response.ok || !data.metadata?.url) {
        throw new Error(data.message ?? "File upload failed");
      }

      setAttachments((prev) =>
        prev.map((attachment) => {
          if (attachment.id !== fileId) return attachment;
          return {
            id: fileId,
            url: data.metadata?.downloadUrl ?? data.metadata?.url ?? "",
            previewUrl: attachment.previewUrl ?? attachment.url,
            name: data.metadata?.name ?? attachment.name,
            contentType: data.metadata?.contentType,
            kind: data.metadata?.kind,
            size: data.metadata?.size,
            status: "ready",
          };
        }),
      );
    } catch (error) {
      setAttachments((prev) =>
        prev.map((attachment) =>
          attachment.id === fileId
            ? { ...attachment, status: "error" }
            : attachment,
        ),
      );
      setDataError(error instanceof Error ? error.message : "File upload failed");
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    if (isStreamingReply) return;
    setAttachments((prev) => {
      const target = prev.find((attachment) => attachment.id === id);
      if (target?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      } else if (target?.url.startsWith("blob:")) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((attachment) => attachment.id !== id);
    });
  };

  const handleEditAndResend = async (messageId: string, editedText: string) => {
    if (!session?.user?.id || !selectedConversationId || isStreamingReply)
      return;

    const nextEditedText = editedText.trim();
    if (!nextEditedText) {
      setDataError("Message cannot be empty");
      return;
    }

    const currentMessages = [...messages];
    const targetIndex = currentMessages.findIndex(
      (message) => message.id === messageId && message.sender === "user",
    );

    if (targetIndex < 0) {
      setDataError("Cannot find this message anymore");
      return;
    }

    const nowIso = new Date().toISOString();
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantPlaceholder: ConversationMessage = {
      id: assistantMessageId,
      sender: "assistant",
      content: "",
      createdAt: nowIso,
    };

    let nextMessages = [
      ...currentMessages
        .slice(0, targetIndex + 1)
        .map((message) =>
          message.id === messageId
            ? { ...message, content: nextEditedText }
            : message,
        ),
      assistantPlaceholder,
    ];

    setDataError(null);
    setStreamingMessages(nextMessages);
    setIsStreamingReply(true);

    try {
      const response = await fetch(
        `/api/conversations/${selectedConversationId}/messages/${messageId}/resend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({ text: nextEditedText }),
        },
      );

      if (!response.ok || !response.body) {
        const errorBody = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(errorBody.message ?? "Failed to start resend stream");
      }

      nextMessages = await consumeChatSse(
        response,
        assistantMessageId,
        nextMessages,
      );

      queryClient.setQueryData(
        ["conversation", accessToken, selectedConversationId],
        { messages: nextMessages },
      );
      setStreamingMessages(null);
      await queryClient.invalidateQueries({
        queryKey: ["conversations", accessToken],
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to resend message";
      setDataError(message);
      setStreamingMessages(currentMessages);
    } finally {
      setIsStreamingReply(false);
    }
  };

  return (
    <div className="bg-background h-screen w-screen overflow-hidden">
      <div className="flex h-full">
        <aside className="hidden w-[230px] border-r lg:block">
          <ConversationSidebar
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            isCreatingConversation={false}
            deletingConversationId={deletingConversationId}
            isOnNewConversationScreen={!selectedConversationId}
            onSelectConversation={handleSelectConversation}
            onCreateConversation={handleGoToNewConversation}
            onDeleteConversation={handleDeleteConversation}
            userEmail={session?.user?.email}
          />
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-14 items-center justify-between border-b px-3 sm:px-4">
            <div className="flex items-center gap-2">
              <Sheet>
                <SheetTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="lg:hidden"
                    />
                  }
                >
                  <Menu className="size-4" />
                </SheetTrigger>
                <SheetContent side="left" className="w-[230px] p-0">
                  <ConversationSidebar
                    conversations={conversations}
                    selectedConversationId={selectedConversationId}
                    isCreatingConversation={false}
                    deletingConversationId={deletingConversationId}
                    isOnNewConversationScreen={!selectedConversationId}
                    onSelectConversation={handleSelectConversation}
                    onCreateConversation={handleGoToNewConversation}
                    onDeleteConversation={handleDeleteConversation}
                    userEmail={session?.user?.email}
                  />
                </SheetContent>
              </Sheet>
              <p className="text-sm font-semibold">
                {conversations.find(
                  (item) => item.id === selectedConversationId,
                )?.title ?? "New conversation"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm">
                <CircleHelp className="size-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                    />
                  }
                >
                  <Avatar className="size-7">
                    <AvatarImage src="/avatar.png" alt="User avatar" />
                    <AvatarFallback>
                      {(
                        session?.user?.email?.slice(0, 2) || "GU"
                      ).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <Settings className="mr-2 size-4" />
                    Account settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={(event) => {
                      event.preventDefault();
                      void handleSignOut();
                    }}
                    onClick={() => {
                      void handleSignOut();
                    }}
                  >
                    <LogOut className="mr-2 size-4" />
                    {isSigningOut ? "Signing out..." : "Sign out"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-4 pt-6 sm:px-8">
              <div className="mx-auto max-w-3xl space-y-6">
                {dataError && (
                  <p className="text-destructive rounded-xl border border-dashed p-3 text-sm">
                    {dataError}
                  </p>
                )}

                {conversationsQuery.isLoading ||
                conversationDetailQuery.isLoading ? (
                  <p className="text-muted-foreground pt-8 text-center text-sm">
                    Loading conversation data...
                  </p>
                ) : selectedConversationId || messages.length > 0 ? (
                  <ChatMessageList
                    messages={messages}
                    isStreamingReply={isStreamingReply}
                    canEditMessages={!requiresAuth && !isStreamingReply}
                    onEditResend={handleEditAndResend}
                  />
                ) : (
                  <div className="space-y-2 pt-8 text-center sm:pt-12">
                    <h1 className="text-4xl font-semibold tracking-tight text-[#0d1025]">
                      Welcome to Rewwy
                    </h1>
                    <p className="text-muted-foreground text-sm">
                      Start by typing a message. A conversation route will be
                      created automatically on first send.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <ChatComposer
              value={composerText}
              disabled={requiresAuth || isStreamingReply}
              isStreamingReply={isStreamingReply}
              attachments={attachments}
              isUploadingAttachment={isUploadingAttachment}
              onChange={setComposerText}
              onSubmit={handleSendMessage}
              onUploadFiles={handleUploadFiles}
              onRemoveAttachment={handleRemoveAttachment}
            />
          </div>
        </section>
      </div>

      {requiresAuth && (
        <div className="bg-background/70 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-card w-full max-w-md space-y-5 rounded-2xl border p-6 shadow-lg">
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">Login to continue</h2>
              <p className="text-muted-foreground text-sm">
                Please sign in to use the AI chat app.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="modal-email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="modal-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="modal-password" className="text-sm font-medium">
                  Password
                </label>
                <input
                  id="modal-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border px-3 py-2 text-sm"
                  required
                />
              </div>

              {loginError && (
                <p className="text-destructive text-sm">{loginError}</p>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>

            <p className="text-muted-foreground text-sm">
              Do not have an account?{" "}
              <Link
                href="/signup"
                className="text-foreground font-medium underline"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
