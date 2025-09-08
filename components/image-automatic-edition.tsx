"use client";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { ArrowDown, Download, ImageIcon } from "lucide-react";
import { Content } from "@/components/content";
import { convertFileToDataURLs } from "@/lib/ai/utils";
import { useGeneratedText } from "@/lib/ai/hooks/use-generated-text";
import { DotsLoadingIcon } from "@/components/icons";
import { removeExtension } from "@/lib/utils";

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
      <div className="flex gap-4 items-stretch my-8">
        <div
          {...getRootProps()}
          className="flex justify-center relative flex-1 py-2 border-2 border-dashed border-gray-300 rounded-md cursor-pointer"
        >
          <input {...getInputProps()} />
          {filesInput.length ? (
            filesInput.map((file, index) => (
              <Image
                width={50}
                height={50}
                className="h-18 w-auto rounded-lg"
                key={index}
                src={file.url}
                alt="optimized"
              />
            ))
          ) : (
            <div>
              <ImageIcon strokeWidth={1} className="h-18 w-18" />
            </div>
          )}
        </div>
        <button
          className="w-1/4 bg-secondary rounded-2xl hover:bg-secondary-accent active:bg-secondary-accent/80 cursor-pointer"
          disabled={filesInput.length === 0 || isLoading}
          onClick={() => {
            clear();
            generate({ prompt: "Edit attached image" });
          }}
        >
          <ArrowDown className="h-5 w-5 mx-auto" />
        </button>
      </div>
      <div className="mt-10 flex justify-center">
        {isLoading && <DotsLoadingIcon size={6} />}
        <>
          {files.map((file, index) => {
            return (
              <div key={index} className="relative w-full lg:w-1/2">
                <a
                  className="absolute top-4 right-4 bg-white p-2 rounded-full hover:bg-gray-100 opacity-70 cursor-pointer"
                  href={file.url}
                  download={`${removeExtension(
                    filesInput[index].filename || "image"
                  )}-optimized.png`}
                >
                  <Download className="text-zinc-900" size={16} />
                </a>
                <Image
                  width={500}
                  height={500}
                  className="w-full h-auto rounded-lg"
                  src={file.url}
                  alt="optimized"
                />
              </div>
            );
          })}
        </>
      </div>
    </Content>
  );
};
