"use client";
import { useTheme } from "next-themes";
import React, { ReactNode, useState, useEffect } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  tomorrow,
  oneLight,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyBlock } from "@/components/copy-block";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  className?: string;
  children?: ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  className,
  children,
  ...props
}) => {
  const [mounted, setMounted] = useState(false);
  const { theme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const codeTheme = theme === "light" ? oneLight : tomorrow;
  const codeString = (
    Array.isArray(children) ? children.join("") : String(children)
  ).replace(/\n$/m, "");
  const match = /language-(\w+)/.exec(className || "");

  if (match) {
    return (
      <div className="animate-fade mb-4">
        <CopyBlock
          text={
            match[1].trim() === "markdown"
              ? codeString.replaceAll("`", "\\`")
              : codeString
          }
        >
          <SyntaxHighlighter
            wrapLongLines={false}
            style={codeTheme}
            language={match[1]}
            PreTag="div"
            customStyle={{
              borderRadius: 10,
              padding: "1.25rem 1rem",
              marginBottom: 0,
            }}
            codeTagProps={{ style: { fontFamily: "var(--font-fira-code)" } }}
            {...props}
          >
            {codeString}
          </SyntaxHighlighter>
        </CopyBlock>
      </div>
    );
  }

  return (
    <code className={cn("font-mono", className)} {...props}>
      {children}
    </code>
  );
};

export default CodeBlock;
