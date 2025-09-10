"use client";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { ArrowDown, Download, EyeIcon, ImageIcon, X } from "lucide-react";
import { useState } from "react";
import { Content } from "@/components/content";
import { convertFileToDataURLs } from "@/lib/ai/utils";
import { ImageFile, useGeneratedText } from "@/lib/ai/hooks/use-generated-text";
import { DotsLoadingIcon } from "@/components/icons";
import { removeExtension } from "@/lib/utils";

export const ImageAutomaticEdition: React.FC = () => {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    maxSize: 4.5 * 1024 * 1024, // 4.5MB
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
  const [filePair, setFilePair] = useState<{
    old: ImageFile;
    optimized: ImageFile;
  } | null>();
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
                <span
                  className="absolute top-4 right-4 bg-gray-200 p-2 rounded-full hover:bg-gray-100 opacity-70 cursor-pointer"
                  onClick={() => {
                    setFilePair({ old: filesInput[index], optimized: file });
                  }}
                >
                  <EyeIcon className="text-zinc-900" size={16} />
                </span>
                <a
                  className="absolute top-4 left-4 bg-white p-2 rounded-full hover:bg-gray-100 opacity-70 cursor-pointer"
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
        {filePair && (
          <CompareFile {...filePair} onClose={() => setFilePair(null)} />
        )}
      </div>
    </Content>
  );
};

const CompareFile: React.FC<{
  old: ImageFile;
  optimized: ImageFile;
  onClose: () => void;
}> = ({ old, optimized, onClose }) => {
  const [fileToShow, setFileToShow] = useState<ImageFile>(optimized);

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
        <div className="absolute inset-0 z-1" onClick={onClose}></div>
        <div className="pt-4 rounded-lg relative z-2 max-w-3xl w-full">
          <button
            className="absolute top-2 right-2 text-gray-400 hover:text-gray-100 cursor-pointer"
            onClick={onClose}
          >
            <X size={24} />
          </button>
          <div className="flex justify-center">
            <Image
              src={fileToShow.url}
              alt="Image Preview"
              width={500}
              height={500}
              className="max-h-[80vh] max-w-full object-contain cursor-pointer"
              onClick={() => {
                setFileToShow(
                  fileToShow.url === optimized.url ? old : optimized
                );
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
};
