"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

type ConversationItemProps = {
  id: string;
  title: string;
  updatedAt: string;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function ConversationItem({
  id,
  title,
  updatedAt,
  isActive,
  isDeleting,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={`hover:bg-accent flex w-full items-start gap-2 rounded-xl border px-3 py-2 ${
        isActive ? "bg-muted/60" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(id)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-xs font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 truncate text-[0.725rem]">
          {new Date(updatedAt).toLocaleString()}
        </p>
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive mt-0.5"
        onClick={() => onDelete(id)}
        disabled={isDeleting}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
