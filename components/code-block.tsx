import { ReactNode } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { tomorrow } from "react-syntax-highlighter/dist/esm/styles/prism";

interface CodeBlockProps {
  className?: string;
  children?: ReactNode;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ className, children, ...props }) => {
  const codeString = Array.isArray(children) ? children.join("") : String(children);
  const match = /language-(\w+)/.exec(className || "");

  if (match) {
    return (
      <div className="animate-fade">
        <SyntaxHighlighter
          wrapLongLines={false}
          style={tomorrow}
          language={match[1]}
          PreTag="div"
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
