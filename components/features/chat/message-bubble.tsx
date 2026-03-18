"use client";

import { Pencil } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type BubbleAttachment = {
  id: string;
  url: string;
  name: string;
  kind?: "image" | "document";
  contentType?: string;
};

type MessageBubbleProps = {
  id: string;
  sender: "user" | "assistant";
  content: string;
  attachments?: BubbleAttachment[];
  canEdit?: boolean;
  onEditResend?: (id: string, editedContent: string) => void;
};

export default function MessageBubble({
  id,
  sender,
  content,
  attachments = [],
  canEdit = false,
  onEditResend,
}: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const isTypingPlaceholder =
    sender === "assistant" && content.trim().length === 0;

  const submitEdit = () => {
    const editedText = draft.trim();
    if (!editedText || !onEditResend) return;
    onEditResend(id, editedText);
    setIsEditing(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(content);
      setIsEditing(false);
    }
  };

  const isImageAttachment = (attachment: BubbleAttachment) =>
    attachment.kind === "image" ||
    attachment.contentType?.toLowerCase().startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.name);

  return (
    <div
      className={`group relative w-fit max-w-[85%] ${sender === "user" ? "ml-auto" : ""}`}
    >
      {sender === "user" && canEdit && onEditResend && !isEditing && (
        <button
          type="button"
          aria-label="Edit message"
          onClick={() => {
            setDraft(content);
            setIsEditing(true);
          }}
          className="bg-background/90 text-muted-foreground hover:text-foreground absolute -left-8 top-1 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      )}

      <div
        className={`rounded-2xl px-3 py-2 text-sm ${
          sender === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {isTypingPlaceholder ? (
          <p className="text-muted-foreground animate-pulse">...</p>
        ) : sender === "assistant" ? (
          <div className="space-y-2 [&_a]:underline [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-black/10 [&_pre]:p-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : isEditing ? (
          <textarea
            autoFocus
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            className="field-sizing-content min-h-10 w-[min(520px,70vw)] resize-none whitespace-pre-wrap rounded-md border-0 bg-transparent px-2 py-1 text-sm shadow-none outline-none"
          />
        ) : (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap">{content}</p>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={attachment.url}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-primary-foreground/10 border-primary-foreground/20 hover:bg-primary-foreground/15 relative h-16 w-16 overflow-hidden rounded-md border"
                  >
                    {isImageAttachment(attachment) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={attachment.url}
                        alt={attachment.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-medium">
                        DOC
                      </div>
                    )}
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {sender === "user" && isEditing && (
        <p className="text-muted-foreground mt-1 text-[11px]">
          Enter to resend, Shift+Enter for newline, Esc to cancel
        </p>
      )}
    </div>
  );
}
