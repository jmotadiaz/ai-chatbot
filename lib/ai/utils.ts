import {
  FileUIPart,
  GenerateObjectResult,
  generateText,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  TextUIPart,
} from "ai";
import {
  ZodArray,
  ZodBoolean,
  ZodDate,
  ZodDefault,
  ZodEnum,
  ZodLiteral,
  ZodNullable,
  ZodNumber,
  ZodObject,
  ZodOptional,
  ZodString,
  ZodTypeAny,
  ZodUnion,
} from "zod";
import { languageModelConfigurations } from "@/lib/ai/models/definition";
import { InsertMessage, Message } from "@/lib/db/schema";
import { ChatbotMessage } from "@/lib/ai/types";

export async function generateTitleFromUserMessage(
  message: ChatbotMessage | undefined
) {
  if (!message) return "Unknown";

  const { text: title } = await generateText({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    system: `\n
    - you will generate a short title based on the first message a user begins a conversation with
    - ensure it is not more than 60 characters long
    - the title should be a summary of the user's message, and should only include the summary
    - do not use markdown formatting, it should be plain text`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export const chatbotMessageToDbMessage =
  (chatId: string) =>
  ({ id, role, parts, metadata }: ChatbotMessage): InsertMessage => ({
    chatId,
    id,
    role,
    parts: parts.filter((part) => part.type !== "file"),
    metadata,
  });

export function dbMessageToChatbotMessage(
  messages: Array<Message>
): Array<ChatbotMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as ChatbotMessage["parts"],
    role: message.role as ChatbotMessage["role"],
    metadata: message.metadata as ChatbotMessage["metadata"],
    createdAt: message.createdAt,
  }));
}

export const messagePartsToText = (message: ChatbotMessage): string => {
  return message.parts?.reduce((content, part) => {
    if (part.type === "text") {
      return `${content}${part.text}`;
    }
    return content;
  }, "");
};

export const getObject = <T>({ object }: GenerateObjectResult<T>) => object;

export const once = <T>(fn: () => T): (() => T) => {
  let called = false;
  let result: T;

  return () => {
    if (!called) {
      called = true;
      result = fn();
    }
    return result;
  };
};

export type FilePart = Pick<
  FileUIPart,
  "type" | "mediaType" | "url" | "filename"
>;

export const convertFilesToDataURLs = async (
  files: FileList
): Promise<FilePart[]> => {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise<FilePart>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            resolve({
              type: "file",
              mediaType: file.type,
              filename: file.name,
              url: reader.result as string,
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
};

export interface SegregatedMessagePartsReturn {
  textParts: TextUIPart[];
  fileParts: FileUIPart[];
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
}

export const segregateMessageParts = (
  parts: ChatbotMessage["parts"]
): {
  textParts: TextUIPart[];
  fileParts: FileUIPart[];
  sourceParts: Array<SourceUrlUIPart | SourceDocumentUIPart>;
} => {
  return parts?.reduce<SegregatedMessagePartsReturn>(
    (acc, part) => {
      switch (part.type) {
        case "text":
          acc.textParts.push(part);
          break;
        case "source-url":
        case "source-document":
          acc.sourceParts.push(part);
          break;
        case "file":
          acc.fileParts.push(part);
          break;
      }
      return acc;
    },
    { textParts: [], sourceParts: [], fileParts: [] }
  );
};

export function zodToPrompt(schema: ZodTypeAny): string {
  const indent = (lvl: number) => "  ".repeat(lvl);

  const format = (s: ZodTypeAny, lvl: number): string => {
    if (s instanceof ZodString) return `"string"`;
    if (s instanceof ZodNumber) return `"number"`;
    if (s instanceof ZodBoolean) return `"boolean"`;
    if (s instanceof ZodDate) return `"date"`;

    if (s instanceof ZodLiteral) return JSON.stringify(s._def.value);

    if (s instanceof ZodEnum) {
      return s._def.values.map((v: string) => `"${v}"`).join(" | ");
    }

    if (s instanceof ZodUnion) {
      return s._def.options
        .map((opt: ZodTypeAny) => format(opt, lvl))
        .join(" | ");
    }

    if (s instanceof ZodArray) {
      return `${format(s._def.type, lvl)}[]`;
    }

    if (s instanceof ZodObject) {
      const shape = s._def.shape();
      const entries = Object.entries(shape);
      const lines = entries.map(([key, subSchema], i) => {
        const value = format(subSchema as ZodTypeAny, lvl + 1);
        const comma = i < entries.length - 1 ? "," : "";
        return `${indent(lvl + 1)}"${key}": ${value}${comma}`;
      });
      return `{\n${lines.join("\n")}\n${indent(lvl)}}`;
    }

    if (
      s instanceof ZodOptional ||
      s instanceof ZodNullable ||
      s instanceof ZodDefault
    ) {
      const inner = s._def.innerType ?? s._def.typeName;
      return format(inner as ZodTypeAny, lvl);
    }

    // ---------- Otros ----------
    return `"unknown"`;
  };

  return `Your output should follow this JSON schema:\n${format(schema, 0)}`;
}
