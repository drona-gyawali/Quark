import { useState, useRef, useEffect, useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useInView } from "react-intersection-observer";
import { useChat } from "@/hooks/use-chat";
import TextareaAutosize from "react-textarea-autosize";
import {
  Send,
  Square,
  Bot,
  User,
  ArrowDown,
  Loader2,
  Copy,
  Check,
  Plus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useParams } from "react-router-dom";
import { chatHistory } from "@/lib/api";
import "highlight.js/styles/github-dark.css";
import { format } from "date-fns";
import { IngestModal } from "@/components/ingest-modal";
import { useProfile } from "@/hooks/use-profile";

export default function ChatPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  if (!sessionId)
    return <div className="p-10 text-center">Session ID required</div>;
  const { data: user } = useProfile();
  const [input, setInput] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isIngestOpen, setIsIngestOpen] = useState(false);

  const {
    data: historyData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingHistory,
  } = useInfiniteQuery({
    queryKey: ["chat-history", sessionId],
    queryFn: ({ pageParam = 0 }) => chatHistory(sessionId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.data.has_more ? lastPage.data.page + 1 : undefined,
  });

  const { data: activeMessages = [] } = useQuery({
    queryKey: ["chat", sessionId],
    initialData: [],
  });

  const { send, isLoading: isSending, stop } = useChat(sessionId);

  const { ref: topRef, inView } = useInView({ threshold: 0.1 });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const allMessages = useMemo(() => {
    const historyMessages =
      historyData?.pages
        .flatMap((page) => page.data.messages || [])
        .filter(Boolean) || [];

    const combined = [...historyMessages, ...activeMessages];

    combined.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    const seen = new Set<string>();
    return combined.filter((msg) => {
      const key = `${msg.created_at}-${msg.role}-${(msg.content || "").slice(0, 80)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [historyData, activeMessages]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior,
    });
  };

  useEffect(() => {
    if (activeMessages.length > 0) {
      scrollToBottom("auto");
    }
  }, [activeMessages]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setShowScrollButton(scrollHeight - scrollTop - clientHeight > 150);
  };

  const handleSend = () => {
    if (!input.trim() || isSending) return;
    send(input);
    setInput("");
  };

  const copyToClipboard = async (content: string, id: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-zinc-100">
      {/* Messages Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-6 scrollbar-modern"
      >
        <div className="max-w-3xl mx-auto w-full">
          {/* Load more indicator */}
          <div ref={topRef} className="h-16 flex items-center justify-center">
            {isFetchingNextPage && (
              <Loader2 className="animate-spin text-zinc-500" size={20} />
            )}
          </div>

          {/* Empty State */}
          {allMessages.length === 0 && !isLoadingHistory ? (
            <div className="flex flex-col items-center justify-center min-h-[65vh] text-center space-y-4">
              <div className="p-5 rounded-3xl bg-zinc-900 border border-zinc-800">
                <Bot size={52} className="text-zinc-400" />
              </div>
              <h2 className="text-2xl font-medium mt-2">
                How can I help you today?
              </h2>
            </div>
          ) : (
            allMessages.map((m: any, index: number) => {
              const isUser = m.role === "user";
              const messageId = m.created_at || `msg-${index}`;
              const isLastMessage = index === allMessages.length - 1;
              const isGenerating =
                isSending && !isUser && !m.content && isLastMessage;

              return (
                <div key={messageId} className="py-8 group">
                  <div
                    className={`flex gap-5 ${isUser ? "flex-row-reverse" : ""}`}
                  >
                    {/* Avatar */}
                    <div
                      className={`h-9 w-9 shrink-0 rounded-full overflow-hidden flex items-center justify-center border mt-1 ${
                        isUser
                          ? "bg-white text-black border-zinc-300"
                          : "bg-zinc-900 text-white border-zinc-700"
                      }`}
                    >
                      {isUser ? (
                        user?.avatar_url ? (
                          <img
                            src={user.avatar_url}
                            alt={user.display_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <User size={18} />
                        )
                      ) : (
                        <Bot size={18} />
                      )}
                    </div>

                    {/* Message Content */}
                    <div
                      className={`flex-1 ${isUser ? "text-right" : "text-left"}`}
                    >
                      <div
                        className={`text-[15.5px] leading-relaxed wrap-break ${
                          isUser
                            ? "bg-zinc-800 px-5 py-3.5 rounded-3xl rounded-tr-none inline-block max-w-[80%]"
                            : "prose prose-invert prose-zinc max-w-none"
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        ) : (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              a: ({ ...props }) => (
                                <a
                                  {...props}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:underline"
                                />
                              ),

                              // Code blocks
                              pre: ({ children }) => (
                                <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto text-sm my-4">
                                  {children}
                                </pre>
                              ),

                              code: ({
                                node,
                                className,
                                children,
                                ...props
                              }) => {
                                const isInline = !className;
                                if (isInline) {
                                  return (
                                    <code
                                      className="bg-zinc-800 px-1.5 py-0.5 rounded text-pink-400 font-mono text-[14.5px]"
                                      {...props}
                                    >
                                      {children}
                                    </code>
                                  );
                                }
                                return (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              },

                              ul: ({ children }) => (
                                <ul className="list-disc pl-6 my-4 space-y-2">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal pl-6 my-4 space-y-2">
                                  {children}
                                </ol>
                              ),

                              p: ({ children }) => (
                                <p className="my-3 leading-relaxed">
                                  {children}
                                </p>
                              ),

                              h1: ({ children }) => (
                                <h1 className="text-2xl font-semibold mt-6 mb-3">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-xl font-semibold mt-5 mb-2.5">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-lg font-medium mt-4 mb-2">
                                  {children}
                                </h3>
                              ),

                              blockquote: ({ children }) => (
                                <blockquote className="border-l-4 border-zinc-700 pl-4 py-1 my-4 text-zinc-400 italic">
                                  {children}
                                </blockquote>
                              ),

                              table: ({ children }) => (
                                <div className="my-4 overflow-x-auto">
                                  <table className="min-w-full border border-zinc-700">
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({ children }) => (
                                <th className="border border-zinc-700 px-4 py-2 bg-zinc-900 text-left">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="border border-zinc-700 px-4 py-2">
                                  {children}
                                </td>
                              ),
                            }}
                          >
                            {isGenerating
                              ? "**Quark AI** is in `beta version` so it can take time :)"
                              : !m.content
                                ? "**Network Error Occured! please try again later :(**"
                                : m.content}
                          </ReactMarkdown>
                        )}
                      </div>

                      {/* Timestamp and Copy Button */}
                      <div className="flex items-center gap-3 mt-2.5 text-xs text-zinc-500">
                        {m.created_at && (
                          <span>{format(new Date(m.created_at), "HH:mm")}</span>
                        )}

                        {!isUser && (
                          <button
                            onClick={() =>
                              copyToClipboard(m.content, messageId)
                            }
                            className="opacity-0 group-hover:opacity-100 hover:text-zinc-300 transition-all flex items-center gap-1"
                          >
                            {copiedId === messageId ? (
                              <Check size={15} className="text-emerald-400" />
                            ) : (
                              <Copy size={15} />
                            )}
                            <span className="text-[10px]">Copy</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Thinking / Generating Indicators */}
          {isSending && activeMessages.length === 0 && (
            <div className="py-8 flex gap-5">
              <div className="h-9 w-9 shrink-0 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                <Bot size={18} />
              </div>
              <div className="flex items-center gap-3 text-zinc-400">
                <Loader2 className="animate-spin" size={18} />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          )}

          {isSending && activeMessages.length > 0 && (
            <div className="py-6 flex gap-5">
              <div className="h-9 w-9 shrink-0 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center">
                <Bot size={18} />
              </div>
              <div className="text-zinc-400 text-sm flex items-center">
                <Loader2 className="animate-spin mr-2" size={16} />
                Generating response...
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4">
        <div className="max-w-3xl mx-auto relative">
          {showScrollButton && (
            <button
              onClick={() => scrollToBottom()}
              className="absolute -top-14 left-1/2 -translate-x-1/2 h-9 w-9 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center shadow-lg transition-all z-10"
            >
              <ArrowDown size={18} />
            </button>
          )}

          <div className="flex items-end gap-2 bg-[#0F0F0F] border border-zinc-800 focus-within:border-zinc-700 rounded-[28px] p-2 transition-all duration-300 shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <button
              onClick={() => setIsIngestOpen(true)}
              title="Add document"
              className=" h-10 w-10 cursor-pointer shrink-0 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-all mb-0.5 ml-0.5"
            >
              <Plus size={20} strokeWidth={2.5} />
            </button>
            <IngestModal open={isIngestOpen} setOpen={setIsIngestOpen} />

            <TextareaAutosize
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your docs..."
              minRows={1}
              maxRows={8}
              className="flex-1 bg-transparent py-3 px-1 focus:outline-none resize-none text-[15.5px] leading-relaxed placeholder-zinc-500 text-zinc-200 scrollbar-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />

            <div className="mb-0.5 mr-0.5">
              <button
                onClick={isSending ? stop : handleSend}
                disabled={!input.trim() && !isSending}
                className={`h-10 w-10 flex cursor-pointer items-center justify-center rounded-full transition-all duration-300 ${
                  isSending
                    ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                    : "bg-white text-black hover:bg-zinc-200 disabled:bg-zinc-900 disabled:text-zinc-700 shadow-md"
                }`}
              >
                {isSending ? (
                  <Square size={16} fill="currentColor" />
                ) : (
                  <Send
                    size={16}
                    className={
                      input.trim() ? "translate-x-0.5 -translate-y-0.5" : ""
                    }
                  />
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] text-zinc-500 mt-3">
            Quark is an AI and can make mistakes. Consider checking important
            info.
          </p>
        </div>
      </div>
    </div>
  );
}
