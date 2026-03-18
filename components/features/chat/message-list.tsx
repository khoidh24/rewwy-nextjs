"use client";

import MessageBubble from "@/components/features/chat/message-bubble";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";

type ConversationMessage = {
  id: string;
  sender: "user" | "assistant";
  content: string;
  attachments?: Array<{
    id: string;
    url: string;
    name: string;
    kind?: "image" | "document";
    contentType?: string;
  }>;
};

type MessageListProps = {
  messages: ConversationMessage[];
  isStreamingReply?: boolean;
  canEditMessages?: boolean;
  onEditResend?: (messageId: string, editedContent: string) => void;
};

export default function MessageList({
  messages,
  isStreamingReply = false,
  canEditMessages = false,
  onEditResend,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 96,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 8,
  });

  const updateAutoScrollFlag = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distanceToBottom =
      element.scrollHeight - (element.scrollTop + element.clientHeight);
    shouldAutoScrollRef.current = distanceToBottom < 120;
  };

  const lastMessageSignature = useMemo(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return "";
    return `${lastMessage.id}:${lastMessage.content.length}`;
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;
    if (!shouldAutoScrollRef.current) return;
    rowVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [messages.length, rowVirtualizer]);

  useEffect(() => {
    if (!isStreamingReply || messages.length === 0) return;
    if (!shouldAutoScrollRef.current) return;
    rowVirtualizer.scrollToIndex(messages.length - 1, { align: "end" });
  }, [isStreamingReply, lastMessageSignature, messages.length, rowVirtualizer]);

  if (messages.length === 0) {
    return (
      <p className="text-muted-foreground pt-8 text-center text-sm">
        This conversation has no messages yet.
      </p>
    );
  }

  const virtualItems = rowVirtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      onScroll={updateAutoScrollFlag}
      className="h-[calc(100vh-13rem)] overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div
        className="relative w-full"
        style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
      >
        {virtualItems.map((virtualRow) => {
          const message = messages[virtualRow.index];
          if (!message) return null;

          return (
            <div
              key={message.id}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute top-0 left-0 w-full pb-3"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <MessageBubble
                id={message.id}
                sender={message.sender}
                content={message.content}
                attachments={message.attachments}
                canEdit={canEditMessages && message.sender === "user"}
                onEditResend={onEditResend}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
