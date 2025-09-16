"use client";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { Download } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Content } from "@/components/content";
import { convertFileToDataURLs } from "@/lib/ai/utils";
import { useGeneratedText } from "@/lib/ai/hooks/use-generated-text";
import { ImageIcon, ImageSparkleIcon, SpinnerIcon } from "@/components/icons";
import { cn, removeExtension } from "@/lib/utils";

export const ImageAutomaticEdition: React.FC = () => {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    maxSize: 4 * 1024 * 1024, // 4MB
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length > 0) {
        setFilesInput([await convertFileToDataURLs(acceptedFiles[0])]);
        clear();
      }
    },
  });
  const { files, filesInput, setFilesInput, generate, isLoading, clear } =
    useGeneratedText({
      api: "/api/image/automatic-edition",
    });

  return (
    <AnimatePresence key="image-automatic-edition">
      <Content className="pb-10">
        <div className="pt-6 space-y-4 lg:space-y-6">
          <div
            {...getRootProps()}
            className="flex w-full lg:w-1/2 mx-auto justify-center bg-secondary py-3 z-1 rounded-xl hover:bg-secondary-accent active:bg-secondary-accent/80 cursor-pointer"
          >
            <input {...getInputProps()} />
            <div>
              <ImageIcon size={38} />
            </div>
          </div>

          <div
            className={cn(
              "snap-x snap-mandatory gap-6 lg:gap-20 flex w-full lg:w-1/2 mx-auto overflow-x-auto items-center flex-nowrap",
              {
                "justify-center": files.length === 0,
              }
            )}
          >
            <>
              {files.map((file, index) => {
                return (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    key={index}
                    className="relative snap-center flex-none w-full py-4"
                  >
                    <a
                      className="absolute top-6 right-4 bg-white text-zinc-900 p-2 rounded-full hover:bg-gray-100 opacity-80 cursor-pointer"
                      href={file.url}
                      download={`${removeExtension(
                        filesInput[0].filename || "image"
                      )}-optimized-${index}.png`}
                    >
                      <Download size={16} />
                    </a>
                    <Image
                      width={500}
                      height={500}
                      className="w-full h-auto rounded-lg object-contain"
                      src={file.url}
                      alt="optimized"
                    />
                  </motion.div>
                );
              })}
              {filesInput[0] && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  key={`${filesInput[0].filename}-${
                    files.length ? "input" : "output"
                  }`}
                  className="relative snap-center flex-none w-full py-4"
                >
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="absolute top-0 right-0 left-0 bottom-0 text-white z-1 opacity-80 flex items-center justify-center"
                    >
                      <SpinnerIcon size={50} />
                    </motion.div>
                  )}
                  <Image
                    width={500}
                    height={500}
                    className={cn(
                      "w-full h-full object-contain rounded-lg transition-all duration-300",
                      {
                        "blur-xs": isLoading,
                      }
                    )}
                    src={filesInput[0].url}
                    alt="optimized"
                  />
                </motion.div>
              )}
            </>
          </div>
          {filesInput[0] && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <button
                className="w-full lg:w-1/2 mx-auto py-3 flex justify-center bg-secondary rounded-xl hover:bg-secondary-accent active:bg-secondary-accent/80 cursor-pointer"
                disabled={isLoading}
                onClick={() => {
                  clear();
                  generate({ prompt: "Edit attached image" });
                }}
              >
                <ImageSparkleIcon size={38} />
              </button>
            </motion.div>
          )}
        </div>
      </Content>
    </AnimatePresence>
  );
};
