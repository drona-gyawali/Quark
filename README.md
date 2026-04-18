<p align="center">
<img width="246" height="73" alt="image" src="https://github.com/user-attachments/assets/6fe31791-471d-4fa8-bddc-9c6826911663" />

</p>
   


A high-performance RAG (Retrieval-Augmented Generation) system designed for deep document analysis and persistent context awareness. This project implements a sophisticated architecture that synchronizes unstructured text and image data, utilizing a dual-memory layer for a truly personalized chat experience.

---

<img width="1124" height="610" alt="image" src="https://github.com/user-attachments/assets/a54549e5-ddef-4392-bfeb-7b5fe8325d24" />

---

## Architecture Overview

Quark distinguishes itself through a multi-stage pipeline:

#### Multimodal Ingestion
* **Partitioning:** Leveraging `Unstructured.io` for semantic text decomposition and layout analysis.
* **Extraction:** Utilizing `pdfplumber` for precise image and table coordinate extraction.
* **Sync Layer:** A custom orchestration layer that aligns text and visual modalities for comprehensive multimodal embeddings.

#### Dual-Stream Memory
* **STM (Short-Term Memory):** Powered by **Redis**. Provides sub-millisecond access to rapid session-based context and transient state.
* **LTM (Long-Term Memory):** Powered by **Mem0**. Acts as a persistent intelligence layer that retains user history, evolving preferences, and long-form knowledge over time.

#### Core Intelligence & Retrieval
* **Embedding & Reranking:** Powered by **Voyage AI**, utilizing advanced rerankers and metadata filtering to maximize retrieval precision.
* **Vector Infrastructure:**  **Qudrant** handles high-dimensional vector storage alongside robust relational metadata.

#### Technical Stack
* **Web Framework:** [ElysiaJS](https://elysiajs.com/) — The high-performance, Bun-native framework for the backend.
* **Identity & DB:** [Supabase](https://supabase.com/) — Unified Auth and PostgreSQL backend.
* **Frontend:** [React](https://react.dev/) — A minimalist, streaming-responsive interface optimized for real-time AI interactions.
* **Worker(BullMQ + Redis):** — Persistent workers. Heavy I/O and compute offloaded. Scalability by design. Powered by BullMQ and Redis."
---

### Getting Started

Follow these steps to initialize and run the Quark-RAG system on your local machine.

### 1. Initialization
We provide a setup script to handle dependency installation and environment checks.

1.  **Grant execution permissions:**
    ```bash
    chmod +x setup.sh
    ```
2.  **Run the initializer:**
    ```bash
    ./setup.sh
    ```

### 2. Configure Environment Variables
Before  launching the cli, you must set up your credentials. inside a `.env` file in the root directory and populate it with your API keys

### 3. Launching the Ingestion worker in seperate process
```bash
npm run worker:ingestion
```

### 4. Launching the retrieval engine for query preprocessing and Database Action
```bash
npm run worker:chat
``` 

### 5. Launching the Frontend
Once the setup is complete, you can start chatting with your documents immediately via the  web interface.

```bash
cd frontend
npm install
npm run dev
```

> Interface

> <img width="1362" height="621" alt="image" src="https://github.com/user-attachments/assets/59b0c185-8de0-482b-b566-a34d350913ec" />

> <img width="1364" height="619" alt="image" src="https://github.com/user-attachments/assets/b1ffa57a-1a98-4196-9720-c90f2bc08c33" />

---

###  Summary 
This implementation follows a **Modular RAG** pattern. By decoupling the ingestion of images and text and re-syncing them at the metadata level, the system maintains higher contextual integrity than standard "text-only" pipelines. The integration of Redis and Mem0 mimics human cognitive functions by separating immediate recall from historical knowledge.

