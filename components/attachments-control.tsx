import { Camera, FileText, ImageIcon, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { useChatContext } from "@/app/(chat)/chat-provider";
import { ChatControl } from "@/components/chat-control";
import { getChatConfigurationByModelId } from "@/lib/features/models/config";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";
export const AttachmentsControl: React.FC = () => {
  const { handleFileChange, selectedModel } = useChatContext();
  const { getDropdownPopupProps, getDropdownTriggerProps, close } =
    useDropdown();
  const [isCaptureSupported, setIsCaptureSupported] = useState(false);

  useEffect(() => {
    setIsCaptureSupported(checkCaptureSupported());
  }, []);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    close();
    handleFileChange(e);
  };

  const { supportedFiles } = getChatConfigurationByModelId(selectedModel);

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
        data-testid="attachment-menu"
      >
        {supportedFiles.includes("img") && (
          <>
            <Dropdown.Item as={Label} className="text-sm" htmlFor="image-input">
              <ImageIcon className="w-5 h-5" /> <span>Image</span>
              <input
                id="image-input"
                type="file"
                accept="image/*"
                className="absolute w-0 h-0 overflow-hidden opacity-0"
                onChange={onChange}
                multiple
              />
            </Dropdown.Item>
            <>
              {isCaptureSupported && (
                <Dropdown.Item
                  as={Label}
                  className="text-sm"
                  htmlFor="camera-input"
                >
                  <Camera className="w-5 h-5" /> <span>Camera</span>
                  <input
                    id="camera-input"
                    type="file"
                    accept="image/*"
                    className="absolute w-0 h-0 overflow-hidden opacity-0"
                    onChange={onChange}
                    capture="environment"
                    multiple
                  />
                </Dropdown.Item>
              )}
            </>
          </>
        )}
        <Dropdown.Item as={Label} className="text-sm" htmlFor="document-input">
          <FileText className="w-5 h-5" /> <span>Document</span>
          <input
            id="document-input"
            type="file"
            accept={
              supportedFiles.includes("pdf")
                ? "application/pdf,.md,.txt,.xml"
                : ".md,.txt,.xml"
            }
            className="absolute w-0 h-0 overflow-hidden opacity-0"
            onChange={onChange}
            capture="environment"
            multiple
          />
        </Dropdown.Item>
      </Dropdown.Popup>
    </div>
  );
};

const checkCaptureSupported = (): boolean => {
  const input = document.createElement("input");
  input.type = "file";
  return typeof input.capture !== "undefined";
};
