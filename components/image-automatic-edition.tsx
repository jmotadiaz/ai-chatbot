"use client";
import Image from "next/image";
import { useDropzone } from "react-dropzone";
import { ArrowDown, Download, ImageIcon } from "lucide-react";
import { Content } from "@/components/content";
import { convertFileToDataURLs } from "@/lib/ai/utils";
import { useGeneratedText } from "@/lib/ai/hooks/use-generated-text";
import { SpinnerIcon } from "@/components/icons";
import { removeExtension } from "@/lib/utils";

export const ImageAutomaticEdition: React.FC = () => {
  const { getRootProps, getInputProps } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    maxSize: 4 * 1024 * 1024, // 4MB
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
      <div className="mt-10 snap-x snap-mandatory gap-6 flex w-full overflow-x-auto items-center">
        <>
          {files.map((file, index) => {
            return (
              <div
                key={index}
                className="relative snap-center flex-none w-full lg:w-1/2 py-4"
              >
                <a
                  className="absolute top-4 right-4 bg-white text-zinc-900 p-2 rounded-full hover:bg-gray-100 opacity-80 cursor-pointer"
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
              </div>
            );
          })}
          <div className="snap-center flex-none w-full lg:w-1/2 py-4">
            {isLoading && (
              <div className="absolute top-0 right-0 left-0 bottom-0 backdrop-brightness-50 opacity-30">
                <SpinnerIcon size={40} />
              </div>
            )}
            <Image
              width={500}
              height={500}
              className="w-full h-auto object-contain rounded-lg"
              src={filesInput[0].url}
              alt="optimized"
            />
          </div>
        </>
      </div>
    </Content>
  );
};

// const CompareFile: React.FC<{
//   old: ImageFile;
//   optimizedFiles: ImageFile[];
//   onClose: () => void;
// }> = ({ old, optimizedFiles, onClose }) => {
//   const files = [...optimizedFiles, old];
//   const [fileToShow, setFileToShow] = useState<ImageFile>(files[0]);

//   return (
//     <>
//       <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
//         <div className="absolute inset-0 z-1" onClick={onClose}></div>
//         <div className="pt-4 rounded-lg relative z-2 max-w-3xl w-full">
//           <div className="flex justify-center">
//             <div className="relative max-h-[80vh] max-w-full">
//               <button
//                 className="absolute top-2 right-2 text-gray-400 hover:text-gray-100 cursor-pointer"
//                 onClick={onClose}
//               >
//                 <X size={24} />
//               </button>
//               <Image
//                 src={fileToShow.url}
//                 alt="Image Preview"
//                 width={500}
//                 height={500}
//                 className="h-auto w-full object-contain cursor-pointer"
//                 onClick={() => {
//                   setFileToShow(
//                     files.at((files.indexOf(fileToShow) + 1) % files.length)!
//                   );
//                 }}
//               />
//             </div>
//           </div>
//         </div>
//       </div>
//     </>
//   );
// };
