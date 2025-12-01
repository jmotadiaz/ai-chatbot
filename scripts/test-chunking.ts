
import { generateHybridChunks } from "../lib/ai/rag/chunking";

async function test() {
  const text = `
# Title

This is a paragraph about authentication.

\`\`\`typescript
function login(user: User) {
  if (user.password === "secret") {
    return true;
  }
  return false;
}
\`\`\`

Another paragraph.
  `;

  console.log("--- Testing Hybrid Chunking ---");
  const chunks = await generateHybridChunks(text);
  console.log("Chunks:", JSON.stringify(chunks, null, 2));
}

test();
