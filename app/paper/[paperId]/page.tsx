'use client'; // Needed for hooks and interactivity

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation'; // Hook to get dynamic route params
import Link from 'next/link';

// Import Resizable components
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

// --- react-pdf Imports ---
import { pdfjs, Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css'; // Try non-esm path
import 'react-pdf/dist/Page/TextLayer.css'; // Try non-esm path

// Set workerSrc for pdfjs (needed by react-pdf)
// Use the CDN version for simplicity in Next.js App Router
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// --- Interfaces ---
interface PaperMetadata {
    title?: string;
    pdfUrl?: string;
    // Add other fields later if needed
}
interface ChatMessage {
    sender: 'user' | 'ai';
    text: string;
}

export default function PaperPage() {
  const params = useParams(); // Get route parameters
  const paperId = params.paperId as string; // Extract paperId

  const [metadata, setMetadata] = useState<PaperMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --- PDF Viewer State ---
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  // --- Chat State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiResponding, setIsAiResponding] = useState(false);
  const [contextUsage, setContextUsage] = useState<number>(0);
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [promptTokens, setPromptTokens] = useState<number>(0);
  
  // --- Right Panel Tab State ---
  const [activeTab, setActiveTab] = useState<'chat' | 'notes' | 'comments' | 'similar'>('chat');

  // --- Track visible page using IntersectionObserver ---
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number') || '1');
            setCurrentPage(pageNum);
          }
        });
      },
      {
        threshold: 0.5,
      }
    );

    Object.values(pageRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [numPages]);

  // --- Fetch Paper Metadata from API ---
  useEffect(() => {
    async function fetchMetadata() {
      if (!paperId) {
        setError("Paper ID not found in URL.");
        setIsLoading(false);
        return;
      }

      console.log("Fetching metadata for paper:", paperId);
      
      try {
        const response = await fetch(`/api/papers/${paperId}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch metadata: ${response.status}`);
        }

        const data = await response.json();
        
        setMetadata({
          title: data.title || `Title for ${paperId}`,
          pdfUrl: data.pdfUrl || `/pdfs/${paperId}.pdf`
        });
      } catch (err: any) {
        console.error("Error fetching paper metadata:", err);
        setMetadata({
          title: `Title for ${paperId}`,
          pdfUrl: `/pdfs/${paperId}.pdf`
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchMetadata();
  }, [paperId]); // Re-run if paperId changes

  // --- PDF Load Handler ---
   function onDocumentLoadSuccess({ numPages: nextNumPages }: { numPages: number }): void {
     setNumPages(nextNumPages);
     console.log(`PDF loaded successfully with ${nextNumPages} pages.`);
   }

// --- Handle Chat Submission (Real API Call) ---
const handleChatSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputMessage.trim() || isAiResponding) return;
  
    const newUserMessage: ChatMessage = { sender: 'user', text: inputMessage };
    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');
    setIsAiResponding(true);
    setError(null);
  
    try {
      // 1. Call the backend RAG API route
      const response = await fetch('/api/chat/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paperId: paperId, message: newUserMessage.text }),
      });
  
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }
  
      // 2. Extract the AI response and usage data from the JSON body
      const responseData = await response.json();
      const aiResponseText = responseData.response || "Sorry, I couldn't generate a response.";
      
      // 3. Update token usage if available from OpenRouter
      if (responseData.usage) {
          const { prompt_tokens, total_tokens } = responseData.usage;
          setPromptTokens(prompt_tokens || 0);
          setTotalTokens(total_tokens || 0);
          
          // Calculate context usage percentage based on model context limit
          // Most models have different limits, but we'll use a common baseline
          // GPT-4o-mini has 128k context, Gemini Flash has 1M, but let's use a reasonable estimate
          const contextLimit = 128000; // tokens (adjust based on actual model being used)
          const usagePercent = Math.min(Math.round((prompt_tokens / contextLimit) * 100), 100);
          setContextUsage(usagePercent);
          
          console.log('Token usage:', responseData.usage);
      }
  
      // 4. Add the real AI response to the chat state
      const aiResponse: ChatMessage = { sender: 'ai', text: aiResponseText };
      setMessages(prev => [...prev, aiResponse]);
  
    } catch (e: any) {
      console.error('Chat API Error:', e);
      // Add a system error message to the chat
      setMessages(prev => [...prev, {
          sender: 'ai',
          text: `System Error: Failed to get response. Details: ${e.message}`
      }]);
    } finally {
      setIsAiResponding(false);
    }
  };

  // --- Render Logic ---
  if (isLoading) return <div className="p-4">Loading paper...</div>;
  // Show specific PDF loading error or general error
  if (error && !error.startsWith("Failed to load PDF")) return <div className="p-4 text-red-600">Error: {error} <Link href="/" className="underline">Go Home</Link></div>;
  if (!metadata || !metadata.pdfUrl) return <div className="p-4">Paper data not found. <Link href="/" className="underline">Go Home</Link></div>;


  return (
    <div className="h-screen flex flex-col">
       {/* Header */}
       <header className="border-b p-2 px-4 flex items-center justify-between">
            <Link href="/" className="text-sm underline"> &lt; Back to Search</Link>
            <h1 className="text-lg font-semibold truncate px-4">{metadata.title || `Paper ${paperId}`}</h1>
            <div>{/* Placeholder for other controls */}</div>
       </header>

       <ResizablePanelGroup direction="horizontal" className="flex-1 border">
         {/* Left Panel: PDF Viewer */}
         <ResizablePanel defaultSize={60}>
           <div className="flex flex-col h-full items-center justify-start p-2 relative">
             <div className="flex-1 w-full overflow-y-auto border rounded">
               <Document
                 file={metadata.pdfUrl}
                 onLoadSuccess={onDocumentLoadSuccess}
                 onLoadError={(pdfError) => {
                     console.error("PDF Load Error:", pdfError);
                     setError(`Failed to load PDF: ${pdfError.message}. Check if the file exists at ${metadata.pdfUrl}`);
                     setNumPages(null);
                 }}
                 className="flex flex-col items-center gap-4 p-4"
                 loading={<p>Loading PDF...</p>}
               >
                 {numPages && Array.from(new Array(numPages), (el, index) => (
                   <div
                     key={`page_${index + 1}`}
                     ref={(el) => (pageRefs.current[index + 1] = el)}
                     data-page-number={index + 1}
                   >
                     <Page
                       pageNumber={index + 1}
                       renderTextLayer={true}
                       renderAnnotationLayer={false}
                       width={typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.55, 800) : undefined}
                     />
                   </div>
                 ))}
               </Document>
             </div>
             {error && error.startsWith("Failed to load PDF") && <p className="text-red-600 text-sm mt-2">{error}</p>}
             
             {/* Page Indicator */}
             {numPages && (
               <div className="absolute bottom-4 right-4 bg-background/90 border border-border rounded-lg px-3 py-2 text-sm shadow-lg">
                 Page {currentPage} of {numPages}
               </div>
             )}
           </div>
         </ResizablePanel>

         <ResizableHandle withHandle />

         {/* Right Panel: Tabs */}
         <ResizablePanel defaultSize={40}>
           <div className="flex flex-col h-full">
             {/* Tab Navigation */}
             <div className="flex border-b">
               <button
                 onClick={() => setActiveTab('chat')}
                 className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                   activeTab === 'chat'
                     ? 'border-b-2 border-foreground'
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
               >
                 Chat
               </button>
               <button
                 onClick={() => setActiveTab('notes')}
                 className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                   activeTab === 'notes'
                     ? 'border-b-2 border-foreground'
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
               >
                 Notes
               </button>
               <button
                 onClick={() => setActiveTab('comments')}
                 className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                   activeTab === 'comments'
                     ? 'border-b-2 border-foreground'
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
               >
                 Comments
               </button>
               <button
                 onClick={() => setActiveTab('similar')}
                 className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                   activeTab === 'similar'
                     ? 'border-b-2 border-foreground'
                     : 'text-muted-foreground hover:text-foreground'
                 }`}
               >
                 Similar
               </button>
             </div>

             {/* Tab Content */}
             {activeTab === 'chat' && (
               <div className="flex flex-col flex-1 overflow-hidden p-2">
                 <div className="flex-1 overflow-y-auto space-y-4 p-2">
                   {messages.map((msg, index) => (
                     <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                       <div className={`rounded-lg px-3 py-2 max-w-[80%] ${msg.sender === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                         <p className="whitespace-pre-wrap">{msg.text}</p>
                       </div>
                     </div>
                   ))}
                   {isAiResponding && (
                     <div className="flex justify-start">
                       <div className="rounded-lg px-3 py-2 bg-muted animate-pulse">Thinking...</div>
                     </div>
                   )}
                   {messages.length === 0 && !isAiResponding && (
                     <p className="text-sm text-muted-foreground text-center pt-4">Ask a question about the paper to start chatting.</p>
                   )}
                 </div>

                 <div className="flex-shrink-0 border-t pt-2 mt-2">
                   <form onSubmit={handleChatSubmit} className="flex flex-col w-full space-y-2">
                     <Textarea
                       id="message"
                       placeholder="Ask about this paper..."
                       className="w-full min-h-[40px] max-h-[200px] resize-none overflow-hidden"
                       autoComplete="off"
                       value={inputMessage}
                       onChange={(e) => setInputMessage(e.target.value)}
                       disabled={isAiResponding}
                       rows={1}
                       onInput={(e) => {
                         const target = e.target as HTMLTextAreaElement;
                         target.style.height = 'auto';
                         target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
                       }}
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           handleChatSubmit(e as any);
                         }
                       }}
                     />
                     <div className="flex items-center gap-2">
                       <Button type="submit" size="sm" disabled={!inputMessage.trim() || isAiResponding}>
                         Send
                       </Button>
                       <span className="text-xs text-muted-foreground">
                         {contextUsage}% used
                       </span>
                     </div>
                   </form>
                 </div>
               </div>
             )}

             {activeTab === 'notes' && (
               <div className="flex-1 p-4">
                 <p className="text-muted-foreground text-center pt-8">Notes feature coming soon...</p>
               </div>
             )}

             {activeTab === 'comments' && (
               <div className="flex-1 p-4">
                 <p className="text-muted-foreground text-center pt-8">Comments feature coming soon...</p>
               </div>
             )}

             {activeTab === 'similar' && (
               <div className="flex-1 p-4">
                 <p className="text-muted-foreground text-center pt-8">Similar papers feature coming soon...</p>
               </div>
             )}
           </div>
         </ResizablePanel>
       </ResizablePanelGroup>
    </div>
  );
}