import { Paperclip } from "lucide-react";
import { useEffect, useRef } from "react";
import { useChatContext } from "@/app/providers";
import { ChatControl } from "@/components/chat-control";
import { getChatConfigurationByModelId } from "@/lib/ai/models/utils";
import { ModelConfiguration } from "@/lib/ai/models/definition";

const mapSupportedFileTypesToAccept = (
  types: Required<ModelConfiguration>["supportedFiles"]
) => {
  const mimeTypes = types.map((type) => {
    switch (type) {
      case "pdf":
        return "application/pdf";
      case "img":
        return "image/*;capture=camera";
      default:
        return "";
    }
  });
  return mimeTypes.join(",");
};

export const AttachmentsControl: React.FC = () => {
  const { handleFileChange, files, selectedModel } = useChatContext();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (files === null && fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [files]);

  useEffect(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [selectedModel]);

  const { supportedFiles } = getChatConfigurationByModelId(selectedModel);

  if (!supportedFiles || supportedFiles.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <ChatControl
        Icon={Paperclip}
        onClick={() => {
          fileInputRef.current?.click();
        }}
      />
      <input
        type="file"
        accept={mapSupportedFileTypesToAccept(supportedFiles)}
        className="absolute w-0 h-0 overflow-hidden opacity-0"
        onChange={handleFileChange}
        multiple
        ref={fileInputRef}
      />
    </div>
  );
};
