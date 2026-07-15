# Debugging Workflow

**REQUIRED PAIR SKILL:** `superpowers:systematic-debugging` provides the four-phase discipline. This file maps those phases to trace-analyzer tools.

## Gate

State what you're looking for before each inspector command. No blind command runs.

## Phase Mapping

| systematic-debugging Phase | Trace Analyzer Action |
|---|---|
| **1. Root Cause Investigation** | Route → run initial inspector commands (`summary`/`errors`/`timeline`). Identify high-signal events from the route's reference file. |
| **2. Pattern Analysis** | Compare against known failure patterns in `references/`. Check reconnect invariants (Route A) or eval patterns (Route B). |
| **3. Hypothesis & Testing** | State hypothesis using reporting format below. Run targeted probe (`layer`/`stream`/`reconnect`). One variable at a time. |
| **4. Implementation** | Fix at source, not symptom. Verify with inspector that the broken invariant is resolved. |

## Reporting Format

```text
Broken invariant: [what should be true but isn't]
Evidence: [event names and compact payload facts]
Hypothesis: [why this is happening]
Next probe/fix: [smallest action to confirm or resolve]
```
