// packages/chatbot/components/code/prompt-form-modal.tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PromptSummary, PromptInput, SessionSummary } from "@/lib/features/code/worker-client";

interface PromptFormModalProps {
  prompt: PromptSummary;
  sessionId: string;
  sessions: SessionSummary[];
  open: boolean;
  onClose: () => void;
  onInsert: (text: string) => void;
}

export const PromptFormModal: React.FC<PromptFormModalProps> = ({
  prompt,
  sessionId,
  sessions,
  open,
  onClose,
  onInsert,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const defaults: Record<string, string> = {};
      for (const input of prompt.inputs) {
        if (input.default) defaults[input.name] = input.default;
      }
      setValues(defaults);
      setError(null);
    }
  }, [open, prompt.inputs]);

  if (!open) return null;

  const handleChange = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsResolving(true);

    try {
      const res = await fetch(
        `/api/agent/code/sessions/${encodeURIComponent(sessionId)}/prompts/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ promptName: prompt.name, values }),
        },
      );
      const data = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to resolve prompt");
        setIsResolving(false);
        return;
      }
      onInsert(data.text ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setIsResolving(false);
    }
  };

  const isSubmitDisabled = prompt.inputs.some(
    (i) => i.required && !values[i.name],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-popover rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto mx-4">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">{prompt.name}</h2>
            <p className="text-sm text-muted-foreground">{prompt.description}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          {prompt.inputs.map((input) => (
            <PromptFormField
              key={input.name}
              input={input}
              value={values[input.name] ?? ""}
              sessions={sessions}
              onChange={(v) => handleChange(input.name, v)}
            />
          ))}

          {error && <div role="alert" className="text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitDisabled || isResolving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {isResolving ? "Inserting…" : "Insert"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PromptFormFieldProps {
  input: PromptInput;
  value: string;
  sessions: SessionSummary[];
  onChange: (value: string) => void;
}

const PromptFormField: React.FC<PromptFormFieldProps> = ({ input, value, sessions, onChange }) => {
  if (input.kind === "string" && input.enumValues && input.enumValues.length > 0) {
    return (
      <label className="block">
        <span className="text-sm font-medium">
          {input.description}
          {input.required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        <select value={value} onChange={(e) => onChange(e.target.value)} required={input.required}
          className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800">
          <option value="">Select…</option>
          {input.enumValues.map((v) => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </label>
    );
  }

  if (input.kind === "session") {
    return (
      <label className="block">
        <span className="text-sm font-medium">
          {input.description}
          {input.required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
        {sessions.length === 0 ? (
          <span className="mt-1 block text-sm text-muted-foreground">
            No hay sessions con label disponibles
          </span>
        ) : (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={input.required}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800"
          >
            <option value="">Seleccionar…</option>
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </label>
    );
  }

  return (
    <label className="block">
      <span className="text-sm font-medium">
        {input.description}
        {input.required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={input.placeholder} required={input.required}
        className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm dark:bg-zinc-800" />
    </label>
  );
};
