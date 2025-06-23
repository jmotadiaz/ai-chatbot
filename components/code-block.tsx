"use client";
import { useTheme } from "next-themes";
import React, { ReactNode, useState, useEffect, useRef, memo } from "react";
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
      <div className="animate-fade">
        <CopyBlock text={codeString}>
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
        </CopyBlock>
      </div>
    );
  }

  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
};

interface CodeBlockV2Props {
  className?: string;
  language: string;
  codeString: string;
}

const CodeBlockV2NonMemoized: React.FC<CodeBlockV2Props> = ({
  className,
  language,
  codeString,
}) => {
  console.log("CodeBlockV2 rendered", { language, codeString });
  const mounted = useRef(false);
  const { theme } = useTheme();

  useEffect(() => {
    mounted.current = true;
  }, []);

  if (!mounted.current) {
    return null;
  }

  const codeTheme = theme === "light" ? oneLight : tomorrow;

  return (
    <div className={cn("animate-fade", className)}>
      <CopyBlock text={codeString}>
        <SyntaxHighlighter
          wrapLongLines={false}
          style={codeTheme}
          language={language}
          PreTag="div"
          customStyle={{
            borderRadius: 10,
            padding: "1.25rem 1rem",
          }}
        >
          {codeString}
        </SyntaxHighlighter>
      </CopyBlock>
    </div>
  );
};

export const CodeBlockV2 = memo(
  CodeBlockV2NonMemoized,
  (prevProps, nextProps) => {
    return (
      prevProps.language === nextProps.language &&
      prevProps.codeString === nextProps.codeString
    );
  }
);

export default CodeBlock;
