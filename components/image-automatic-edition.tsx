"use client";
import Image from "next/image";
import { Download } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Content } from "@/components/content";
import { useGeneratedText } from "@/lib/ai/hooks/use-generated-text";
import {
  CircleProgress,
  ImageIcon,
  ImageSparkleIcon,
  SpinnerIcon,
} from "@/components/icons";
import { cn, removeExtension } from "@/lib/utils";

export const ImageAutomaticEdition: React.FC = () => {
  const {
    files,
    filesInput,
    handleFileChange,
    setFilesInput,
    generate,
    isLoading,
    clear,
  } = useGeneratedText({
    api: "/api/image/automatic-edition",
  });

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      clear();
      setFilesInput([]);
      handleFileChange(e);
    }
  };

  return (
    <AnimatePresence key="image-automatic-edition">
      <Content className="pb-10">
        <div className="pt-6 space-y-4 lg:space-y-6">
          <label
            htmlFor="image-edition-input"
            className="flex w-full lg:w-1/2 mx-auto justify-center bg-secondary py-3 z-1 rounded-xl hover:bg-secondary-accent active:bg-secondary-accent/80 cursor-pointer"
          >
            <input
              id="image-edition-input"
              type="file"
              accept="image/*"
              className="absolute w-0 h-0 overflow-hidden opacity-0"
              onChange={onChange}
            />
            <div>
              <ImageIcon size={38} />
            </div>
          </label>

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
                  {filesInput[0].loading && (
                    <div
                      className={cn(
                        "bg-secondary absolute top-1/2 left-1/2 transform -translate-y-1/2 -translate-x-1/2 p-1 rounded-full opacity-80 text-xs"
                      )}
                    >
                      <CircleProgress
                        size={80}
                        progress={filesInput[0].loading.percentage}
                        strokeWidth={3}
                      />
                    </div>
                  )}
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
          {filesInput[0] && !filesInput[0].loading && (
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
