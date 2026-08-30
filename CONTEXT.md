# AI Chatbot

Asistente conversacional multi-modelo con proyectos, base de conocimiento por proyecto (RAG), memoria de usuario y un worker de coding agent. El chatbot es la aplicación; el coding agent es un worker HTTP que ejecuta tareas de código y habla el protocolo AG-UI.

## Language

### Chat y modelos

**Chat**:
Un hilo de conversación persistido: la unidad de interacción del usuario con un modelo.
_Avoid_: conversation, chat session

**Message**:
Una intervención dentro de un Chat, del usuario o del modelo, con partes (texto, razonamiento, herramientas).
_Avoid_: turn (reservado al coding agent), reply

**Chat Mode**:
Selector del comportamiento del prompt de un Chat (context7, RAG, búsqueda web).
_Avoid_: agent, assistant

**Model**:
Una entrada del Model Catalog.
_Avoid_: foundation model, LLM

**Model Configuration**:
Modelo + parámetros (temperatura, topP, topK) resueltos para un Chat o Project.
_Avoid_: model settings

**Project**:
Contenedor de configuración compartida: system prompt, defaults de modelo y Documents.
_Avoid_: workspace, repo (reservado a Repository)

**Model Catalog**:
Catálogo único de modelos disponibles, con sus providers, costes y niveles de thinking. Fuente de verdad en `packages/models`.
_Avoid_: model registry (legado), model list

**Model Router**:
Mecanismo que selecciona el modelo por mensaje cuando el usuario no fija uno.
_Avoid_: auto model, foundation model

**Compaction**:
Proceso que resume y descarta mensajes antiguos de un Chat cuando se llena la ventana de contexto.
_Avoid_: summarization, trimming

**Compaction Summary**:
Resumen materializado que reemplaza al tramo de mensajes descartado por la Compaction.
_Avoid_: summary (a secas), context summary

**Memory**:
Hecho recordado sobre el usuario que se inyecta en los chats.
_Avoid_: user profile, preference

**Extracted Memory**:
Memory inferida por el sistema a partir de las conversaciones.
_Avoid_: implicit memory

**Explicit Memory**:
Memory escrita directamente por el usuario.
_Avoid_: manual memory

**Attachment**:
Fichero adjunto a un Message. No forma parte de la Project Knowledge Base salvo que se ingeste como Document.
_Avoid_: file, upload

**Prompt Refiner**:
Reescritura automática del prompt del usuario antes de enviarlo, activable por Project.
_Avoid_: meta-prompt, prompt enhancer

**Hub**:
Panel que ejecuta varios chats en paralelo para compararlos.
_Avoid_: playground, multi-chat

**Hub Instance**:
Columna efímera del Hub (modelo + Chat Mode) que aún no es un Chat.
_Avoid_: hub chat, instance

**Image Editor**:
Feature que analiza y regenera una imagen del usuario.
_Avoid_: photo editor, inpainting (detalle técnico)

### Conocimiento (RAG)

**Document**:
Contenido ingestado (URL o markdown) que alimenta la búsqueda RAG.
_Avoid_: resource, knowledge item

**Project Knowledge Base**:
Conjunto de Documents asociados a un Project, sobre el que se realiza la búsqueda.
_Avoid_: corpus, knowledge base (a secas), library

**Parent Chunk**:
Fragmento grande de un Document que aporta contexto al recuperarse.
_Avoid_: chunk (a secas)

**Child Chunk**:
Fragmento pequeño de un Document que se embebe y es el que se busca.
_Avoid_: embedding chunk

**Hybrid Search**:
Búsqueda que combina Semantic Search y Keyword Search.
_Avoid_: vector search (a secas)

**Semantic Search**:
Búsqueda por similaridad de embeddings de Child Chunks.
_Avoid_: vector search, cosine search

**Keyword Search**:
Búsqueda léxica full-text sobre los Child Chunks.
_Avoid_: full-text search, tsvector search

**Rerank**:
Reordenación de los candidatos de la Hybrid Search por relevancia antes de devolverlos.
_Avoid_: reordering, scoring

**Similarity Threshold**:
Porcentaje mínimo de similitud para que un Child Chunk se devuelva.
_Avoid_: min score, cutoff

**Source**:
Cita mostrada en la UI que apunta al Document del que salió una respuesta.
_Avoid_: reference, citation

### English Helper

**English Helper**:
Asistente de traducción y gramática con clasificación previa del texto.
_Avoid_: english feature, translator

**Audience**:
Clasificación del destinatario previsto de un texto (público general, profesionales, equipo interno, partners, ejecutivos/inversores).
_Avoid_: reader, target

**Domain**:
Clasificación del área temática de un texto.
_Avoid_: topic, subject

**Direction**:
Par de idiomas origen→destino de una Translation.
_Avoid_: language pair, source/target languages

**Grammar Check**:
Corrección gramatical de un texto, con el texto corregido y las razones de cada cambio.
_Avoid_: proofread, correction

**Translation**:
Traducción de un texto aplicando las clasificaciones de Audience, Domain y Direction.
_Avoid_: translate (verbo), localization

### Coding Agent

**Coding Agent**:
Sistema que ejecuta tareas de edición de código sobre un Repository y reporta su progreso en un Chat. Abarca Coding Agent Worker y Coding Agent Client.
_Avoid_: code agent, Pi

**Coding Agent Worker**:
Proceso HTTP que gestiona Coding Agent Sessions: envuelve el runtime del SDK, expone /rpc y habla el protocolo AG-UI.
_Avoid_: backend, service, worker (a secas)

**Coding Agent Client**:
Código del chatbot que conecta la UI con el Coding Agent Worker. Se compone del Coding Agent UI y del Coding Agent Bridge.
_Avoid_: bridge o UI (a secas), proxy

**Coding Agent UI**:
Parte del Coding Agent Client que renderiza y gestiona el estado de las Coding Agent Sessions en el Chat: hooks, session store, skill commands.
_Avoid_: agent components

**Coding Agent Bridge**:
Parte del Coding Agent Client que transporta eventos AG-UI entre el Coding Agent Worker y el Coding Agent UI: rutas API y stream relay.
_Avoid_: relay, proxy

**Coding Agent Session**:
Sesión gestionada por el Coding Agent Worker y expuesta al usuario a través del Coding Agent Client: la suma de sus Turns, con estado entre ellos.
_Avoid_: agent session, run

**Turn**:
Un user message más todas las operaciones del asistente que responde (razonamiento, tools, respuestas textuales), hasta el siguiente user message.
_Avoid_: run (sinónimo protocolar: eventos RUN_* de AG-UI), step, model call

**Repository**:
Repositorio de código sobre el que opera una Coding Agent Session.
_Avoid_: project (reservado), repo path

**Subagent**:
Coding Agent Session hija, despachada para una tarea acotada.
_Avoid_: child session, generic worker

**Subagent Bridge**:
Mecanismo del Coding Agent Worker que conecta una Coding Agent Session con sus Subagents.
_Avoid_: bridge (a secas), collector

**Skill**:
Capacidad o conjunto de instrucciones cargable del Coding Agent, invocable por el usuario.
_Avoid_: extension, plugin

**Prompty**:
Plantilla parametrizable de prompt para el Coding Agent (formato .prompty). Plural: Prompties.
_Avoid_: prompt template, promptie (singular)

### Identidad y acceso

**User**:
Identidad con email y contraseña que posee Chats, Projects, Documents, Memories y Personal API Keys.
_Avoid_: account, customer

**Personal API Key**:
Credencial propia de un User para acceso programático a sus datos.
_Avoid_: API key (a secas), third-party key

**Built-in MCP Server**:
Servidor MCP incluido en el producto que expone la recuperación de la Project Knowledge Base a clientes externos autenticados con una Personal API Key.
_Avoid_: MCP server (a secas), knowledge server
