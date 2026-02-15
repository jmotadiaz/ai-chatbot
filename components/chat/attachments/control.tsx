import { Camera, FileSearch, ImageIcon, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { ChatControl } from "@/components/chat/control";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";
import type { ModelConfiguration } from "@/lib/features/foundation-model/types";

export interface AttachmentsControlProps {
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  supportedFiles: Required<ModelConfiguration>["supportedFiles"];
}

export const AttachmentsControl: React.FC<AttachmentsControlProps> = ({
  handleFileChange,
  supportedFiles,
}) => {
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

  const imageInputId = "image-input";
  const cameraInputId = "camera-input";
  const documentInputId = "document-input";

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
        variant="top-right"
        data-testid="attachment-menu"
      >
        {supportedFiles.includes("img") && (
          <>
            <Dropdown.Item
              as={Label}
              className="text-sm"
              htmlFor={imageInputId}
            >
              <ImageIcon className="w-5 h-5" /> <span>Image</span>
              <input
                id={imageInputId}
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
                  htmlFor={cameraInputId}
                >
                  <Camera className="w-5 h-5" /> <span>Camera</span>
                  <input
                    id={cameraInputId}
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
        <Dropdown.Item as={Label} className="text-sm" htmlFor={documentInputId}>
          <FileSearch className="w-5 h-5" /> <span>Document</span>
          <input
            id={documentInputId}
            type="file"
            accept={
              supportedFiles.includes("pdf")
                ? "application/pdf,.md,.txt,.xml,.json"
                : ".md,.txt,.xml,.json"
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
