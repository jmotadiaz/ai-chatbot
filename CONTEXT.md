# AI Chatbot

Multi-model conversational assistant with projects, per-project knowledge base (RAG), user memory and a coding agent worker. The chatbot is the application; the coding agent is an HTTP worker that executes code tasks and speaks the AG-UI protocol.

## Language

### Chats and models

**Chat**:
A persisted conversation thread: the unit of interaction between the user and a model.
_Avoid_: conversation, chat session

**Message**:
An intervention within a Chat, from the user or the model, with parts (text, reasoning, tools); the persisted unit of a Turn's history.
_Avoid_: reply

**Turn**:
The unit of interaction within a Chat or a Coding Agent Session: an initial user Message plus all the assistant operations that answer it, until it completes, stops or aborts. In a Chat it groups the Messages produced from one user intervention and admits no mid-turn injections. In a Coding Agent Session it is the execution unit of the Coding Agent Worker, admitting Pending Messages and Steerings injected while in flight.
_Avoid_: step, model call, run

**Background Generation**:
Generation of a Message that completes and persists server-side even when the client holding the in-flight Turn disconnects or is gone; returning clients reattach to the in-flight stream.
_Avoid_: detached stream

**Chat Mode**:
Selector for a Chat's prompt behaviour (`auto`, context7, RAG, web search). In `auto` the Chat Mode Router chooses per turn the *Resolved Chat Mode* used to answer (`context7`, `web` or the *neutral* branch, internal and tool-free) and records decision, latency and cost in `Message.metadata.chatModeRouting`.
_Avoid_: agent, assistant

**Model**:
An entry in the Model Catalog.
_Avoid_: foundation model, LLM

**Model Configuration**:
Model + parameters (temperature, topP, topK) resolved for a Chat or Project.
_Avoid_: model settings

**Project**:
Container of shared configuration: system prompt, model defaults and Documents.
_Avoid_: workspace, repo (reserved for Repository)

**Model Catalog**:
Single catalog of user-selectable Models, with their company, context window, costs, multimodal capabilities and thinking levels, exposed dynamically by the Model Gateway.
_Avoid_: model registry (legacy), static catalog, model list

**Compaction**:
Process that summarises and discards old messages of a Chat when the context window fills up.
_Avoid_: summarization, trimming

**Compaction Summary**:
Materialised summary that replaces the stretch of messages discarded by the Compaction.
_Avoid_: summary (bare), context summary

**Memory**:
A remembered fact about the user that is injected into chats.
_Avoid_: user profile, preference

**Extracted Memory**:
Memory inferred by the system from conversations.
_Avoid_: implicit memory

**Explicit Memory**:
Memory written directly by the user.
_Avoid_: manual memory

**Attachment**:
File attached to a Message. It is not part of the Project Knowledge Base unless it is ingested as a Document.
_Avoid_: file, upload

**Prompt Refiner**:
Automatic rewriting of the user's prompt before it is sent, enabled per Project.
_Avoid_: meta-prompt, prompt enhancer

**Hub**:
Panel that runs several chats in parallel so they can be compared.
_Avoid_: playground, multi-chat

**Hub Instance**:
Ephemeral Hub column (model + Chat Mode) that is not yet a Chat.
_Avoid_: hub chat, instance

**Image Editor**:
Feature that analyses and regenerates an image from the user.
_Avoid_: photo editor, inpainting (technical detail)

### Inference (Model Gateway)

**Model Gateway**:
Standalone infrastructure service that centralises access to all the foundation-model providers on the machine, custodies their credentials, serves the active Model Catalog and resolves the Default Model Contracts.
_Avoid_: AI gateway (bare, ambiguous with upstream providers), proxy, Inference Kit (retired)

**Default Model Contract**:
Stable model identifier exposed by the Model Gateway (`fast-default`, `flash-default`, `vision-default`, `reasoning-default`, `free-default`, `image-default`, `embedding-default`, `rerank-default`, `decision-default`, `tts-default`) for internal operations not selectable by the user.
_Avoid_: model role (retired), internal model, hardcoded model

**Decision**:
Inference operation that resolves one or more choice questions with a closed set of options and returns a generic provenance (choice, confidence, probabilities, modelId, provider, latency, cost) separate from the domain result of its consumer.
_Avoid_: routing decision, classification (a consumer's domain results, not this operation)

**Mock Model Gateway**:
HTTP server of the Test Environment that stands in for the Model Gateway through environment configuration, serving a Model Catalog defined directly by test capabilities and deterministic responses.
_Avoid_: mock registry, test mode flag, in-memory mock

### Knowledge (RAG)

**Document**:
Ingested content (URL or markdown) that feeds RAG search.
_Avoid_: resource, knowledge item

**Project Knowledge Base**:
Set of Documents associated with a Project, over which the search is performed.
_Avoid_: corpus, knowledge base (bare), library

**Parent Chunk**:
Large fragment of a Document that provides context when retrieved.
_Avoid_: chunk (bare)

**Child Chunk**:
Small fragment of a Document that is embedded and is the one that gets searched.
_Avoid_: embedding chunk

**Hybrid Search**:
Search that combines Semantic Search and Keyword Search.
_Avoid_: vector search (bare)

**Semantic Search**:
Search by similarity of Child Chunk embeddings.
_Avoid_: vector search, cosine search

**Keyword Search**:
Full-text lexical search over the Child Chunks.
_Avoid_: full-text search, tsvector search

**Rerank**:
Reordering of the Hybrid Search candidates by relevance before they are returned.
_Avoid_: reordering, scoring

**Similarity Threshold**:
Minimum similarity percentage for a Child Chunk to be returned.
_Avoid_: min score, cutoff

**Source**:
Citation shown in the UI that points to the Document an answer came from.
_Avoid_: reference, citation

### English Helper

**English Helper**:
Translation and grammar assistant with prior classification of the text.
_Avoid_: english feature, translator

**Audience**:
Classification of the intended recipient of a text (general public, professionals, internal team, partners, executives/investors).
_Avoid_: reader, target

**Domain**:
Classification of the subject area of a text, chosen from a closed set: software (development, devops, data/AI, security), legal, medical, finance, marketing and academic. It accepts "none of these", in which case the Domain does not take part.
_Avoid_: topic, subject, subdomain

**Direction**:
Source→target language pair of a Translation, limited to two fixed routes: Spanish→English (UK) and English→Spanish (Spain).
_Avoid_: language pair, source/target languages

**Grammar Check**:
Grammar correction of a text, with the corrected text and the reasons for each change.
_Avoid_: proofread, correction

**Translation**:
Translation of a text applying the Audience, Domain (when applicable) and Direction classifications.
_Avoid_: translate (verb), localization

### Coding Agent

**Coding Agent**:
System that executes code-editing tasks on a Repository and reports its progress in a Chat. It spans the Coding Agent Worker and the Coding Agent Client.
_Avoid_: code agent, Pi

**Coding Agent Worker**:
HTTP process that manages Coding Agent Sessions: it wraps the SDK runtime, exposes /rpc and speaks the AG-UI protocol.
_Avoid_: backend, service, worker (bare)

**Coding Agent Client**:
Chatbot code that connects the UI with the Coding Agent Worker. It is made up of the Coding Agent UI and the Coding Agent Bridge.
_Avoid_: bridge or UI (bare), proxy

**Coding Agent UI**:
Part of the Coding Agent Client that renders and manages the state of Coding Agent Sessions in the Chat: hooks, session store, skill commands.
_Avoid_: agent components

**Coding Agent Bridge**:
Part of the Coding Agent Client that transports AG-UI events between the Coding Agent Worker and the Coding Agent UI: API routes and stream relay.
_Avoid_: relay, proxy

**Coding Agent Session**:
Session managed by the Coding Agent Worker and exposed to the user through the Coding Agent Client: the sum of its Turns, with state between them.
_Avoid_: agent session, run


**Pending Message**:
Text instruction queued during a Turn and visible as a chip above the textarea. Editable, removable and promotable to a Steering.
_Avoid_: draft, local queue, followUp (SDK term)

**Steering**:
Promotion of a Pending Message so it is injected into the next request of the active Turn, without aborting the tools in flight.
_Avoid_: followUp (earlier phase), interruption, cancellation

**File Browser**:
View of the Coding Agent UI that lists and previews the files of a Repository: tree, uncommitted changes and per-file diff, with line comments.
_Avoid_: explorer, file explorer

**File Reference**:
Markdown link `file:ruta` that the Coding Agent emits to point at a file in the Repository; the File Browser turns it into navigation.
_Avoid_: file link, file reference

**Note Link**:
Markdown link relative to an `.md` file in the Repository (e.g. `[X](<../personas/Chus.md>)`), resolved against the directory of the file that contains it; the File Browser turns it into navigation. `[[...]]` wikilinks are not Note Links.
_Avoid_: wikilink, relative link (bare)

**Repository**:
Code repository on which a Coding Agent Session operates.
_Avoid_: project (reserved), repo path

**Subagent**:
Child Coding Agent Session, dispatched for a bounded task.
_Avoid_: child session, generic worker

**Subagent Bridge**:
Mechanism of the Coding Agent Worker that connects a Coding Agent Session with its Subagents.
_Avoid_: bridge (bare), collector

**Skill**:
Capability or set of instructions the Coding Agent can load, invocable by the user.
_Avoid_: extension, plugin

**Prompty**:
Parameterisable prompt template for the Coding Agent (.prompty format). Plural: Prompties.
_Avoid_: prompt template, promptie (singular)

### Execution Environments

**Environment**:
Isolated combination of database, Coding Agent runtime and typed configuration (`config.{prod,dev,test}.ts` + `secrets.{prod,dev,test}.ts`) that allows operating without interfering with another Environment, selected by a process argument (`--env=prod|dev|test`) or a bundler compile-time alias, with no inheritable environment variables.
_Avoid_: env, environment, stage, target

**Test Environment**:
Ephemeral Environment used exclusively for e2e tests, with its own database and an ephemeral Runtime Pi.
_Avoid_: test env, e2e env

**Development Environment**:
Persistent Environment for local development, with its own database, its own Runtime Pi and a pre-seeded Test User.
_Avoid_: dev env, local env

**Production Environment**:
Persistent Environment that serves real traffic, with its own database and its own Runtime Pi; it is the only one brought up via pm2 (`preview` command, ADR 0003).
_Avoid_: prod env, live env

**Runtime Pi**:
Directory and artifacts of the Pi SDK (agent dir, sessions, artifacts, models.json, auth.json, packages) that belong to an Environment. It is not shared between Environments.
_Avoid_: pi runtime (bare), agent dir (bare)

**Test User**:
Deterministic identity (`test@test.com` / `123456`) that exists only in the Test and Development Environments for local and e2e testing.
_Avoid_: seed user, mock user

**Build**:
Compilation and packaging phase for static artifacts (.next for the chatbot, dist/ for the worker) that applies exclusively to the Production Environment. The Development and Test Environments have no build phase (they compile JIT in memory).
_Avoid_: dev build, build:dev, dev bundle

### Identity and access

**User**:
Identity with email and password that owns Chats, Projects, Documents, Memories and Personal API Keys.
_Avoid_: account, customer

**Personal API Key**:
A User's own credential for programmatic access to their data.
_Avoid_: API key (bare), third-party key

**Built-in MCP Server**:
MCP server included in the product that exposes Project Knowledge Base retrieval to external clients authenticated with a Personal API Key.
_Avoid_: MCP server (bare), knowledge server
