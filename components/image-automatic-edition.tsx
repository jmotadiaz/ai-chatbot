"use client";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { Content } from "@/components/content";
import { convertFileToDataURLs } from "@/lib/ai/utils";
import { Button } from "@/components/ui/button";
import { useGeneratedText } from "@/lib/ai/hooks/use-generated-text";
import { DotsLoadingIcon } from "@/components/icons";

export const ImageAutomaticEdition: React.FC = () => {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFilesInput([await convertFileToDataURLs(acceptedFiles[0])]);
      }
    },
  });
  const { files, filesInput, setFilesInput, generate, isLoading, clear } =
    useGeneratedText({
      api: "/api/image/automatic-edition",
    });
  return (
    <Content className="pb-10">
      <div
        {...getRootProps()}
        className="flex items-center p-10 border-2 border-dashed border-gray-300 rounded-md cursor-pointer"
      >
        <input {...getInputProps()} />
        {filesInput.map((file, index) => (
          <Image
            width={50}
            height={50}
            className="w-10 h-auto mr-4 rounded-lg"
            key={index}
            src={file.url}
            alt="optimized"
          />
        ))}
        <p>Drag n drop some files here, or click to select files</p>
      </div>
      <Button
        variant="outline"
        className="mt-4"
        disabled={filesInput.length === 0 || isLoading}
        onClick={() => {
          clear();
          generate({ prompt: "Edit attached image" });
        }}
      >
        Submit
      </Button>
      <div className="mt-8 flex justify-center">
        {isLoading && <DotsLoadingIcon size={6} />}
        <>
          {files.map((file, index) => {
            return (
              <Image
                width={500}
                height={500}
                className="max-w-full lg:max-w-1/2 w-auto h-auto rounded-lg"
                key={index}
                src={file.url}
                alt="optimized"
              />
            );
          })}
        </>
      </div>
    </Content>
  );
};
