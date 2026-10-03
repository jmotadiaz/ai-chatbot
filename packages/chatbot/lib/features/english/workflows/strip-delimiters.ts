import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";
import type { Delimiter } from "./utils";

// ─── Delimiter stripping ─────────────────────────────────────────────────────
//
// The model sometimes echoes the delimiter wrapper back in its output
// ("«hola»" instead of "hola"). Instead of hardening the prompt further, the
// generation stream is rewritten on the fly: the chosen pair is dropped once,
// at the head and at the tail, and everything else passes through untouched.
//
// Two properties matter:
//   - only the chosen pair, only at the edges: `pickDelimiter` tolerates a
//     stray opening marker in the text, so a `«` inside the output can be
//     legitimate content;
//   - chunk-boundary safety: text deltas are arbitrary slices, so the closing
//     marker (and any trailing whitespace that would hide it) is held back
//     until it can no longer be the start of the wrapper.

export const stripDelimiters =
  <TOOLS extends ToolSet>(
    delimiter: Delimiter | null,
  ): StreamTextTransform<TOOLS> =>
  () => {
    if (delimiter === null) {
      return new TransformStream<
        TextStreamPart<TOOLS>,
        TextStreamPart<TOOLS>
      >();
    }

    const { open, close } = delimiter;
    let atHead = true;
    let pending = "";
    let lastDelta: Extract<
      TextStreamPart<TOOLS>,
      { type: "text-delta" }
    > | null = null;

    const emit = (
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
      text: string,
    ) => {
      if (text.length > 0 && lastDelta !== null) {
        controller.enqueue({ ...lastDelta, text });
      }
    };

    /**
     * Emits everything that can no longer be part of the trailing wrapper.
     * The hold window is the closing marker plus any run of trailing
     * whitespace after it, so `texto»\n` still ends up as `texto`. On
     * `final`, the held suffix is the end of the generation: drop the closing
     * marker (and the whitespace around it) if it is there.
     */
    const drain = (
      controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>,
      final: boolean,
    ) => {
      if (final) {
        const trimmed = pending.replace(/\s+$/, "");
        emit(
          controller,
          trimmed.endsWith(close) ? trimmed.slice(0, -close.length) : pending,
        );
        pending = "";
        return;
      }

      const trimmedLength = pending.replace(/\s+$/, "").length;
      const cut = Math.max(trimmedLength - close.length, 0);
      if (cut > 0) {
        emit(controller, pending.slice(0, cut));
        pending = pending.slice(cut);
      }
    };

    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "text-delta") {
          lastDelta = part;
          let buffer = pending + part.text;
          pending = "";

          if (atHead) {
            const rest = buffer.replace(/^\s*/, "");
            if (rest.length < open.length && open.startsWith(rest)) {
              // the opening marker may still be arriving
              pending = buffer;
              return;
            }
            buffer = rest.startsWith(open) ? rest.slice(open.length) : buffer;
            atHead = false;
          }

          pending = buffer;
          drain(controller, false);
          return;
        }

        if (part.type === "text-end") {
          // flush before the block closes so no text lands after `text-end`
          drain(controller, true);
        }
        controller.enqueue(part);
      },
      flush(controller) {
        drain(controller, true);
      },
    });
  };
