import React, { useState, useEffect, useRef } from "react";
import { 
  FileText, 
  MessageSquare, 
  Settings, 
  Moon, 
  Sun, 
  Upload, 
  Search, 
  User, 
  Instagram, 
  Download, 
  Copy, 
  Mic, 
  BookOpen, 
  FileSearch, 
  Quote, 
  StickyNote,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Menu
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn, Message, PDFFile, Note } from "./types";
import { processPDF } from "./services/pdf";
import { streamChat, summarizePDF, generateCitation } from "./services/ai";
import { cropImage } from "./services/image";
import confetti from "canvas-confetti";

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [activeTab, setActiveTab] = useState<"chat" | "viewer" | "notes" | "about">("chat");
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [useGoogle, setUseGoogle] = useState(true);
  const [zoom, setZoom] = useState(0.8);
  const [currentPage, setCurrentPage] = useState(1);
  const [isSplitView, setIsSplitView] = useState(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scrollToPage = (pageNum: number) => {
    const pageElement = pageRefs.current[pageNum - 1];
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: "smooth", block: "center" });
      setCurrentPage(pageNum);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute("data-page") || "1");
            setCurrentPage(pageNum);
          }
        });
      },
      { threshold: 0.5 }
    );

    pageRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [selectedFileId, files]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles) return;

    setIsUploading(true);
    for (const file of Array.from(uploadedFiles)) {
      if (file.type !== "application/pdf") continue;
      
      try {
        const { text, images, chunks } = await processPDF(file);
        const newFile: PDFFile = {
          id: Math.random().toString(36).substr(2, 9),
          name: file.name,
          url: URL.createObjectURL(file),
          content: text,
          pages: images,
          chunks: chunks || []
        };
        setFiles(prev => [...prev, newFile]);
        if (!selectedFileId) setSelectedFileId(newFile.id);
        
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#06b6d4", "#0891b2", "#0e7490"]
        });
      } catch (error) {
        console.error("Error processing PDF:", error);
      }
    }
    setIsUploading(false);
  };

  const handleSendMessage = async (overrideInput?: string) => {
    const messageText = overrideInput || input;
    if (!messageText.trim() || isTyping) return;

    if (files.length === 0) {
      alert("Please upload a PDF document first so I can analyze it.");
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: messageText,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMessage]);
    if (!overrideInput) setInput("");
    setIsTyping(true);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: "",
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, assistantMessage]);

    const selectedFile = files.find(f => f.id === selectedFileId);
    const chunks = files.flatMap(f => f.chunks);
    const images = selectedFile ? selectedFile.pages : [];

    try {
      let fullContent = "";
      const stream = streamChat(messageText, chunks, images, useGoogle);
      for await (const chunk of stream) {
        fullContent += chunk;
        setMessages(prev => prev.map(m => 
          m.id === assistantMessage.id ? { ...m, content: fullContent } : m
        ));
      }

      // Parse snippets
      const snippetRegex = /\[SNIPPET: page=(\d+), y1=(\d+), y2=(\d+)\]/g;
      const snippets: string[] = [];
      let match;
      while ((match = snippetRegex.exec(fullContent)) !== null) {
        const pageNum = parseInt(match[1]);
        const y1 = parseInt(match[2]);
        const y2 = parseInt(match[3]);
        
        const file = files.find(f => f.id === selectedFileId);
        if (file && file.pages[pageNum - 1]) {
          try {
            const cropped = await cropImage(file.pages[pageNum - 1], { y1, y2 });
            snippets.push(cropped);
          } catch (e) {
            console.error("Error cropping snippet:", e);
          }
        }
      }
      
      if (snippets.length > 0) {
        setMessages(prev => prev.map(m => 
          m.id === assistantMessage.id ? { 
            ...m, 
            snippets,
            content: m.content.replace(/\[SNIPPET: page=\d+, y1=\d+, y2=\d+\]/g, "").trim()
          } : m
        ));
      }
    } catch (error: any) {
      console.error("Chat error:", error);
      const errorMessage = error.message || "";
      if (errorMessage.includes("403") || errorMessage.includes("permission")) {
        const retry = confirm("It seems there's a permission issue with the AI model. Would you like to select a different API key or try again?");
        if (retry && window.aistudio?.openSelectKey) {
          await window.aistudio.openSelectKey();
        }
      }
      setMessages(prev => prev.map(m => 
        m.id === assistantMessage.id ? { ...m, content: "Sorry, I encountered a permission error. Please ensure your API key is valid and has access to the Gemini models." } : m
      ));
    } finally {
      setIsTyping(false);
    }
  };

  const downloadConversation = () => {
    const content = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "conversation-summary.txt";
    a.click();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const startVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice recognition not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.start();
  };

  const handleSummarize = async () => {
    if (files.length === 0 || isTyping) return;
    setIsTyping(true);
    const context = files.map(f => f.content).join("\n\n");
    try {
      const summary = await summarizePDF(context);
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `### Document Summary\n\n${summary}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Summary error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const handleCitation = async () => {
    if (messages.length === 0 || isTyping) return;
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant");
    if (!lastAssistantMessage) return;

    setIsTyping(true);
    try {
      const citation = await generateCitation(lastAssistantMessage.content, selectedFile?.name || "Document");
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: `### Citations\n\n${citation}`,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Citation error:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const selectedFile = files.find(f => f.id === selectedFileId);

  return (
    <div className={cn(
      "flex h-screen w-full transition-colors duration-300",
      isDarkMode ? "bg-[#0a0a0a] text-white" : "bg-[#f5f5f5] text-gray-900"
    )}>
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="relative flex flex-col border-r border-white/10 overflow-hidden bg-[#111111]"
      >
        <div className="p-6 flex flex-col h-full">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <FileText className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">AI PDF <span className="text-cyan-500">Pro</span></h1>
            <div className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded-md">
              <span className="text-[8px] font-bold text-cyan-500 uppercase tracking-widest">Student Edition</span>
            </div>
          </div>

          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/10 mb-6"
          >
            <Upload size={18} />
            <span>Upload PDF</span>
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            multiple 
            accept=".pdf" 
            className="hidden" 
          />

          <div className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>My Documents</span>
              <span className="text-[10px] bg-white/5 px-1.5 py-0.5 rounded-md">{files.length}</span>
            </p>
            {files.map(file => (
              <button
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={cn(
                  "w-full p-3 rounded-lg flex items-center gap-3 transition-all text-left group",
                  selectedFileId === file.id ? "bg-cyan-500/10 text-cyan-500 border border-cyan-500/20" : "hover:bg-white/5 text-gray-400"
                )}
              >
                <FileText size={18} className={selectedFileId === file.id ? "text-cyan-500" : "text-gray-500"} />
                <span className="truncate text-sm font-medium">{file.name}</span>
              </button>
            ))}
            {files.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-gray-600">No documents uploaded yet</p>
              </div>
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-white/5 space-y-1">
            <div className="px-3 py-2 mb-2 bg-cyan-500/5 rounded-xl border border-cyan-500/10">
              <p className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider mb-1">Privacy First</p>
              <p className="text-[9px] text-gray-500 leading-tight">All PDFs remain in browser memory. No data is stored permanently.</p>
            </div>
            <button 
              onClick={() => setActiveTab("about")}
              className={cn(
                "w-full p-3 rounded-lg flex items-center gap-3 transition-all",
                activeTab === "about" ? "bg-white/10 text-white" : "text-gray-400 hover:bg-white/5"
              )}
            >
              <User size={18} />
              <span className="text-sm font-medium">About Developer</span>
            </button>
            <button 
              onClick={toggleTheme}
              className="w-full p-3 rounded-lg flex items-center gap-3 text-gray-400 hover:bg-white/5 transition-all"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              <span className="text-sm font-medium">{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0f0f0f]/80 backdrop-blur-md z-10">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400"
            >
              <Menu size={20} />
            </button>
            <div className="flex bg-white/5 p-1 rounded-xl">
              {[
                { id: "chat", icon: MessageSquare, label: "Chat" },
                { id: "viewer", icon: BookOpen, label: "Viewer" },
                { id: "split", icon: Maximize2, label: "Split View" },
                { id: "notes", icon: StickyNote, label: "Notes" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (tab.id === "split") {
                      setIsSplitView(!isSplitView);
                      setActiveTab("chat");
                    } else {
                      setActiveTab(tab.id as any);
                    }
                  }}
                  className={cn(
                    "px-4 py-1.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-all",
                    (activeTab === tab.id || (tab.id === "split" && isSplitView)) ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20" : "text-gray-400 hover:text-white"
                  )}
                >
                  <tab.icon size={16} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
              <span className="text-xs font-medium text-gray-400">Google Mode</span>
              <button 
                onClick={() => setUseGoogle(!useGoogle)}
                className={cn(
                  "w-10 h-5 rounded-full relative transition-all",
                  useGoogle ? "bg-cyan-500" : "bg-gray-700"
                )}
              >
                <div className={cn(
                  "absolute top-1 w-3 h-3 bg-white rounded-full transition-all",
                  useGoogle ? "left-6" : "left-1"
                )} />
              </button>
            </div>
            <button 
              onClick={downloadConversation}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400"
              title="Download Conversation"
            >
              <Download size={20} />
            </button>
            <button 
              onClick={() => {
                if (confirm("Clear all messages?")) setMessages([]);
              }}
              className="p-2 hover:bg-white/5 rounded-lg text-gray-400"
              title="Clear Chat"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* PDF Viewer Panel (Left side in split view) */}
          <div className={cn(
            "h-full flex flex-col bg-[#111111] border-r border-white/10 transition-all duration-500 overflow-hidden",
            isSplitView && selectedFile ? "w-1/2" : (activeTab === "viewer" ? "w-full" : "w-0 border-none")
          )}>
            <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-[#0f0f0f]">
              <div className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest">PDF Viewer</span>
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-2 py-1">
                  <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="p-1 hover:text-cyan-500"><ZoomOut size={14}/></button>
                  <span className="text-[10px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                  <button onClick={() => setZoom(z => Math.min(3, z + 0.1))} className="p-1 hover:text-cyan-500"><ZoomIn size={14}/></button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white/5 rounded-lg px-2 py-1">
                  <input 
                    type="number" 
                    min={1} 
                    max={selectedFile?.pages.length || 1}
                    value={currentPage}
                    onChange={(e) => scrollToPage(parseInt(e.target.value) || 1)}
                    className="w-8 bg-transparent text-[10px] font-mono text-center focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-500 font-mono">/ {selectedFile?.pages.length || 0}</span>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 flex flex-col items-center bg-[#1a1a1a] custom-scrollbar">
              {selectedFile ? (
                <div className="space-y-6">
                  {selectedFile.pages.map((page, i) => (
                    <div 
                      key={i} 
                      ref={el => { pageRefs.current[i] = el; }}
                      data-page={i + 1}
                      className="relative shadow-2xl group"
                    >
                      <img 
                        src={page} 
                        style={{ width: `${zoom * 1000}px` }} 
                        className="bg-white rounded-sm"
                        referrerPolicy="no-referrer"
                        onLoad={() => i === 0 && setCurrentPage(1)}
                      />
                      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md text-[10px] px-2 py-1 rounded-md text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        Page {i + 1}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-600">
                  <FileSearch size={48} className="mb-4 opacity-20" />
                  <p className="text-sm">No document selected</p>
                </div>
              )}
            </div>
          </div>

          {/* Chat Panel (Right side) */}
          <div className={cn(
            "h-full flex flex-col transition-all duration-500",
            isSplitView && selectedFile ? "w-1/2" : (activeTab === "viewer" ? "w-0 opacity-0 pointer-events-none" : "w-full")
          )}>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="w-20 h-20 bg-cyan-500/10 rounded-3xl flex items-center justify-center mb-6 animate-pulse">
                    <MessageSquare className="text-cyan-500" size={40} />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Welcome to AI PDF Pro</h2>
                  <p className="text-gray-500 text-sm">Upload a document and start asking questions. I can analyze text, detect diagrams, and even search Google for you.</p>
                  
                  <div className="grid grid-cols-2 gap-3 mt-8 w-full">
                    {[
                      "Summarize this document",
                      "Find key takeaways",
                      "Explain diagrams",
                      "Generate citations"
                    ].map(suggestion => (
                      <button 
                        key={suggestion}
                        onClick={() => {
                          if (files.length === 0) {
                            alert("Please upload a PDF document first.");
                            return;
                          }
                          handleSendMessage(suggestion);
                        }}
                        className="p-3 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-gray-400 transition-all"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-4 max-w-4xl mx-auto",
                    msg.role === "user" ? "flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                    msg.role === "user" ? "bg-cyan-500" : "bg-white/10 border border-white/10"
                  )}>
                    {msg.role === "user" ? <User size={16} /> : <FileText size={16} className="text-cyan-500" />}
                  </div>
                  <div className={cn(
                    "flex flex-col gap-2 max-w-[85%]",
                    msg.role === "user" ? "items-end" : ""
                  )}>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === "user" ? "bg-cyan-500 text-white" : "bg-white/5 border border-white/5"
                    )}>
                      <div className="markdown-body">
                        <Markdown
                          components={{
                            code({ node, inline, className, children, ...props }: any) {
                              const match = /language-(\w+)/.exec(className || "");
                              return !inline && match ? (
                                <div className="rounded-xl overflow-hidden my-4 border border-white/10 shadow-2xl">
                                  <div className="bg-white/5 px-4 py-2 border-b border-white/10 flex justify-between items-center">
                                    <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-widest">{match[1]}</span>
                                    <button 
                                      onClick={() => copyToClipboard(String(children).replace(/\n$/, ""))}
                                      className="text-gray-500 hover:text-cyan-500 transition-colors"
                                    >
                                      <Copy size={12} />
                                    </button>
                                  </div>
                                  <SyntaxHighlighter
                                    style={atomDark}
                                    language={match[1]}
                                    PreTag="div"
                                    customStyle={{
                                      margin: 0,
                                      padding: '1.5rem',
                                      fontSize: '0.85rem',
                                      background: 'transparent',
                                    }}
                                    {...props}
                                  >
                                    {String(children).replace(/\n$/, "")}
                                  </SyntaxHighlighter>
                                </div>
                              ) : (
                                <code className={cn("bg-white/10 px-1.5 py-0.5 rounded text-cyan-400 font-mono text-xs", className)} {...props}>
                                  {children}
                                </code>
                              );
                            },
                            strong({ node, children, ...props }: any) {
                              const text = String(children);
                              if (text.includes("Answer not found in uploaded")) {
                                return (
                                  <span className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 font-bold my-2">
                                    <X size={16} />
                                    {children}
                                  </span>
                                );
                              }
                              const pageMatch = text.match(/Page\s+(\d+)/i);
                              if (pageMatch) {
                                const pageNum = parseInt(pageMatch[1]);
                                return (
                                  <button 
                                    onClick={() => scrollToPage(pageNum)}
                                    className="text-cyan-400 font-bold hover:underline cursor-pointer"
                                    {...props}
                                  >
                                    {children}
                                  </button>
                                );
                              }
                              return <strong className="font-bold text-cyan-500" {...props}>{children}</strong>;
                            }
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      </div>
                    </div>

                    {msg.snippets && msg.snippets.length > 0 && (
                      <div className="mt-4 flex flex-col gap-4 max-w-full">
                        <div className="flex items-center gap-2 text-[10px] text-cyan-400 font-bold uppercase tracking-[0.2em] opacity-80">
                          <FileSearch size={14} className="text-cyan-500" />
                          <span>Document Reference</span>
                        </div>
                        <div className="grid gap-4">
                          {msg.snippets.map((snippet, idx) => (
                            <motion.div 
                              key={idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              onClick={() => setPreviewImage(snippet)}
                              className="rounded-2xl overflow-hidden border border-white/10 bg-[#0f0f0f] shadow-2xl group relative cursor-zoom-in"
                            >
                              <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent pointer-events-none" />
                              <img 
                                src={snippet} 
                                alt={`Reference ${idx + 1}`} 
                                className="w-full h-auto object-contain min-h-[80px] max-h-[500px] relative z-10"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute bottom-0 left-0 right-0 h-1 bg-cyan-500/20" />
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center gap-3 px-1">
                      <span className="text-[10px] text-gray-500 font-mono">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {msg.role === "assistant" && (
                        <div className="flex gap-2">
                          <button 
                            onClick={() => copyToClipboard(msg.content)}
                            className="text-gray-500 hover:text-cyan-500 transition-colors p-1"
                            title="Copy to clipboard"
                          >
                            <Copy size={12} />
                          </button>
                          <button 
                            onClick={() => {
                              const newNote: Note = {
                                id: Date.now().toString(),
                                title: `Note from ${new Date().toLocaleTimeString()}`,
                                content: msg.content,
                                timestamp: Date.now()
                              };
                              setNotes(prev => [newNote, ...prev]);
                              confetti({
                                particleCount: 50,
                                spread: 40,
                                origin: { y: 0.8 },
                                colors: ["#06b6d4"]
                              });
                            }}
                            className="text-gray-500 hover:text-cyan-500 transition-colors p-1"
                            title="Save to Notes"
                          >
                            <StickyNote size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-6 border-t border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md">
              <div className="max-w-4xl mx-auto relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  placeholder="Ask anything about the document..."
                  disabled={isTyping}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 pr-14 text-sm focus:outline-none focus:border-cyan-500/50 transition-all disabled:opacity-50"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!input.trim() || isTyping}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl transition-all disabled:opacity-50 disabled:hover:bg-cyan-500"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <p className="text-[10px] text-center text-gray-600 mt-4">
                AI can make mistakes. Verify important information. Powered by Gemini 3.1
              </p>
            </div>
          </div>

          {/* Notes Panel */}
          <AnimatePresence>
            {activeTab === "notes" && (
              <motion.div 
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                className="flex-1 flex flex-col bg-[#111111] border-l border-white/10 p-6"
              >
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <StickyNote className="text-cyan-500" />
                    AI Notes Maker
                  </h2>
                  <button 
                    onClick={() => setActiveTab("chat")}
                    className="p-2 hover:bg-white/5 rounded-xl text-gray-400"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 overflow-y-auto flex-1 custom-scrollbar pr-2">
                  {notes.length === 0 && (
                    <div className="text-center py-20 bg-white/5 rounded-2xl border border-dashed border-white/10">
                      <p className="text-sm text-gray-500">Ask AI to "Save this as a note" or create one manually.</p>
                      <button 
                        onClick={() => setNotes([{ id: '1', title: 'New Research Note', content: 'Start typing your findings here...', timestamp: Date.now() }])}
                        className="mt-4 px-4 py-2 bg-cyan-500/10 text-cyan-500 rounded-lg text-xs font-bold hover:bg-cyan-500/20 transition-all"
                      >
                        + Create First Note
                      </button>
                    </div>
                  )}
                  {notes.map(note => (
                    <div key={note.id} className="p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-cyan-500/30 transition-all group">
                      <div className="flex justify-between items-start mb-2">
                        <input 
                          className="bg-transparent font-bold text-sm focus:outline-none w-full" 
                          value={note.title}
                          onChange={(e) => setNotes(prev => prev.map(n => n.id === note.id ? { ...n, title: e.target.value } : n))}
                        />
                        <button 
                          onClick={() => setNotes(prev => prev.filter(n => n.id !== note.id))}
                          className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-500 transition-all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <textarea 
                        className="bg-transparent text-xs text-gray-400 w-full h-32 resize-none focus:outline-none leading-relaxed"
                        value={note.content}
                        onChange={(e) => setNotes(prev => prev.map(n => n.id === note.id ? { ...n, content: e.target.value } : n))}
                      />
                      <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/5">
                        <span className="text-[10px] text-gray-600">{new Date(note.timestamp).toLocaleDateString()}</span>
                        <div className="flex gap-2">
                          <button className="p-1.5 hover:bg-white/5 rounded text-gray-500"><Download size={12}/></button>
                          <button className="p-1.5 hover:bg-white/5 rounded text-gray-500"><Copy size={12}/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* About Panel */}
          <AnimatePresence>
            {activeTab === "about" && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-[#0a0a0a]/95 backdrop-blur-xl flex items-center justify-center p-6"
              >
                <div className="max-w-2xl w-full bg-[#111111] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="h-32 bg-gradient-to-r from-cyan-500 to-blue-600 relative">
                    <button 
                      onClick={() => setActiveTab("chat")}
                      className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 rounded-full text-white transition-all"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="px-8 pb-8 -mt-12">
                    <div className="w-24 h-24 rounded-2xl bg-white p-1 shadow-xl mb-6">
                      <img 
                        src="https://picsum.photos/seed/dev/200/200" 
                        className="w-full h-full rounded-xl object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <h2 className="text-3xl font-bold mb-1">abhishek halasagi</h2>
                    <p className="text-cyan-500 font-medium mb-6">Expert AI Engineer & PDF Specialist</p>
                    
                    <div className="space-y-6 text-gray-400 text-sm leading-relaxed">
                      <p>
                        Passionate about building intelligent applications that bridge the gap between complex AI models and intuitive user experiences. Specialized in React, Node.js, and Generative AI integration.
                      </p>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                            <Settings size={16} className="text-cyan-500" />
                            Core Skills
                          </h3>
                          <ul className="space-y-1 text-xs">
                            <li>• React & Next.js</li>
                            <li>• Generative AI (Gemini, GPT)</li>
                            <li>• UI/UX Design (Figma)</li>
                            <li>• Cloud Infrastructure</li>
                          </ul>
                        </div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                          <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                            <BookOpen size={16} className="text-cyan-500" />
                            Education
                          </h3>
                          <p className="text-xs">Computer Science Engineering</p>
                          <p className="text-[10px] mt-2">Focused on Artificial Intelligence and Machine Learning.</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 pt-4">
                        <a 
                          href="https://www.instagram.com/_mr__abhi__10" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-bold hover:scale-105 transition-all"
                        >
                          <Instagram size={20} />
                          <span>Follow on Instagram</span>
                        </a>
                        <button 
                          onClick={() => window.location.href = "mailto:baijaggu36@gmail.com"}
                          className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-all"
                        >
                          <MessageSquare size={20} />
                          <span>Contact Me</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewImage(null)}
            className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 cursor-zoom-out"
          >
            <motion.img 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={previewImage} 
              className="max-w-full max-h-full rounded-xl shadow-2xl"
              referrerPolicy="no-referrer"
            />
            <button 
              onClick={() => setPreviewImage(null)}
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-all"
            >
              <X size={24} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .markdown-body {
          font-family: inherit;
        }
        .markdown-body p {
          margin-bottom: 1rem;
        }
        .markdown-body p:last-child {
          margin-bottom: 0;
        }
        .markdown-body strong {
          color: #06b6d4;
        }
        .markdown-body code {
          background: rgba(255, 255, 255, 0.1);
          padding: 0.2rem 0.4rem;
          border-radius: 0.3rem;
          font-size: 0.85em;
        }
      `}</style>
    </div>
  );
}
