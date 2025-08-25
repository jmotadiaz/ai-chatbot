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
    handleFileChange(e);
    close();
  };

  const { supportedFiles } = getChatConfigurationByModelId(selectedModel);

  if (!supportedFiles || supportedFiles.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <ChatControl Icon={Paperclip} {...getDropdownTriggerProps()} />

      <Dropdown.Popup {...getDropdownPopupProps()} className="space-y-4">
        {supportedFiles.includes("img") && (
          <>
            <Label
              className="flex items-center space-x-4 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer w-full relative m-0 py-1.5"
              htmlFor="image-input"
            >
              <ImageIcon className="w-4 h-4 mr-1.5" /> Image
              <input
                id="image-input"
                type="file"
                accept="image/*"
                className="absolute w-0 h-0 overflow-hidden opacity-0"
                onChange={onChange}
                multiple
              />
            </Label>
            <>
              {isCaptureSupported && (
                <Label
                  className="flex items-center space-x-4 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer w-full relative m-0 py-1.5"
                  htmlFor="camera-input"
                >
                  <Camera className="w-4 h-4 mr-1.5" /> Camera
                  <input
                    id="camera-input"
                    type="file"
                    accept="image/*"
                    className="absolute w-0 h-0 overflow-hidden opacity-0"
                    onChange={onChange}
                    capture="environment"
                    multiple
                  />
                </Label>
              )}
            </>
          </>
        )}
        {supportedFiles.includes("pdf") && (
          <Label
            className="flex items-center space-x-4 text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer w-full relative py-1 m-0 py-1.5"
            htmlFor="document-input"
          >
            <FileText className="w-4 h-4 mr-1.5" /> Document
            <input
              id="document-input"
              type="file"
              accept="application/pdf"
              className="absolute w-0 h-0 overflow-hidden opacity-0"
              onChange={onChange}
              capture="environment"
              multiple
            />
          </Label>
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
