'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import dynamic from 'next/dynamic';

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Conversation } from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Textarea } from '@/components/ui/textarea';

import { ChatMessage, Source } from '@/lib/types';
import { ZoomIn, ZoomOut, Plus, MessageSquare, History, Sparkles, Headphones, Save, X, Bookmark, Star } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth-context';
import { NotesTab } from '@/components/notes/NotesTab';
import { NewAnnotationDialog } from '@/components/notes/NewAnnotationDialog';
import { Note, Rect } from '@/lib/types/note';
import { addAnnotationNote, subscribeToNotes, addGeneralNote } from '@/lib/db/notes';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { SimilarPapersTab } from '@/components/similar/SimilarPapersTab';
import { toggleBookmark, subscribeToBookmark } from '@/lib/firestore/bookmarks';
import {
  AudioPlayerProvider,
  AudioPlayerButton,
  AudioPlayerProgress,
  AudioPlayerTime,
  AudioPlayerDuration,
} from '@/components/ui/audio-player';
import { subscribeToUserRating, submitRating } from '@/lib/db/ratings';
import { RatingPopover } from '@/components/ratings/RatingPopover';

const PDFViewer = dynamic(() => import('@/components/pdf/Viewer'), { ssr: false });

interface PaperMetadata {
  title?: string;
  pdfUrl?: string;
}

function PleaseLogin({ feature }: { feature: string }) {
  return (
    <div className="flex items-center justify-center h-full p-4 text-center">
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          Please log in to use {feature}.
        </p>
        <div className="flex gap-2 justify-center">
          <Link href="/login"><Button size="sm">Login</Button></Link>
          <Link href="/register"><Button size="sm" variant="outline">Register</Button></Link>
        </div>
      </div>
    </div>
  );
}

export default function PaperPage() {
  const params = useParams();
  const paperId = params.paperId as string;
  const { user, loading: authLoading } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const isAuthed = !!user && !authLoading;

  const [metadata, setMetadata] = useState<PaperMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PDF Viewer State
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfWidth, setPdfWidth] = useState(800);
  const [zoom, setZoom] = useState(1.0);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  // Chat State
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiResponding, setIsAiResponding] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Notes State (legacy - keeping for backward compatibility)
  const [notes, setNotes] = useState('');
  
  // New notes system
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [annotationDialogOpen, setAnnotationDialogOpen] = useState(false);
  const [pendingAnnotation, setPendingAnnotation] = useState<{
    quote: string;
    pageRects: Rect[];
  } | null>(null);

  // AI Summary State
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryText, setSummaryText] = useState<string | null>(null);
  const [isSavingSummary, setIsSavingSummary] = useState(false);

  // TTS State (ElevenLabs)
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

  // Bookmark State
  const [isBookmarked, setIsBookmarked] = useState(false);

  // Rating State
  const [userRating, setUserRating] = useState<number | null>(null);

  // Hydration tracking
  const hydrationSentRef = useRef(false);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update PDF width based on container size
  const updatePdfWidth = useCallback(() => {
    if (pdfContainerRef.current) {
      const containerWidth = pdfContainerRef.current.offsetWidth;
      setPdfWidth(Math.min(containerWidth - 40, 1200)); // Max 1200px
    }
  }, []);

  useEffect(() => {
    updatePdfWidth();
    window.addEventListener('resize', updatePdfWidth);
    return () => window.removeEventListener('resize', updatePdfWidth);
  }, [updatePdfWidth]);

  // Fetch Paper Metadata
  useEffect(() => {
    async function fetchMetadata() {
      if (!paperId) {
        setError('Paper ID not found in URL.');
        setIsLoading(false);
        return;
      }

      console.log('Fetching metadata for paper:', paperId);

      try {
        const response = await fetch(`/api/papers/${paperId}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch metadata: ${response.status}`);
        }

        const data = await response.json();

        setMetadata({
          title: data.title || `Title for ${paperId}`,
          pdfUrl: data.pdfUrl || `/pdfs/${paperId}.pdf`,
        });
      } catch (err: any) {
        console.error('Error fetching paper metadata:', err);
        setMetadata({
          title: `Title for ${paperId}`,
          pdfUrl: `/pdfs/${paperId}.pdf`,
        });
      } finally {
        setIsLoading(false);
      }
    }

    fetchMetadata();
  }, [paperId]);

  // Trigger hydration once metadata loads (don't await - fire and forget)
  useEffect(() => {
    if (!paperId || !metadata || hydrationSentRef.current) return;
    hydrationSentRef.current = true;

    const pdfUrlForHydration =
      metadata.pdfUrl && metadata.pdfUrl.startsWith('http') ? metadata.pdfUrl : undefined;

    // Fire and forget - hydration runs in background
    fetch(`/api/papers/${paperId}/hydrate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfUrl: pdfUrlForHydration }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && !data.cached) {
          console.log(`Hydration started for ${paperId}, will complete in ~10-20 seconds`);
        } else if (data.cached) {
          console.log(`Paper ${paperId} already hydrated`);
        }
      })
      .catch((err) => {
        console.warn('Hydration trigger failed:', err);
      });
  }, [paperId, metadata]);

  // Subscribe to bookmark state
  useEffect(() => {
    if (!user || !paperId) return;

    const unsubscribe = subscribeToBookmark(user.uid, paperId, (bookmarked) => {
      setIsBookmarked(bookmarked);
    });

    return () => unsubscribe();
  }, [user, paperId]);

  // Handle bookmark toggle
  const handleToggleBookmark = async () => {
    if (!user) return;
    
    try {
      await toggleBookmark(user.uid, paperId);
    } catch (error) {
      console.error('Error toggling bookmark:', error);
    }
  };

  // Subscribe to user rating
  useEffect(() => {
    if (!user || !paperId) return;

    const unsubscribe = subscribeToUserRating(user.uid, paperId, (rating) => {
      setUserRating(rating?.value ?? null);
    });

    return () => unsubscribe();
  }, [user, paperId]);

  // Handle rating submission
  const handleRate = async (value: number) => {
    if (!user) return;
    
    try {
      const idToken = await user.getIdToken();
      await submitRating(paperId, value, idToken);
    } catch (error) {
      console.error('Error submitting rating:', error);
      throw error;
    }
  };

  // Load all conversations for this paper
  const loadConversations = useCallback(async () => {
    if (!paperId || !user) return [];

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/conversations?paperId=${paperId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const { conversations: loadedConversations } = await response.json();
        setConversations(loadedConversations);
        return loadedConversations;
      }
    } catch (err: any) {
      console.error('Error loading conversations:', err);
    }
    return [];
  }, [paperId, user]);

  // Load messages for a specific conversation
  const loadConversationMessages = useCallback(async (convId: string) => {
    try {
      const messagesResponse = await fetch(`/api/conversations/${convId}/messages`);
      if (messagesResponse.ok) {
        const { messages: loadedMessages } = await messagesResponse.json();
        const chatMessages: ChatMessage[] = loadedMessages.map((m: any) => ({
          sender: m.role === 'user' ? 'user' : 'ai',
          text: m.content,
          sources: m.sources || [],
        }));
        setMessages(chatMessages);
        console.log(`Loaded ${chatMessages.length} messages from conversation ${convId}`);
      }
    } catch (err: any) {
      console.error('Error loading conversation messages:', err);
    }
  }, []);

  // Initialize or load conversation
  useEffect(() => {
    async function initConversation() {
      if (!paperId || !user) return;

      const loadedConversations = await loadConversations();

      if (loadedConversations && loadedConversations.length > 0) {
        const mostRecent = loadedConversations[0];
        setConversationId(mostRecent.id);
        await loadConversationMessages(mostRecent.id);
      } else {
        // Create a new conversation if none exist
        const token = await user.getIdToken();
        const createResponse = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            paperId,
            title: 'New Conversation',
          }),
        });

        if (createResponse.ok) {
          const { conversation } = await createResponse.json();
          setConversationId(conversation.id);
          await loadConversations(); // Reload to update list
          console.log(`Created new conversation with ID: ${conversation.id}`);
        } else {
          console.error('Failed to create conversation');
          setError('Failed to initialize chat. Please refresh the page.');
        }
      }
    }

    initConversation();
  }, [paperId, user, loadConversations, loadConversationMessages]);

  // Load notes from localStorage (per-user) - legacy
  useEffect(() => {
    if (paperId && isAuthed && user) {
      const savedNotes = localStorage.getItem(`notes-${paperId}-${user.uid}`);
      if (savedNotes) {
        setNotes(savedNotes);
      }
    }
  }, [paperId, isAuthed, user]);

  // Save notes to localStorage (per-user) - legacy
  useEffect(() => {
    if (paperId && isAuthed && user && notes) {
      localStorage.setItem(`notes-${paperId}-${user.uid}`, notes);
    }
  }, [paperId, notes, isAuthed, user]);

  // Subscribe to notes from Firestore
  useEffect(() => {
    if (!user || !paperId) return;

    const unsubscribe = subscribeToNotes(user.uid, paperId, (loadedNotes) => {
      setAllNotes(loadedNotes);
    });

    return () => unsubscribe();
  }, [user, paperId]);

  function onDocumentLoadSuccess({ numPages: nextNumPages }: { numPages: number }): void {
    setNumPages(nextNumPages);
    console.log(`PDF loaded successfully with ${nextNumPages} pages.`);
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.2, 3.0));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.2, 0.5));
  };

  const handleNewChat = async () => {
    if (!paperId || !user) return;

    try {
      const token = await user.getIdToken();
      const createResponse = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          paperId,
          title: 'New Conversation',
        }),
      });

      if (createResponse.ok) {
        const { conversation } = await createResponse.json();
        setConversationId(conversation.id);
        setMessages([]); // Clear messages for fresh chat
        await loadConversations(); // Reload conversations list
        console.log(`Created new conversation with ID: ${conversation.id}`);
      } else {
        console.error('Failed to create new conversation');
        setError('Failed to create new chat. Please try again.');
      }
    } catch (err: any) {
      console.error('Error creating new conversation:', err);
      setError('Failed to create new chat. Please try again.');
    }
  };

  const handleSwitchConversation = async (convId: string) => {
    setConversationId(convId);
    await loadConversationMessages(convId);
  };

  const handleTextSelected = (selection: {
    text: string;
    pageNumber: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  }) => {
    if (!user) return;

    const pageRects: Rect[] = selection.rects.map((rect) => ({
      pageNumber: selection.pageNumber,
      ...rect,
    }));

    setPendingAnnotation({
      quote: selection.text,
      pageRects,
    });
    setAnnotationDialogOpen(true);
  };

  const handleSaveAnnotation = async (content: string, color: string) => {
    if (!user || !pendingAnnotation) return;

    await addAnnotationNote(user.uid, paperId, {
      content,
      quote: pendingAnnotation.quote,
      color,
      pageRects: pendingAnnotation.pageRects,
      anchors: {
        exact: pendingAnnotation.quote,
      },
    });

    setPendingAnnotation(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleJumpToHighlight = (note: Note) => {
    if (note.type !== 'annotation' || !note.annotation?.pageRects?.[0]) return;

    const pageNumber = note.annotation.pageRects[0].pageNumber;
    const pageElement = document.querySelector(`[data-page-number="${pageNumber}"]`);
    
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleHighlightClick = (note: Note) => {
    const noteElement = document.getElementById(`note-${note.id}`);
    if (noteElement) {
      noteElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      noteElement.classList.add('ring-2', 'ring-primary');
      setTimeout(() => {
        noteElement.classList.remove('ring-2', 'ring-primary');
      }, 2000);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || isAiResponding || !conversationId || !user) return;

    const newUserMessage: ChatMessage = { sender: 'user', text: inputMessage };
    setMessages((prev) => [...prev, newUserMessage]);
    setInputMessage('');
    setIsAiResponding(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/chat/ask', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversationId,
          paperId,
          message: newUserMessage.text,
          topK: 6,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `API request failed with status ${response.status}`);
      }

      const responseData = await response.json();
      const aiResponseText = responseData.response || "Sorry, I couldn't generate a response.";

      const aiResponse: ChatMessage = {
        sender: 'ai',
        text: aiResponseText,
      };
      setMessages((prev) => [...prev, aiResponse]);
    } catch (e: any) {
      console.error('Chat API Error:', e);
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `System Error: Failed to get response. Details: ${e.message}`,
        },
      ]);
    } finally {
      setIsAiResponding(false);
    }
  };

  // AI Summary handlers
  const handleGenerateSummary = async () => {
    if (!user) return;
    try {
      setIsSummarizing(true);
      setSummaryText(null);
      const token = await user.getIdToken();
      const response = await fetch(`/api/papers/${paperId}/summary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to generate summary');
      }

      const { summary } = await response.json();
      setSummaryText(summary);
    } catch (error: any) {
      console.error('Error generating summary:', error);
      setSummaryText('Failed to generate summary. Please try again.');
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleSaveSummary = async () => {
    if (!user || !summaryText) return;
    setIsSavingSummary(true);
    try {
      await addGeneralNote(user.uid, paperId, {
        content: `# AI-Generated Summary\n\n${summaryText}`,
      });
      setSummaryText(null);
    } catch (error) {
      console.error('Error saving summary:', error);
    } finally {
      setIsSavingSummary(false);
    }
  };

  // TTS handler (ElevenLabs)
  const handleListen = async () => {
    if (audioUrl) return;
    try {
      setIsGeneratingAudio(true);
      const response = await fetch(`/api/papers/${paperId}/audio`);
      if (!response.ok) {
        throw new Error('Failed to generate audio');
      }
      const blob = await response.blob();
      console.log('Audio blob received:', {
        type: blob.type,
        size: blob.size,
        sizeKB: (blob.size / 1024).toFixed(2) + ' KB',
      });
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
    } catch (error: any) {
      console.error('Error generating audio:', error);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  if (isLoading) return <div className="p-4">Loading paper...</div>;
  if (error && !error.startsWith('Failed to load PDF'))
    return (
      <div className="p-4 text-red-600">
        Error: {error} <Link href="/" className="underline">Go Home</Link>
      </div>
    );
  if (!metadata || !metadata.pdfUrl)
    return (
      <div className="p-4">
        Paper data not found. <Link href="/" className="underline">Go Home</Link>
      </div>
    );

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b p-2 px-4 flex items-center justify-between">
        <div>{/* Placeholder for other controls */}</div>
        <h1 className="text-lg font-semibold truncate px-4">
          {metadata.title || `Paper ${paperId}`}
        </h1>
        <div>{/* Placeholder for other controls */}</div>
      </header>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Panel: PDF Viewer - Continuous Scroll */}
        <ResizablePanel defaultSize={60} onResize={updatePdfWidth}>
          <div className="h-full flex flex-col">
            {/* PDF Controls */}
            <div className="flex items-center justify-center h-12 border-b bg-background relative px-3 gap-2">
              <TooltipProvider>
                {/* Bookmark button - far left */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={!isAuthed}
                      onClick={handleToggleBookmark}
                      className="h-8 w-8"
                    >
                      <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isBookmarked ? 'Remove bookmark' : 'Bookmark paper'}</p>
                  </TooltipContent>
                </Tooltip>

                {/* AI Summary - directly left of zoom out */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={!isAuthed || isSummarizing}
                      onClick={handleGenerateSummary}
                      className="h-8 w-8"
                    >
                      {isSummarizing ? (
                        <span className="animate-pulse">
                          <Sparkles className="h-4 w-4" />
                        </span>
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isSummarizing ? 'Generating summary...' : 'AI Summary'}</p>
                  </TooltipContent>
                </Tooltip>

                {/* Zoom controls */}
                <Button onClick={handleZoomOut} size="sm" variant="outline">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[60px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button onClick={handleZoomIn} size="sm" variant="outline">
                  <ZoomIn className="h-4 w-4" />
                </Button>

                {/* Rating button */}
                <RatingPopover
                  paperId={paperId}
                  currentRating={userRating}
                  disabled={!isAuthed}
                  onRate={handleRate}
                />

                {/* Listen / Audio Player - directly right of rating */}
                {!audioUrl ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        disabled={!isAuthed || isGeneratingAudio}
                        onClick={handleListen}
                        className="h-8 w-8"
                      >
                        {isGeneratingAudio ? (
                          <span className="animate-pulse">
                            <Headphones className="h-4 w-4" />
                          </span>
                        ) : (
                          <Headphones className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{isGeneratingAudio ? 'Generating audio...' : 'Audio Generation'}</p>
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <AudioPlayerProvider>
                    <div className="flex items-center gap-2">
                      <AudioPlayerButton
                        size="sm"
                        item={{
                          id: `paper-${paperId}`,
                          src: audioUrl,
                          data: { title: metadata?.title || 'Paper Audio' },
                        }}
                      />
                      <AudioPlayerProgress className="w-32" />
                      <AudioPlayerTime className="text-xs" />
                    </div>
                  </AudioPlayerProvider>
                )}
              </TooltipProvider>

              {/* Summary Popup */}
              {summaryText && (
                <div className="absolute top-12 left-1/2 -translate-x-1/2 z-10 rounded border bg-popover p-4 shadow-lg max-w-2xl max-h-96 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-sm">AI-Generated Summary</h3>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSummaryText(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-sm whitespace-pre-wrap mb-3">{summaryText}</div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleSaveSummary}
                      disabled={isSavingSummary}
                      className="gap-1"
                    >
                      <Save className="h-4 w-4" />
                      {isSavingSummary ? 'Saving...' : 'Save to Notes'}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div
              ref={pdfContainerRef}
              className="flex-1 overflow-y-auto bg-muted"
            >
              {error && error.startsWith('Failed to load PDF') ? (
                <p className="text-red-600 text-sm p-4">{error}</p>
              ) : (
                <div className="flex justify-center py-4">
                  <PDFViewer
                    file={`/api/papers/${paperId}/pdf`}
                    isDark={isDark}
                    pdfWidth={pdfWidth}
                    zoom={zoom}
                    numPages={numPages}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    onLoadError={(pdfError: any) => {
                      console.error('PDF Load Error:', pdfError);
                      setError(
                        `Failed to load PDF: ${pdfError.message}. Source: /api/papers/${paperId}/pdf`
                      );
                      setNumPages(null);
                    }}
                    notes={allNotes}
                    onHighlightClick={handleHighlightClick}
                    onTextSelected={isAuthed ? handleTextSelected : undefined}
                  />
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel: Tabbed Interface */}
        <ResizablePanel defaultSize={40} onResize={updatePdfWidth}>
          <Tabs defaultValue="chat" className="h-full flex flex-col gap-0">
            <TabsList className="grid w-full grid-cols-4 rounded-none border-b bg-background h-12 p-0">
              <TabsTrigger value="chat" disabled={!isAuthed} className="rounded-none border-0 bg-transparent data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none h-full">Chat</TabsTrigger>
              <TabsTrigger value="notes" disabled={!isAuthed} className="rounded-none border-0 bg-transparent data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none h-full">Notes</TabsTrigger>
              <TabsTrigger value="comments" disabled={!isAuthed} className="rounded-none border-0 bg-transparent data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none h-full">Comments</TabsTrigger>
              <TabsTrigger value="similar" disabled={!isAuthed} className="rounded-none border-0 bg-transparent data-[state=active]:bg-transparent dark:data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none h-full">Similar</TabsTrigger>
            </TabsList>

            {/* Chat Tab */}
            <TabsContent value="chat" className="flex-1 flex flex-col mt-0 overflow-hidden">
              {!isAuthed ? (
                <PleaseLogin feature="Chat" />
              ) : (
                <>
                  <div className="p-3 border-b flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">AI Assistant</h2>
                      <p className="text-xs text-muted-foreground">Ask questions about this paper</p>
                    </div>
                    <div className="flex gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1">
                            <History className="h-4 w-4" />
                            History
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                          {conversations.length === 0 ? (
                            <div className="p-4 text-center text-sm text-muted-foreground">
                              No conversation history
                            </div>
                          ) : (
                            conversations.map((conv) => (
                              <DropdownMenuItem
                                key={conv.id}
                                onClick={() => handleSwitchConversation(conv.id)}
                                className={`cursor-pointer ${
                                  conversationId === conv.id ? 'bg-accent' : ''
                                }`}
                              >
                                <div className="flex items-start gap-2 w-full">
                                  <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                      {conv.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(conv.updatedAt).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </DropdownMenuItem>
                            ))
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      
                      <Button
                        onClick={handleNewChat}
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        disabled={!isAuthed}
                      >
                        <Plus className="h-4 w-4" />
                        New Chat
                      </Button>
                    </div>
                  </div>

                  <Conversation className="flex-1 overflow-y-auto p-4">
                    {messages.length === 0 && !isAiResponding && (
                      <div className="flex items-center justify-center h-full">
                        <p className="text-sm text-muted-foreground text-center">
                          Ask a question about the paper to start chatting.
                        </p>
                      </div>
                    )}

                    {messages.map((msg, index) => (
                      <Message
                        key={index}
                        from={msg.sender === 'user' ? 'user' : 'assistant'}
                        className="mb-4"
                      >
                        {msg.sender === 'ai' ? (
                          <MessageResponse className="text-sm">{msg.text}</MessageResponse>
                        ) : (
                          <MessageContent className="text-sm">{msg.text}</MessageContent>
                        )}
                      </Message>
                    ))}

                    {isAiResponding && (
                      <Message from="assistant" className="mb-4">
                        <MessageContent className="text-sm">
                          <div className="flex items-center gap-2">
                            <div className="animate-pulse">Thinking...</div>
                          </div>
                        </MessageContent>
                      </Message>
                    )}

                    <div ref={messagesEndRef} />
                  </Conversation>

                  <div className="p-3 border-t">
                    <form onSubmit={handleChatSubmit} className="flex gap-2">
                      <Textarea
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        disabled={!isAuthed || isAiResponding || !conversationId}
                        placeholder="Ask about this paper..."
                        className="min-h-[60px] resize-none"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleChatSubmit(e);
                          }
                        }}
                      />
                      <Button
                        type="submit"
                        disabled={!isAuthed || !inputMessage.trim() || isAiResponding || !conversationId}
                        size="icon"
                        className="self-end"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </Button>
                    </form>
                  </div>
                </>
              )}
            </TabsContent>

            {/* Notes Tab */}
            <TabsContent value="notes" className="flex-1 flex flex-col mt-0 overflow-hidden">
              {!isAuthed ? (
                <PleaseLogin feature="Notes" />
              ) : (
                <NotesTab paperId={paperId} onJumpToHighlight={handleJumpToHighlight} />
              )}
            </TabsContent>

            {/* Comments Tab */}
            <TabsContent value="comments" className="flex-1 flex flex-col mt-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4">
                <CommentsSection paperId={paperId} />
              </div>
            </TabsContent>

            {/* Similar Papers Tab */}
            <TabsContent value="similar" className="flex-1 flex flex-col mt-0 overflow-hidden">
              {!isAuthed ? (
                <PleaseLogin feature="Similar papers" />
              ) : (
                <>
                  <div className="p-3 border-b">
                    <h2 className="font-semibold">Similar Papers</h2>
                    <p className="text-xs text-muted-foreground">Papers related to this one</p>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4">
                    <SimilarPapersTab paperId={paperId} />
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Annotation Dialog */}
      {pendingAnnotation && (
        <NewAnnotationDialog
          open={annotationDialogOpen}
          onOpenChange={setAnnotationDialogOpen}
          quote={pendingAnnotation.quote}
          pageRects={pendingAnnotation.pageRects}
          onSave={handleSaveAnnotation}
        />
      )}
    </div>
  );
}
