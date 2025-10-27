<a href="https://ai-sdk-starter-groq.vercel.app">
  <h1 align="center">Vercel x Groq Chatbot</h1>
</a>

<p align="center">
  An open-source AI chatbot app template built with Next.js, the AI SDK by Vercel, and Groq.
</p>

<p align="center">
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#deploy-your-own"><strong>Deploy Your Own</strong></a> ·
  <a href="#running-locally"><strong>Running Locally</strong></a> ·
  <a href="#authors"><strong>Authors</strong></a>
</p>
<br/>

## Features

- Streaming text responses powered by the [AI SDK by Vercel](https://sdk.vercel.ai/docs), allowing multiple AI providers to be used interchangeably with just a few lines of code.
- Built-in tool integration for extending AI capabilities (RAG document search, Web Search, URL content extraction).
- Reasoning model support.
- [shadcn/ui](https://ui.shadcn.com/) components for a modern, responsive UI powered by [Tailwind CSS](https://tailwindcss.com).
- Built with the latest [Next.js](https://nextjs.org) App Router.

## Deploy Your Own

You can deploy your own version to Vercel by clicking the button below:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?project-name=Vercel+x+Groq+Chatbot&repository-name=ai-sdk-starter-groq&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fai-sdk-starter-groq&demo-title=Vercel+x+Groq+Chatbot&demo-url=https%3A%2F%2Fai-sdk-starter-groq.labs.vercel.dev%2F&demo-description=A+simple+chatbot+application+built+with+Next.js+that+uses+Groq+via+the+AI+SDK+and+the+Vercel+Marketplace&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22ai%22%2C%22productSlug%22%3A%22api-key%22%2C%22integrationSlug%22%3A%22groq%22%7D%5D)

## Running Locally

1. Clone the repository and install dependencies:

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

2. Install the [Vercel CLI](https://vercel.com/docs/cli):

   ```bash
   npm i -g vercel
   # or
   yarn global add vercel
   # or
   pnpm install -g vercel
   ```

   Once installed, link your local project to your Vercel project:

   ```bash
   vercel link
   ```

   After linking, pull your environment variables:

   ```bash
   vercel env pull
   ```

   This will create a `.env.local` file with all the necessary environment variables.

3. Run the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

### Tool Configuration & Runtime Settings

The application exposes per-chat and per-project runtime configuration (no DB schema migration required for recent changes):

| Setting | Description | Range / Default | Applies When |
|---------|-------------|-----------------|--------------|
| Temperature | Sampling temperature for model output | 0.0 - 2.0 (default 0.5) | Always (if model supports it) |
| RAG Similarity % | Minimum cosine similarity (percentage) for retrieved chunks | 0 - 100 (default 60) | When RAG tool enabled |
| RAG Max Resources | Max number of RAG chunks/resources returned | 1 - 50 (default 5) | When RAG tool enabled |
| Web Search Results | Number of search results fetched | 1 - 10 (default 3) | When Web Search tool enabled |

Removed from the UI & runtime invocation: Top P and Top K (still optional nullable columns in DB for backward compatibility, but no longer passed to model calls).

### Environment Variables

Create / update `.env.local` with the following (only required if using the corresponding tool):

```bash
# Web Search (Exa)
EXASEARCH_API_KEY=your_exa_api_key
# Legacy name still accepted:
EXA_API_KEY=your_exa_api_key

# Other provider keys
OPENAI_API_KEY=...
GROQ_API_KEY=...
ANTHROPIC_API_KEY=...
GOOGLE_API_KEY=...
XAI_API_KEY=...
OPENROUTER_API_KEY=...
PERPLEXITY_API_KEY=...
```

If the Exa key is missing, Web Search gracefully returns an empty array and logs a warning instead of failing the build.

### Edge Cases & Validation

| Case | Handling |
|------|----------|
| Missing Exa API key | Tool disabled at runtime (warning logged) |
| RAG Similarity < 0 or > 100 | Clamped into [0,100] before converting to decimal threshold |
| Web Search Results out of range | Clamped into [1,10] |
| RAG Max Resources out of range | Clamped into [1,50] |
| Project/chat legacy Top P / Top K values | Ignored in new UI; not sent to models |

### Updating Configuration Programmatically

To adjust values in code for a chat session, pass them to `ChatProvider`:

```tsx
<ChatProvider
  temperature={0.7}
  ragSimilarityPercentage={70}
  ragMaxResources={8}
  webSearchNumResults={5}
  /* other props */
>
  <Chat />
</ChatProvider>
```

### Migration Notes

No new database migrations were applied for removing Top P / Top K usage. Existing nullable columns remain for backward compatibility and can be dropped later once historical data is no longer needed.

4. Open [http://localhost:3000](http://localhost:3000) to view your new AI chatbot application.

## Authors

This repository is maintained by the [Vercel](https://vercel.com) team and community contributors.

Contributions are welcome! Feel free to open issues or submit pull requests to enhance functionality or fix bugs.
