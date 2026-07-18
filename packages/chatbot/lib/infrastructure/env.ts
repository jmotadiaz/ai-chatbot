export const isTestMode = (): boolean =>
  process.env.NEXT_PUBLIC_ENV === "test";

export const isEvalMode = (): boolean =>
  process.env.NEXT_PUBLIC_ENV === "evals";

export const resolveEnvFile = (): string => {
  if (isTestMode()) return ".env.test";
  if (isEvalMode()) return ".env.evals";
  return ".env.development.local";
};
