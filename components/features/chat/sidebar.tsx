"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import ConversationItem from "@/components/features/chat/conversation-item";
import { PanelLeft, Plus, Search, Sparkles } from "lucide-react";

type ConversationListItemType = {
  id: string;
  title: string;
  updatedAt: string;
};

type SidebarProps = {
  conversations: ConversationListItemType[];
  selectedConversationId: string | null;
  isCreatingConversation: boolean;
  deletingConversationId: string | null;
  isOnNewConversationScreen: boolean;
  onSelectConversation: (id: string) => void;
  onCreateConversation: () => void;
  onDeleteConversation: (id: string) => void;
  userEmail?: string | null;
};

export default function Sidebar({
  conversations,
  selectedConversationId,
  isCreatingConversation,
  deletingConversationId,
  isOnNewConversationScreen,
  onSelectConversation,
  onCreateConversation,
  onDeleteConversation,
  userEmail,
}: SidebarProps) {
  const email = userEmail ?? "guest@example.com";

  return (
    <div className="bg-background flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-full border bg-white">
            <Sparkles className="size-4" />
          </div>
          <p className="text-sm font-semibold">Rewwy</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Toggle sidebar">
          <PanelLeft className="size-4" />
        </Button>
      </div>

      <div className="px-3 pb-3">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input placeholder="Search" className="h-8 bg-white pl-8 text-xs" />
        </div>
        <Button
          type="button"
          onClick={onCreateConversation}
          className="mt-2 h-8 w-full justify-start rounded-lg text-xs"
          disabled={isCreatingConversation || isOnNewConversationScreen}
        >
          <Plus className="mr-1 size-3.5" />
          {isCreatingConversation ? "Creating..." : "New conversation"}
        </Button>
      </div>

      <div className="flex items-center justify-between px-3 pb-2">
        <p className="text-sm font-medium">
          Conversations ({conversations.length})
        </p>
      </div>

      <ScrollArea className="flex-1 px-3">
        <div className="space-y-2">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              id={conversation.id}
              title={conversation.title}
              updatedAt={conversation.updatedAt}
              isActive={conversation.id === selectedConversationId}
              isDeleting={deletingConversationId === conversation.id}
              onSelect={onSelectConversation}
              onDelete={onDeleteConversation}
            />
          ))}

          {conversations.length === 0 && (
            <p className="text-muted-foreground rounded-xl border border-dashed p-3 text-xs">
              No conversations yet.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
