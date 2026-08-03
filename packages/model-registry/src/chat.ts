import { MODEL_REGISTRY, type ModelRegistryKeys } from "./registry";

export const chatModelKeys = Object.values(MODEL_REGISTRY)
  .filter((m) => m.chatEnabled)
  .map((m) => m.id) as Array<Extract<ModelRegistryKeys, string>>;

export type chatModelId = (typeof chatModelKeys)[number];

export const CHAT_MODELS: chatModelId[] = [...chatModelKeys];

export const defaultModel: chatModelId = chatModelKeys[0];
