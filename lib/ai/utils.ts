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
import { put, PutBlobResult } from "@vercel/blob";
import { upload } from "@vercel/blob/client";
import {
  languageModelConfigurations,
  ModelConfiguration,
} from "@/lib/ai/models/definition";
import { InsertMessage, Message } from "@/lib/db/schema";
import { ChatbotMessage } from "@/lib/ai/types";

export async function generateTitle(messages: ChatbotMessage[]) {
  if (messages.length === 0) return "Unknown";

  const { text: title } = await generateText({
    ...languageModelConfigurations["Llama 3.1 Instant"],
    system: `\n
    You are a chat title generator. Create a concise title (≤60 characters) summarizing the first user message. Follow these rules:
    1. Extract the core topic from the user's message
    2. Use only essential keywords (no filler words)
    3. Never include:
      - Markdown formatting
      - Prefixes/suffixes (e.g., "Title:")
      - Quotation marks
      - Unrelated content
    4. Strictly output only the generated title

    Example:
    User message: "Can you help debug my Python script? It's throwing index errors"
    Output: Python script debugging help`,
    prompt: JSON.stringify(messages.find(({ role }) => role === "user")),
  });

  return title;
}

const isBase64URI = (str: string) => {
  return /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)?;base64,/.test(str);
};

const convertBase64ToBlob = (base64URI: string, mimetype: string): Blob => {
  let base64Data = base64URI;
  const prefix = `data:${mimetype};base64,`;

  if (base64URI.startsWith(prefix)) {
    base64Data = base64URI.substring(prefix.length);
  }

  const byteString = atob(base64Data);

  const byteArray = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteArray[i] = byteString.charCodeAt(i);
  }

  return new Blob([byteArray], { type: mimetype });
};

const buildBlobPart = async (part: FileUIPart): Promise<FileUIPart> => {
  if (!isBase64URI(part.url)) return part;
  const blob = await put(
    part.filename || "Unknown",
    convertBase64ToBlob(part.url, part.mediaType),
    {
      access: "public",
      addRandomSuffix: true,
    }
  );

  return {
    ...part,
    url: blob.url,
  };
};
export const chatbotMessageToDbMessage =
  (chatId: string) =>
  async ({
    id,
    role,
    parts,
    metadata,
  }: ChatbotMessage): Promise<InsertMessage> => {
    return {
      chatId,
      id,
      role,
      parts: await Promise.all(
        parts.map(async (part) =>
          part.type === "file" ? await buildBlobPart(part) : part
        )
      ),
      metadata,
    };
  };

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
> & { loading?: { percentage: number } };

export const convertFilesToDataURLs = async (
  files: FileList
): Promise<FilePart[]> => {
  return Promise.all(Array.from(files).map(convertFileToDataURLs));
};

export const convertFileToDataURLs = async (file: File): Promise<FilePart> => {
  return new Promise<FilePart>((resolve, reject) => {
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
  });
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

  return `Your output should be in the following JSON format:\n${format(
    schema,
    0
  )}`;
}

export const toFilePart = (
  blob: PutBlobResult,
  originalFile: File
): FilePart => {
  return {
    filename: originalFile.name,
    type: "file",
    mediaType: originalFile.type,
    url: blob.url,
  };
};

export const handleFileUpload = async (
  setFiles: React.Dispatch<React.SetStateAction<FilePart[]>>,
  fileList: FileList | null,
  supportedFiles: Required<ModelConfiguration>["supportedFiles"]
) => {
  if (fileList) {
    for (const file of fileList) {
      if (
        (!supportedFiles.includes("img") && file.type.startsWith("image/")) ||
        (!supportedFiles.includes("pdf") && file.type === "application/pdf")
      ) {
        continue;
      }
      const filePart = await convertFileToDataURLs(file);
      setFiles((prevFiles) => [
        ...prevFiles,
        { ...filePart, loading: { percentage: 0 } },
      ]);
      const blobPromise = upload(file.name, file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: "/api/upload",
        onUploadProgress: ({ percentage }) => {
          setFiles((prevFiles) =>
            prevFiles.map((f) => {
              if (f.url === filePart.url) {
                return { ...f, loading: { percentage } };
              }
              return f;
            })
          );
        },
      });
      const blob = await blobPromise;
      setFiles((prevFiles) =>
        prevFiles.map((f) => {
          if (f.url === filePart.url) {
            return {
              url: blob.url,
              type: "file",
              filename: file.name,
              mediaType: file.type,
            };
          }
          return f;
        })
      );
    }
  }
};
