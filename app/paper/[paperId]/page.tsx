'use client'; // Needed for hooks and interactivity

import { useState, useEffect } from 'react';
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
  const [pageNumber, setPageNumber] = useState(1); // Start at page 1

  // --- Chat State ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiResponding, setIsAiResponding] = useState(false);

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
     setPageNumber(1); // Reset to first page on new document load
     console.log(`PDF loaded successfully with ${nextNumPages} pages.`);
   }

   // --- Handle Page Navigation ---
   function goToPrevPage() {
       setPageNumber(prevPageNumber => Math.max(prevPageNumber - 1, 1));
   }

   function goToNextPage() {
       setPageNumber(prevPageNumber => Math.min(prevPageNumber + 1, numPages || 1));
   }

// --- Handle Chat Submission (Real API Call) ---
const handleChatSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputMessage.trim() || isAiResponding) return;
  
    const newUserMessage: ChatMessage = { sender: 'user', text: inputMessage };
    setMessages(prev => [...prev, newUserMessage]);
    setInputMessage('');
    setIsAiResponding(true);
    setError(null); // Clear previous errors
  
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
  
      // 2. Extract the AI response from the JSON body
      const responseData = await response.json();
      const aiResponseText = responseData.response || "Sorry, I couldn't generate a response.";
  
      // 3. Add the real AI response to the chat state
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
           <div className="flex flex-col h-full items-center justify-start p-2"> {/* Changed justify-center to start */}
             {/* --- PDF Document Component --- */}
             <div className="flex-1 w-full overflow-y-auto mb-2 border rounded"> {/* Added border and scroll container */}
               <Document
                 file={metadata.pdfUrl} // Use the pdfUrl from state
                 onLoadSuccess={onDocumentLoadSuccess}
                 onLoadError={(pdfError) => {
                     console.error("PDF Load Error:", pdfError);
                     setError(`Failed to load PDF: ${pdfError.message}. Check if the file exists at ${metadata.pdfUrl}`);
                     setNumPages(null); // Clear numPages on error
                 }}
                 className="flex justify-center" // Center the document/page
                 loading={<p>Loading PDF...</p>} // Loading indicator for PDF
               >
                 {/* Only render Page if numPages is known */}
                 {numPages && (
                     <Page
                       pageNumber={pageNumber}
                       renderTextLayer={true} // Enable text selection
                       renderAnnotationLayer={false} // Disable annotation layer for simplicity/performance
                       // Dynamically adjust width based on available space, capped at 800px
                       // This requires running client-side, hence 'use client'
                       width={typeof window !== 'undefined' ? Math.min(window.innerWidth * 0.55, 800) : undefined}
                     />
                 )}
               </Document>
             </div>
             {/* Show PDF load error specifically */}
             {error && error.startsWith("Failed to load PDF") && <p className="text-red-600 text-sm">{error}</p>}


             {/* --- PDF Controls --- */}
             {numPages && !error && ( // Only show controls if PDF loaded without error
               <div className="flex items-center justify-center space-x-4 border-t pt-2 w-full">
                 <Button onClick={goToPrevPage} disabled={pageNumber <= 1} size="sm">
                   Previous
                 </Button>
                 <span>
                   Page {pageNumber} of {numPages}
                 </span>
                 <Button onClick={goToNextPage} disabled={pageNumber >= numPages} size="sm">
                   Next
                 </Button>
               </div>
             )}
           </div>
         </ResizablePanel>

         <ResizableHandle withHandle />

         {/* Right Panel: Chat */}
         <ResizablePanel defaultSize={40}>
           <div className="flex flex-col h-full p-2">
             <span className="font-semibold p-2 border-b">Chat with AI Assistant</span>
             {/* Chat Messages Area */}
             <div className="flex flex-col flex-1 overflow-y-auto space-y-4 p-2 my-2">
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

             {/* Chat Input Area */}
             <form onSubmit={handleChatSubmit} className="flex w-full items-center space-x-2 border-t pt-2">
               <Input
                 id="message"
                 placeholder="Ask about this paper..."
                 className="flex-1"
                 autoComplete="off"
                 value={inputMessage}
                 onChange={(e) => setInputMessage(e.target.value)}
                 disabled={isAiResponding}
               />
               <Button type="submit" size="sm" disabled={!inputMessage.trim() || isAiResponding}>
                 Send
               </Button>
             </form>
           </div>
         </ResizablePanel>
       </ResizablePanelGroup>
    </div>
  );
}