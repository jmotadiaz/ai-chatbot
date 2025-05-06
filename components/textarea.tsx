import { Textarea as ShadcnTextarea } from "@/components/ui/textarea";
import { ArrowUp, Settings, Plus, Minus } from "lucide-react";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface TextareaProps {
  input: string;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  status: string;
  stop: () => void;
  temperature: number;
  topP: number;
  topK: number;
  setTemperature: (value: number) => void;
  setTopP: (value: number) => void;
  setTopK: (value: number) => void;
}

const inRange =
  (min: number, max: number) =>
  (val: number): boolean =>
    !isNaN(val) && val >= min && val <= max;

export const Textarea = ({
  input,
  handleInputChange,
  isLoading,
  status,
  stop,
  temperature,
  topP,
  topK,
  setTemperature,
  setTopP,
  setTopK,
}: TextareaProps) => {
  const [showSettings, setShowSettings] = useState(false);
  return (
    <div className="relative w-full pt-4">
      <ShadcnTextarea
        className="resize-none bg-secondary w-full rounded-2xl pr-12 pt-4 pb-16"
        value={input}
        placeholder={"Say something..."}
        // @ts-expect-error err
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !isLoading) {
              // @ts-expect-error err
              const form = e.target.closest("form");
              if (form) form.requestSubmit();
            }
          }
        }}
      />

      {/* Settings icon and dropdown */}
      <button
        type="button"
        onClick={() => setShowSettings(!showSettings)}
        className="absolute left-1 bottom-1 p-3 cursor-pointer"
      >
        <Settings className="h-5 w-5 text-gray-800 dark:text-white" />
      </button>
      {showSettings && (
        <>
          {/* Overlay to close settings on outside click */}
          <div
            className="fixed inset-0 z-10 bg-transparent"
            onClick={() => setShowSettings(false)}
          />
          {/* Settings dropdown panel */}
          <div className="absolute left-2 bottom-32 w-64 bg-white dark:bg-zinc-800 p-4 rounded-lg shadow-lg z-20">
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="temperature">Temperatura</Label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const newVal = parseFloat((temperature - 0.1).toFixed(1));
                    setTemperature(Math.max(0, newVal));
                  }}
                  className="p-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                  aria-label="Decrease temperature"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <Input
                  id="temperature"
                  type="number"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (inRange(0, 1)(val)) {
                      setTemperature(val);
                    }
                  }}
                  className="w-16 text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newVal = parseFloat((temperature + 0.1).toFixed(1));
                    setTemperature(Math.min(1, newVal));
                  }}
                  className="p-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                  aria-label="Increase temperature"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="topP">Top P</Label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const newVal = parseFloat((topP - 0.01).toFixed(2));
                    setTopP(Math.max(0, newVal));
                  }}
                  className="p-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                  aria-label="Decrease top P"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <Input
                  id="topP"
                  type="number"
                  step="0.01"
                  value={topP}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (inRange(0, 1)(val)) {
                      setTopP(val);
                    }
                  }}
                  className="w-16 text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newVal = parseFloat((topP + 0.01).toFixed(2));
                    setTopP(Math.min(1, newVal));
                  }}
                  className="p-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                  aria-label="Increase top P"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="topK">Top K</Label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    const newVal = topK - 10;
                    setTopK(Math.max(0, newVal));
                  }}
                  className="p-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                  aria-label="Decrease top K"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <Input
                  id="topK"
                  type="number"
                  step="10"
                  value={topK}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (inRange(0, 100)(val)) {
                      setTopK(val);
                    }
                  }}
                  className="w-16 text-center"
                />
                <button
                  type="button"
                  onClick={() => {
                    const newVal = topK + 10;
                    setTopK(Math.min(100, newVal));
                  }}
                  className="p-1 bg-gray-200 dark:bg-zinc-700 rounded text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                  aria-label="Increase top K"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
      {status === "streaming" || status === "submitted" ? (
        <button
          type="button"
          onClick={stop}
          className="cursor-pointer absolute right-2 bottom-2 rounded-full p-2 bg-black hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors"
        >
          <div className="animate-spin h-4 w-4">
            <svg className="h-4 w-4 text-white" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        </button>
      ) : (
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="absolute right-2 bottom-2 rounded-full p-2 bg-black hover:bg-zinc-800 disabled:bg-zinc-300 disabled:dark:bg-zinc-700 dark:disabled:opacity-80 disabled:cursor-not-allowed transition-colors"
        >
          <ArrowUp className="h-4 w-4 text-white" />
        </button>
      )}
    </div>
  );
};
