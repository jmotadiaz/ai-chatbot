// Public mock-builder surface for consumers' own test suites (`./testing`
// subpath). Ticket 03 owns creating this subpath and moving the
// language-model/embedding mock builders here; this file adds only the
// rerank fake ticket 04 needs, per the parallel-ticket convention (see
// `.scratch/inference-kit/issues/`) — a merge with 03's version unions the
// exports.
export { createMockRerankModel } from "./rerank";
