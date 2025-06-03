/* eslint-disable @typescript-eslint/no-unused-vars */
import Link from "next/link";
import React, { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import CodeBlock from "./code-block";

const components: Partial<Components> = {
  pre: ({ children }) => <>{children}</>,
  code: CodeBlock,
  div: ({ node, children, ...props }) => {
    return (
      <div className="animate-fade" {...props}>
        {children}
      </div>
    );
  },
  ol: ({ node, children, ...props }) => {
    return (
      <ol className="animate-fade list-decimal list-outside ml-4" {...props}>
        {children}
      </ol>
    );
  },
  li: ({ node, children, ...props }) => {
    return (
      <li className="animate-fade py-1" {...props}>
        {children}
      </li>
    );
  },
  ul: ({ node, children, ...props }) => {
    return (
      <ul className="animate-fade list-decimal list-outside ml-4" {...props}>
        {children}
      </ul>
    );
  },
  table: ({ node, children, ...props }) => {
    return (
      <div className="animate-fade w-full overflow-x-auto">
        <table className="table-auto w-auto" {...props}>
          {children}
        </table>
      </div>
    );
  },
  th: ({ node, children, ...props }) => {
    return (
      <th
        className="whitespace-nowrap animate-fade text-left p-2 border-b border-zinc-400 dark:border-zinc-700  break-word"
        {...props}
      >
        {children}
      </th>
    );
  },
  td: ({ node, children, ...props }) => {
    return (
      <td
        className="p-2 border-b border-zinc-400 dark:border-zinc-700 wrap-break-word"
        {...props}
      >
        {children}
      </td>
    );
  },
  strong: ({ node, children, ...props }) => {
    return (
      <span className="font-semibold" {...props}>
        {children}
      </span>
    );
  },
  p: ({ node, children, ...props }) => {
    return (
      <p className="animate-fade my-2" {...props}>
        {children}
      </p>
    );
  },
  a: ({ node, children, ...props }) => {
    return (
      // @ts-expect-error error
      <Link
        className="text-blue-500 hover:underline"
        target="_blank"
        rel="noreferrer"
        {...props}
      >
        {children}
      </Link>
    );
  },
  h1: ({ node, children, ...props }) => {
    return (
      <h1 className="animate-fade text-2xl font-semibold mt-6 mb-2" {...props}>
        {children}
      </h1>
    );
  },
  h2: ({ node, children, ...props }) => {
    return (
      <h2 className="animate-fade text-xl font-semibold mt-4 mb-2" {...props}>
        {children}
      </h2>
    );
  },
  h3: ({ node, children, ...props }) => {
    return (
      <h3 className="animate-fade text-lg font-semibold mt-4 mb-2" {...props}>
        {children}
      </h3>
    );
  },
  h4: ({ node, children, ...props }) => {
    return (
      <h4
        className="animate-fade text-lg opacity-80 font-semibold mt-4 mb-2"
        {...props}
      >
        {children}
      </h4>
    );
  },
  h5: ({ node, children, ...props }) => {
    return (
      <h5
        className="animate-fade text-base opacity-80 font-semibold mt-2 mb-2"
        {...props}
      >
        {children}
      </h5>
    );
  },
  h6: ({ node, children, ...props }) => {
    return (
      <h6
        className="animate-fade text-base opacity-70 font-semibold mt-2 mb-2"
        {...props}
      >
        {children}
      </h6>
    );
  },
};

const remarkPlugins = [remarkGfm];

const NonMemoizedMarkdown = ({ children }: { children: string }) => {
  return (
    <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
      {children}
    </ReactMarkdown>
  );
};

export const Markdown = memo(
  NonMemoizedMarkdown,
  (prevProps, nextProps) => prevProps.children === nextProps.children
);
