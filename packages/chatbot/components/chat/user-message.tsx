"use client";

import { motion } from "motion/react";
import React, { useState } from "react";
import { useCollapse } from "react-collapsed";
import { CopyBlock } from "@/components/ui/copy-block";
import { FileThumbnail } from "@/components/chat/attachments/thumbnail";
import type { FilePart } from "@/lib/features/attachment/types";
import { cn } from "@/lib/utils/helpers";
import { SkillChip } from "@/components/code/skill-chip";

export interface UserMessageProps {
  text: string;
  files?: FilePart[];
  messageId?: string;
  className?: string;
  skills?: string[];
}

export const UserMessage: React.FC<UserMessageProps> = ({
  text,
  files = [],
  messageId = "user-message",
  className,
  skills = [],
}) => {
  const trimmedText = text.trim();
  const isLongMessage = text.length > 350;
  const [isCollapseTransitionEnd, setIsCollapseTransitionEnd] = useState(true);
  const { getCollapseProps, getToggleProps, isExpanded } = useCollapse({
    collapsedHeight: 16 * 1.5 * 3,
    defaultExpanded: !isLongMessage,
    onTransitionStateChange: (state) => {
      setIsCollapseTransitionEnd(state === "collapseEnd");
    },
  });

  if (!trimmedText && files.length === 0 && skills.length === 0) {
    return null;
  }

  return (
    <div className={cn("mb-8 pt-4", className)}>
      <div className="flex gap-4 w-full ml-auto max-w-full 4xl:max-w-4xl w-fit">
        <div className="flex flex-col w-full space-y-2">
          {files.length > 0 && (
            <div className="flex gap-3 max-w-full self-end overflow-x-auto scrollbar-none">
              {files.map((file, index) => (
                <FileThumbnail
                  key={`${messageId}-file-${index}`}
                  file={file}
                />
              ))}
            </div>
          )}
          {(trimmedText || skills.length > 0) && (
            <CopyBlock
              text={[
                skills.map((skill) => `/skill:${skill}`).join(" "),
                text,
              ]
                .filter(Boolean)
                .join("\n\n")}
            >
              <div className="flex flex-col max-w-full bg-secondary py-4 pl-4 pr-8 rounded-tl-3xl rounded-br-3xl rounded-bl-3xl">
                {skills.length > 0 && (
                  <div className={cn("flex flex-wrap gap-2", trimmedText && "mb-3")}>
                    {skills.map((skill) => (
                      <SkillChip key={skill} name={skill} />
                    ))}
                  </div>
                )}
                {trimmedText && (
                  <motion.div
                    initial={{ y: 5, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="flex flex-row gap-2 items-start w-full"
                  >
                    <div
                      className={cn("min-w-0 wrap-anywhere", {
                        "line-clamp-3 ![display:-webkit-box]":
                          !isExpanded && isCollapseTransitionEnd,
                      })}
                      {...getCollapseProps()}
                    >
                      {text}
                    </div>
                  </motion.div>
                )}
                {isLongMessage && (
                  <div className="pt-2 flex justify-end text-sm text-zinc-500 dark:text-zinc-400">
                    <button
                      {...getToggleProps()}
                      className="hover:text-zinc-700 dark:hover:text-zinc-200 font-semibold cursor-pointer"
                    >
                      Show {isExpanded ? "less" : "more"}
                    </button>
                  </div>
                )}
              </div>
            </CopyBlock>
          )}
        </div>
      </div>
    </div>
  );
};
