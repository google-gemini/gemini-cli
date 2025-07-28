# Specification: Minimalist Local RAG (`gemini labs rag`)

This document outlines a minimal, self-contained implementation for the `gemini labs rag` command, prioritizing the use of existing project dependencies and Google's own `@google/genai` library.

**Guiding Principles:**
- **Minimal Dependencies:** Avoid adding heavy libraries like `LangChain.js`.
- **Linear & Simple:** The process should be straightforward and easy to follow.
- **Leverage Existing Tools:** Use `@google/genai`, `glob`, and built-in Node.js modules.

**Cost Considerations:**
The `gemini-embedding-001` model is priced at $0.15 per 1M input tokens. Users should be mindful of potential costs when indexing very large directories. This information should be included in the command's help text.


---

## 1. CLI Structure (`yargs`)

The feature will be implemented using `yargs`, which is the existing CLI framework for this project.

### `gemini labs rag index`
Creates or overwrites a local vector store.

**Usage:**
```bash
gemini labs rag index --source <PATH> --persist-directory <PATH>
```
- `--source`: Directory of source files.
- `--persist-directory`: Directory where the vector store will be saved.

### `gemini labs rag chat`
Starts an interactive chat using an existing vector store.

**Usage:**
```bash
gemini labs rag chat --persist-directory <PATH>
```
- `--persist-directory`: Directory where the vector store is located.

---

## 2. Technical Implementation

### **Step 1: Indexing (`index` command)**

1.  **File Discovery:** Use the `glob` package (existing dependency) to recursively find all supported files (e.g., `.md`, `.txt`, `.ts`, `.py`) in the `--source` directory.
2.  **File Reading:** Use the built-in Node.js `fs/promises` module to read the content of each discovered file.
3.  **Text Chunking:**
    - Implement a custom, asynchronous `chunkText` function that is aware of the model's token limit.
    - **Token-Aware Splitting Strategy:**
        1. Start with an initial block of text (e.g., a whole file or a large paragraph).
        2. Use the `model.countTokens()` method from the `@google/genai` SDK to get an accurate token count for the block.
        3. If the token count is within the **2048 token limit**, the block is considered a valid chunk.
        4. If the token count exceeds the limit, the block must be split. It will be divided into smaller pieces (e.g., split by sentences or lines).
        5. Each new, smaller piece will then be passed recursively through this same process (check token count, then split if needed) until all resulting sub-chunks are under the token limit. This ensures no data is truncated and all text is indexed reliably.
4.  **Embedding Generation:**
    - For each text chunk, call the `embedContent` function from the `@google/genai` package to get its vector embedding.
    - To manage API rate limits and efficiency, process chunks in batches.
5.  **Vector Storage:**
    - Create a single JSON file, e.g., `vector_store.json`, inside the `--persist-directory`.
    - This file will contain an array of objects: `[{ chunk: string, embedding: number[] }]`.
    - This approach avoids adding a new database dependency.

### **Step 2: Chatting (`chat` command)**

1.  **Load Vector Store:** Read and parse the `vector_store.json` file from the `--persist-directory` into memory.
2.  **Implement Retriever:**
    - Create a custom `findSimilarChunks` function.
    - When a user asks a question, first generate an embedding for the question using `embedContent`.
    - **Cosine Similarity:** Implement a `cosineSimilarity` helper function to calculate the similarity between the user's question vector and each chunk's vector in the store.
    - The retriever will return the text of the top 3-5 chunks with the highest similarity scores.
3.  **Contextual Prompting:**
    - Construct a prompt for the final generation step. The prompt will include the retrieved chunks as context and the user's original question.
4.  **Content Generation:**
    - Call the `generateContent` function from `@google/genai` with the constructed prompt.
    - Stream the response back to the user in the interactive chat session.
5.  **Chat History (Optional, for follow-up questions):** For a more conversational experience, a simple in-memory array can store the last few turns of the conversation to be added to the prompt.

---

## 3. Dependencies

- **New Dependencies:** None. This plan is designed to work with the existing dependencies in the project.
- **Key Existing Dependencies:**
    - `@google/genai`
    - `glob`
    - `yargs`

---

## 4. Future Enhancements

- **Configurable Embedding Dimensions:** Leverage the model's Matryoshka Representation Learning (MRL) to allow users to select smaller embedding dimensions (e.g., 768 or 1536 instead of 3072) to trade off accuracy for performance and reduced storage.
- **Support for more file types (e.g., PDF, DOCX).**
- **Automatic re-indexing by watching for file changes.**
- **A command to delete or reset the vector store.**