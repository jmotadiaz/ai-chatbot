import { Camera, FileText, ImageIcon, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";
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

  if (!supportedFiles || supportedFiles.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <ChatControl Icon={Paperclip} {...getDropdownTriggerProps()} />

      <Dropdown.Popup {...getDropdownPopupProps()}>
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
        {supportedFiles.includes("pdf") && (
          <Dropdown.Item
            as={Label}
            className="text-sm"
            htmlFor="document-input"
          >
            <FileText className="w-5 h-5" /> <span>Document</span>
            <input
              id="document-input"
              type="file"
              accept="application/pdf"
              className="absolute w-0 h-0 overflow-hidden opacity-0"
              onChange={onChange}
              capture="environment"
              multiple
            />
          </Dropdown.Item>
        )}
      </Dropdown.Popup>
    </div>
  );
};

const checkCaptureSupported = (): boolean => {
  const input = document.createElement("input");
  input.type = "file";
  return typeof input.capture !== "undefined";
};
