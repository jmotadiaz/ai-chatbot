"use client";
import { useTheme } from "next-themes";
import React, { ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  tomorrow,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { Copy } from "lucide-react";
import { handleCopy } from "@/lib/utils";

interface CodeBlockProps {
  className?: string;
  children?: ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  className,
  children,
  ...props
}) => {
  const { theme } = useTheme();
  const codeTheme = theme === "light" ? oneLight : tomorrow;
  const codeString = (
    Array.isArray(children) ? children.join("") : String(children)
  ).replace(/\n$/m, "");
  const match = /language-(\w+)/.exec(className || "");

  if (match) {
    return (
      <div className="relative animate-fade">
        <button
          type="button"
          onClick={handleCopy(codeString)}
          className="absolute top-3 right-2 p-1 cursor-pointer text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
          aria-label={"Copy code"}
        >
          <Copy size={16} />
        </button>
        <SyntaxHighlighter
          wrapLongLines={false}
          style={codeTheme}
          language={match[1]}
          PreTag="div"
          customStyle={{
            borderRadius: 10,
            padding: "1.25rem 1rem",
          }}
          {...props}
        >
          {codeString}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

export default CodeBlock;
