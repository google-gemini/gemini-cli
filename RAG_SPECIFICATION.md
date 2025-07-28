# Specification: `gemini labs rag` Command

This document provides a detailed specification for the `gemini labs rag` command, a feature that enables Retrieval-Augmented Generation (RAG) using a user's local file system.

## 1. Overview

The `gemini labs rag` feature will provide a suite of commands to create a local, persistent knowledge base from a directory of files and then chat with the Gemini model using that knowledge base for context.

This will involve two main commands:
- `gemini labs rag index`: To create or update the knowledge base.
- `gemini labs rag chat`: To interact with the knowledge base.

**Note on Technology Choice:** While Google now offers a managed Vertex AI RAG API, this feature will use a local-first approach with `LangChain.js` and a local vector store. This aligns with the goal of providing a tool that runs entirely on the user's machine, ensuring data privacy and offline capabilities.

## 2. Core Components & Technology

The implementation will be based on the `LangChain.js` library to orchestrate the different parts of the RAG pipeline.

- **File Loaders:** `LangChain.js` provides loaders for various file types. We will initially support plain text files (`.md`, `.txt`) and common source code files.
- **Text Splitter:** `RecursiveCharacterTextSplitter` from `LangChain.js` will be used to split documents into smaller chunks.
- **Embedding Model:** We will use the `gemini-embedding-001` model via the Gemini API to generate vector embeddings for the text chunks.
- **Vector Store:** `LanceDB` will be used as the local, file-based vector store. It's serverless, persists to disk, and has good integration with `LangChain.js`.
- **Retriever:** The vector store will be used to create a retriever that can find the most relevant document chunks for a given query.
- **Chat Logic:** A `ConversationalRetrievalQAChain` from `LangChain.js` will be used to manage the chat flow. It will combine chat history, the retrieved context, and the user's new question into a prompt for the Gemini model.

## 3. Detailed CLI Design

### `gemini labs rag index`

This command will be responsible for creating or updating the vector store.

**Usage:**
```bash
gemini labs rag index --source <PATH> --persist-directory <PATH>
```

**Options:**
- `--source <PATH>`: (Required) The path to the directory containing the source documents. The command will recursively scan this directory.
- `--persist-directory <PATH>`: (Required) The path where the `LanceDB` vector store will be created or updated.

**Process Flow:**
1. Validate that the `--source` and `--persist-directory` paths are provided and valid.
2. Recursively find all supported files in the `--source` directory.
3. For each file, use the appropriate `LangChain.js` document loader to load its content.
4. Use the `RecursiveCharacterTextSplitter` to split the loaded documents into chunks.
5. Use the Gemini embedding model to create vector embeddings for each chunk.
6. Initialize a `LanceDB` vector store at the `--persist-directory`.
7. Add the documents and their embeddings to the vector store. The store will be saved to disk automatically.
8. Display a confirmation message to the user indicating that the indexing is complete.

### `gemini labs rag chat`

This command will start an interactive chat session that uses the previously created vector store.

**Usage:**
```bash
gemini labs rag chat --persist-directory <PATH>
```

**Options:**
- `--persist-directory <PATH>`: (Required) The path to the existing `LanceDB` vector store.

**Process Flow:**
1. Validate that the `--persist-directory` path is provided and that a valid `LanceDB` store exists at that location.
2. Load the existing `LanceDB` vector store.
3. Initialize the Gemini chat model and the Gemini embedding model.
4. Create a `ConversationalRetrievalQAChain`. This chain will be configured with the vector store's retriever, the chat model, and memory to keep track of the conversation.
5. Start an interactive read-eval-print loop (REPL) for the chat.
6. For each user input:
    a. The `ConversationalRetrievalQAChain` will first retrieve relevant documents from the vector store based on the user's question and the chat history.
    b. It will then combine the retrieved context with the question and send it to the Gemini model.
    c. The model's response will be streamed to the console.
7. The chat session will continue until the user exits (e.g., by typing `/exit`).

## 4. Dependencies

The following new npm packages will be added:
- `langchain`
- `@langchain/community`
- `@langchain/core`
- `vectordb` (for LanceDB)
- `yargs` (already in use, and will be used for the new commands)

## 5. Implementation Plan

1. **Setup:** Add the new dependencies to `packages/cli/package.json`.
2. **Command Structure:** Create the file `packages/cli/src/labs/rag.ts` and define the `rag` command with its `index` and `chat` subcommands using `yargs`.
3. **Index Command Logic:** Implement the `index` command's action, following the process flow described above.
4. **Chat Command Logic:** Implement the `chat` command's action, following its process flow.
5. **Integration:** Wire up the new `ragCommand` to the main `gemini` command in `packages/cli/src/gemini.ts`.
6. **Testing:** Add unit and integration tests for the new commands.
7. **Documentation:** Update the CLI documentation to include the new `gemini labs rag` command.

## 6. Future Enhancements

- Support for more file types (e.g., PDF, DOCX).
- Automatic re-indexing by watching for file changes.
- Allow the user to configure the chunking strategy and other parameters.
- A command to delete or reset the vector store.
