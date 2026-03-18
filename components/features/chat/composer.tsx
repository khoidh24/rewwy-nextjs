"use client";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, Paperclip, SendHorizontal, X } from "lucide-react";
import { useRef, type FormEvent, type KeyboardEvent } from "react";

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

type ComposerProps = {
  value: string;
  disabled: boolean;
  isStreamingReply: boolean;
  attachments: UploadedAttachment[];
  isUploadingAttachment: boolean;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUploadFiles: (files: File[]) => Promise<void>;
  onRemoveAttachment: (id: string) => void;
};

export default function Composer({
  value,
  disabled,
  isStreamingReply,
  attachments,
  isUploadingAttachment,
  onChange,
  onSubmit,
  onUploadFiles,
  onRemoveAttachment,
}: ComposerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const acceptedFileTypes =
    ".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.txt,.md,image/jpeg,image/png,image/webp,image/gif,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

  const isImageAttachment = (attachment: UploadedAttachment) =>
    attachment.kind === "image" ||
    attachment.contentType?.toLowerCase().startsWith("image/") ||
    /\.(jpg|jpeg|png|webp|gif)$/i.test(attachment.name);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter submits; Shift+Enter inserts newline.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  const handlePickFile = () => {
    if (disabled || isUploadingAttachment) return;
    fileInputRef.current?.click();
  };

  return (
    <div className="bg-background shrink-0 border-t p-3 sm:p-4">
      <div className="mx-auto w-full max-w-3xl space-y-2 rounded-2xl border p-2">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-2 pt-1">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="bg-muted relative h-20 w-20 overflow-hidden rounded-lg border"
              >
                {isImageAttachment(attachment) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attachment.previewUrl ?? attachment.url}
                    alt={attachment.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="text-muted-foreground flex h-full w-full items-center justify-center">
                    <FileText className="size-8" />
                  </div>
                )}
                <button
                  type="button"
                  className="bg-background/90 text-muted-foreground hover:text-foreground absolute top-1 right-1 z-20 rounded-full p-0.5"
                  onClick={() => onRemoveAttachment(attachment.id)}
                  disabled={disabled}
                >
                  <X className="size-3" />
                </button>
                {attachment.status !== "ready" && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/45 text-[10px] font-medium text-white">
                    {attachment.status === "uploading" ? "Uploading..." : "Failed"}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/55 px-1 py-0.5 text-[10px] text-white">
                  {attachment.name}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Summarize the latest updates..."
            rows={1}
            className="field-sizing-content max-h-40 min-h-10 w-full resize-none rounded-md border-0 bg-transparent px-2.5 py-2 text-sm shadow-none outline-none focus-visible:ring-0"
            disabled={disabled}
          />
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={acceptedFileTypes}
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files ?? []);
              if (selectedFiles.length === 0) return;
              void onUploadFiles(selectedFiles);
              event.currentTarget.value = "";
            }}
          />
          <Button
            type="submit"
            size="icon-sm"
            variant="ghost"
            aria-label="Send message"
            disabled={disabled || isUploadingAttachment}
          >
            <SendHorizontal className="size-4" />
          </Button>
        </form>
        <Separator />
        <div className="text-muted-foreground flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1"
              onClick={handlePickFile}
              disabled={disabled}
            >
              <Paperclip className="size-3.5" />
              {isUploadingAttachment
                ? "Uploading..."
                : isStreamingReply
                  ? "Streaming..."
                  : "Attach"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
