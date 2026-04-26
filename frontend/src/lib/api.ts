import axios from "axios";
import { dbClient } from "./supabase";

export const PrivateApi = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
});

export const PublicApi = axios.create({
  baseURL: import.meta.env.VITE_BASE_URL,
});

PrivateApi.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await dbClient.auth.getSession();
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

export const s3Upload = async (url: string, file: File | null) => {
  try {
    if (file == null) {
      return false;
    }
    const sendFile = await axios.put(url, file);
    if (sendFile.status == 200) {
      return true;
    }
    return false;
  } catch (error) {
    throw error;
  }
};

interface uploadFile {
  filename: string;
  contentType: string;
  contentSize: number;
}

interface processFile {
  filename: string;
  session_id: string;
  key: string;
}

interface sessionProcess {
  label?: string;
}

export const signedUrl = async (meta: uploadFile) => {
  try {
    const _url = await PrivateApi.post("/ingest/upload/url", meta);
    return _url.data;
  } catch (error) {
    throw error;
  }
};

export const processFile = async (meta: processFile) => {
  try {
    const _fileState = await PrivateApi.post("/ingest/process", meta);
    if (_fileState.status == 202) {
      return _fileState.data;
    } else {
      return false;
    }
  } catch (error) {
    throw error;
  }
};

export const createSession = async (meta: sessionProcess) => {
  try {
    const _createSession = await PrivateApi.post("/session", meta);
    if (_createSession.status == 201) {
      return _createSession.data;
    }
    return false;
  } catch (error) {
    throw error;
  }
};

export const getSession = async () => {
  try {
    const getSession = await PrivateApi.get("/session");
    return getSession.data as [];
  } catch (error) {
    throw error;
  }
};

export const deleteSession = async (sessionId: string) => {
  try {
    const delSession = await PrivateApi.delete(`/session/${sessionId}`);
    return delSession.data;
  } catch (error) {
    throw error;
  }
};

export const patchSession = async (sessionId: string, meta: sessionProcess) => {
  try {
    const patchSession = await PrivateApi.patch(`/session/${sessionId}`, meta);
    return patchSession.data;
  } catch (error) {
    throw error;
  }
};

export const getIngestLog = async (ingestId: string) => {
  try {
    const _getLog = await PrivateApi.get(`/ingest/status/${ingestId}`);
    if (200 != _getLog.status) {
      return false;
    }
    return _getLog.data;
  } catch (error) {
    throw error;
  }
};

export interface ChatSignal {
  sessionId: string;
  message: string;
}

export const chatSignal = async (
  signal: ChatSignal,
  controller: AbortController,
  onChunk: (text: string) => void,
) => {
  const res = await PrivateApi.post("/chat/completions", signal, {
    responseType: "stream",
    headers: {
      Accept: "text/event-stream",
    },
    adapter: "fetch",
    signal: controller.signal,
  });

  if (!res.data) throw new Error("No stream");

  const reader = (res.data as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;

      const data = line.replace("data: ", "").trim();

      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);

        if (parsed.content) {
          onChunk(parsed.content);
        }
      } catch {
        // ignore partial JSON
      }
    }
  }
};

export const chatHistory = async (sessionId: string, page: number = 0) => {
  try {
    const res = await PrivateApi.get(`/chat/history/${sessionId}`, {
      params: {
        page: page,
      },
    });
    if (200 != res.status) {
      return false;
    }
    return res.data;
  } catch (error) {
    throw error;
  }
};

export const profile = async () => {
  try {
    const res = await PrivateApi.get(`/profile/me`);
    if (200 !== res.status) {
      return false;
    }
    return res.data;
  } catch (error) {
    throw error;
  }
};
