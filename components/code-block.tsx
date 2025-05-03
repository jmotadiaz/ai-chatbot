import { useTheme } from "next-themes";
import { ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  className?: string;
  children?: ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ className, children, ...props }) => {
  const { theme } = useTheme();
  const codeTheme = theme === "light" ? oneLight: tomorrow;
  const codeString = Array.isArray(children) ? children.join("") : String(children);
  const match = /language-(\w+)/.exec(className || "");

  if (match) {
    return (
      <div className="animate-fade">
        <SyntaxHighlighter
          wrapLongLines={false}
          style={codeTheme}
          language={match[1]}
          PreTag="div"
          customStyle={{
            borderRadius: 10
          }}
          {...props}
        >
          {codeString.replace(/\n$/, "")}
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
