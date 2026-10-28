/**
 * Public surface of the English Helper workflows. Both entry points are
 * concrete: classification runs through `inferenceKit.decide` and generation
 * through `inferenceKit.languageModel` — there is no AI port or factory
 * parameter to inject a model (ADR 0013).
 */
export { correctGrammar, translate } from "./factory";
