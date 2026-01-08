"use client";

import React, { useTransition, useState } from "react";
import { MoreVertical, Pin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, useSelect } from "@/components/ui/select";
import { useChatContext } from "@/components/chat/provider";
import { togglePinChat, deleteChat } from "@/lib/features/chat/actions";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export const ActiveChatMenu: React.FC = () => {
  const { chatId, isNewChat, preventChatPersistence } = useChatContext();

  const isPersisted = !isNewChat && !preventChatPersistence && chatId;

  if (!isPersisted) return null;

  return <ChatMenu chatId={chatId} />;
};

export const ChatMenu: React.FC<{ chatId: string }> = ({ chatId }) => {
  const [isPending, startTransition] = useTransition();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const { getSelectTriggerProps, getSelectContentProps } = useSelect<string>({
    value: "",
    id: "active-chat-menu",
    onValueChange: (value) => {
      if (value === "pin") {
        handlePin();
      } else if (value === "delete") {
        setShowDeleteModal(true);
      }
    },
  });

  const { isShown, close } = getSelectContentProps();

  const handlePin = () => {
    if (!chatId) return;
    startTransition(async () => {
      try {
        await togglePinChat(chatId);
        toast.success("Chat pin status updated");
      } catch (error) {
        console.error("Failed to update pin status", error);
        toast.error("Failed to update pin status");
      }
    });
  };

  const handleDelete = () => {
    if (!chatId) return;
    startTransition(async () => {
      try {
        await deleteChat(chatId);
        toast.success("Chat deleted");
      } catch (error) {
        console.error("Failed to delete chat", error);
        toast.error("Failed to delete chat");
      }
    });
  };

  const { toggle } = getSelectTriggerProps();

  return (
    <>
      <Select.Container className="mr-2">
        <Button
          variant="icon"
          size="icon"
          aria-label="Chat menu"
          onClick={toggle}
          className="h-9 w-9 text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreVertical className="h-5 w-5" />
        </Button>
        <Select.Dropdown
          isShown={isShown}
          close={close}
          id="active-chat-menu"
          variant="bottom-left"
        >
          <Select.Item
            value="pin"
            onValueChange={() => {
              handlePin();
              close();
            }}
            selected={false}
            className="p-4"
          >
            <div className="flex items-center space-x-3">
              <Pin className="h-4 w-4" />
              <span>Pin / Unpin</span>
            </div>
          </Select.Item>
          <Select.Item
            value="delete"
            onValueChange={() => {
              setShowDeleteModal(true);
              close();
            }}
            selected={false}
            className="p-4"
          >
            <div className="flex items-center space-x-3">
              <Trash2 className="h-4 w-4" />
              <span>Delete chat</span>
            </div>
          </Select.Item>
        </Select.Dropdown>
      </Select.Container>
      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Chat"
        message="Are you sure you want to delete this chat? This action cannot be undone."
        onConfirm={handleDelete}
        onClose={() => setShowDeleteModal(false)}
        isLoading={isPending}
      />
    </>
  );
};
