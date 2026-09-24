/**
 * Historical reference for the retired routing confidence gate.
 *
 * Production no longer gates on confidence — whatever Jev decides is applied
 * as-is — so the routing policy does not read this. The mode-routing eval
 * reports still use it as the reference point of their threshold sweep over
 * raw classifier confidences.
 */
export const CHAT_MODE_ROUTING_CONFIDENCE_THRESHOLD = 0.7;
