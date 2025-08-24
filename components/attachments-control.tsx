import { Camera, FileText, ImageIcon, Paperclip } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";
import { Dropdown, useDropdown } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";

export const AttachmentsControl: React.FC = () => {
  const { handleFileChange, files, selectedModel } = useChatContext();
  const { getDropdownPopupProps, getDropdownTriggerProps, close } =
    useDropdown();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const clearInputs = useCallback(() => {
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
    if (documentInputRef.current) {
      documentInputRef.current.value = "";
    }
  }, []);

  useEffect(() => {
    if (files === null) {
      clearInputs();
    }
  }, [clearInputs, files]);

  useEffect(() => {
    if (imageInputRef.current) {
      clearInputs();
    }
  }, [selectedModel, clearInputs]);

  const { supportedFiles } = getChatConfigurationByModelId(selectedModel);

  if (!supportedFiles || supportedFiles.length === 0) {
    return null;
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e);
    close();
  };

  return (
    <div className="relative">
      <ChatControl Icon={Paperclip} {...getDropdownTriggerProps()} />

      <Dropdown.Popup {...getDropdownPopupProps()} className="space-y-4">
        {supportedFiles.includes("img") && (
          <>
            <div className="flex items-center justify-between space-x-4">
              <Label className="cursor-pointer" htmlFor="image-input">
                <ImageIcon className="h-4 w-4 mr-1" /> Image
              </Label>
              <input
                id="image-input"
                type="file"
                accept="image/*"
                className="absolute w-0 h-0 overflow-hidden opacity-0"
                onChange={onChange}
                ref={imageInputRef}
                multiple
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer" htmlFor="camera">
                <Camera className="h-4 w-4 mr-1" /> Camera
              </Label>
              <input
                id="camera-input"
                type="file"
                accept="image/*"
                className="absolute w-0 h-0 overflow-hidden opacity-0"
                onChange={onChange}
                capture="environment"
                ref={cameraInputRef}
                multiple
              />
            </div>
          </>
        )}
        {supportedFiles.includes("pdf") && (
          <div className="flex items-center justify-between">
            <Label className="cursor-pointer" htmlFor="document-input">
              <FileText className="h-4 w-4 mr-1" /> Document
            </Label>
            <input
              id="document-input"
              type="file"
              accept="application/pdf"
              className="absolute w-0 h-0 overflow-hidden opacity-0"
              onChange={onChange}
              capture="environment"
              ref={documentInputRef}
              multiple
            />
          </div>
        )}
      </Dropdown.Popup>
    </div>
  );
};
