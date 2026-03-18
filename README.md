
<p align="center">
  <img  width="397" height="175" alt="Screenshot_from_2026-03-18_17-22-09-removebg-preview"
src="https://github.com/user-attachments/assets/e688f6fe-6148-4166-8669-c1fc38139f32" />
</p>
   


A high-performance RAG (Retrieval-Augmented Generation) system designed for deep document analysis and persistent context awareness. This project implements a sophisticated architecture that synchronizes unstructured text and image data, utilizing a dual-memory layer for a truly personalized chat experience.

---

<img width="804" height="408" alt="image" src="https://github.com/user-attachments/assets/a9446ecb-dad4-43aa-a2d7-8f2260b7a738" />

## Architecture Overview

Quark distinguishes itself through a multi-stage pipeline:

* **Multimodal Ingestion:** Uses `Unstructured.io` for text partitioning and `pdfplumber` for precise image extraction. A custom **Sync Layer** aligns these modalities for comprehensive embedding.
* **Dual-Stream Memory:** 
    *  **Short-Term Memory (STM):** Powered by **Redis** for rapid session-based context.
    * **Long-Term Memory (LTM):** Powered by **Mem0** to retain user history and preferences over time.
* **Local Chat History:** All conversation logs are stored in a local **SQLite** database, ensuring your data stays on your system.
* **Interface:** A streamlined **CLI UI** for interacting with your documents.

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

### 3. Launching the CLI
Once the setup is complete, you can start chatting with your documents immediately via the terminal interface.

```bash
npm run cli
```
> Interface
> <img width="804" height="683" alt="image" src="https://github.com/user-attachments/assets/5e462f16-fc0c-4107-a9c0-e30a3597b75c" />
> <img width="1108" height="611" alt="image" src="https://github.com/user-attachments/assets/f30fb219-b474-41a6-afba-c8840df0a78a" />


---

###  Summary 
This implementation follows a **Modular RAG** pattern. By decoupling the ingestion of images and text and re-syncing them at the metadata level, the system maintains higher contextual integrity than standard "text-only" pipelines. The integration of Redis and Mem0 mimics human cognitive functions by separating immediate recall from historical knowledge.

