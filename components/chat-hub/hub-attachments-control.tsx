"use client";

import React from "react";
import { Paperclip, FileText } from "lucide-react";
import type { chatModelId } from "@/lib/features/foundation-model/config";
import type { HubInstance } from "@/lib/features/chat/hub/types";
import { ChatControl } from "@/components/chat-control";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";

export interface HubAttachmentsControlProps {
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  availableModels: chatModelId[];
  instances: HubInstance[];
}

export const HubAttachmentsControl: React.FC<HubAttachmentsControlProps> = ({
  handleFileChange,
}) => {
  const { getDropdownPopupProps, getDropdownTriggerProps, close } = useDropdown();

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    close();
    handleFileChange(e);
  };

  return (
    <div className="relative">
      <ChatControl
        Icon={Paperclip}
        aria-label="Attach files"
        {...getDropdownTriggerProps()}
      />

      <Dropdown.Popup
        {...getDropdownPopupProps()}
        aria-label="Attachment options"
        data-testid="hub-attachment-menu"
      >
        <Dropdown.Item as={Label} className="text-sm" htmlFor="hub-document-input">
          <FileText className="w-5 h-5" /> <span>Document</span>
          <input
            id="hub-document-input"
            type="file"
            accept={"application/pdf,.md,.txt,.xml,.json,image/*"}
            className="absolute w-0 h-0 overflow-hidden opacity-0"
            onChange={onChange}
            multiple
          />
        </Dropdown.Item>
      </Dropdown.Popup>
    </div>
  );
};


