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

const languageAliases = {
  js: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  sh: "bash",
  yml: "yaml",
  md: "markdown",
} as const;

const getLanguageName = (languageCode: string): string => {
  return (
    languageAliases[languageCode as keyof typeof languageAliases] ||
    languageCode
  );
};

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
      <div className="animate-fade my-6">
        <CopyBlock
          iconClassName="top-4"
          text={
            match[1].trim() === "markdown"
              ? codeString.replaceAll("`", "\\`")
              : codeString
          }
        >
          <div className="absolute left-4 top-4 text-sm font-medium font-mono text-muted-foreground capitalize">
            {getLanguageName(match[1])}
          </div>
          <div className="bg-background absolute left-0 top-12 h-[2px] w-full" />
          <SyntaxHighlighter
            wrapLongLines={false}
            style={codeTheme}
            language={match[1]}
            PreTag="div"
            customStyle={{
              borderRadius: 10,
              paddingTop: "4rem",
              paddingBottom: "1.25rem",
              paddingLeft: "1rem",
              paddingRight: "1rem",
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
