"use client";

import { type ComponentProps, memo } from "react";
import { Streamdown } from "streamdown";
import CodeBlock from "@/components/code-block";

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  (props: ResponseProps) => (
    <Streamdown components={{ code: CodeBlock }} {...props} />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

Response.displayName = "Response";
