"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getUserPapers, getPapersWithUserNotes, getPapersUserCommented, getBookmarkedPapers } from "@/lib/firestore/papers";
import { Paper } from "@/lib/types/paper";
import Link from "next/link";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2, Trash2, MessageSquare, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [uploadedPapers, setUploadedPapers] = useState<Paper[]>([]);
  const [notedPapers, setNotedPapers] = useState<Paper[]>([]);
  const [commentedPapers, setCommentedPapers] = useState<Paper[]>([]);
  const [bookmarkedPapers, setBookmarkedPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paperToDelete, setPaperToDelete] = useState<Paper | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadPapers() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const uploaded = await getUserPapers(user.uid).catch(err => {
          console.error("Error loading uploaded papers:", err);
          return [];
        });
        setUploadedPapers(uploaded);

        const noted = await getPapersWithUserNotes(user.uid).catch(err => {
          console.error("Error loading papers with notes:", err);
          return [];
        });
        setNotedPapers(noted);

        const commented = await getPapersUserCommented(user.uid).catch(err => {
          console.error("Error loading papers with comments:", err);
          return [];
        });
        setCommentedPapers(commented);

        const bookmarked = await getBookmarkedPapers(user.uid).catch(err => {
          console.error("Error loading bookmarked papers:", err);
          return [];
        });
        setBookmarkedPapers(bookmarked);
      } catch (error) {
        console.error("Error loading papers:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!authLoading) {
      loadPapers();
    }
  }, [user, authLoading]);

  const handleDeleteClick = (paper: Paper) => {
    setPaperToDelete(paper);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!paperToDelete || !user) return;

    setDeleting(true);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/papers/${paperToDelete.id}/delete`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete paper');
      }

      setUploadedPapers(prev => prev.filter(p => p.id !== paperToDelete.id));
      setDeleteDialogOpen(false);
      setPaperToDelete(null);
    } catch (error) {
      console.error("Error deleting paper:", error);
      alert(error instanceof Error ? error.message : "Failed to delete paper");
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container py-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-4">Library</h1>
        <p className="text-muted-foreground mb-4">Please sign in to view your library.</p>
        <Button onClick={() => router.push("/login")}>Sign In</Button>
      </div>
    );
  }

  const getStatusIcon = (status: Paper["status"]) => {
    switch (status) {
      case "ready":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "uploading":
      case "uploaded":
      case "processing":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: Paper["status"]) => {
    switch (status) {
      case "ready":
        return "Ready";
      case "failed":
        return "Failed";
      case "uploading":
        return "Uploading...";
      case "uploaded":
        return "Uploaded";
      case "processing":
        return "Processing...";
      default:
        return status;
    }
  };

  const renderPaperCard = (paper: Paper, showDelete = false) => (
    <div
      key={paper.id}
      className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h3 className="text-lg font-semibold truncate">{paper.title}</h3>
            <div className="flex items-center gap-1 text-sm">
              {getStatusIcon(paper.status)}
              <span className="text-muted-foreground">{getStatusText(paper.status)}</span>
            </div>
          </div>
          
          {paper.authors.length > 0 && (
            <p className="text-sm text-muted-foreground mb-2">
              {paper.authors.join(", ")}
            </p>
          )}
          
          {paper.abstract && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
              {paper.abstract}
            </p>
          )}
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {paper.year && <span>{paper.year}</span>}
            {paper.venue && <span>{paper.venue}</span>}
            {paper.tags.length > 0 && (
              <div className="flex gap-1">
                {paper.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="px-2 py-0.5 bg-secondary rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex gap-2">
          {paper.status === "ready" && (
            <Link href={`/paper/${paper.id}`}>
              <Button variant="outline" size="sm">
                View Paper
              </Button>
            </Link>
          )}
          {showDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDeleteClick(paper)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {paper.errorMessage && (
        <div className="mt-3 p-2 bg-destructive/10 text-destructive text-sm rounded">
          Error: {paper.errorMessage}
        </div>
      )}
    </div>
  );

  const renderEmptyState = (icon: React.ReactNode, title: string, description: string) => (
    <div className="text-center py-12">
      {icon}
      <p className="text-muted-foreground mb-2">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-6">Library</h1>
      
      <Tabs defaultValue="uploaded" className="w-full">
        <TabsList>
          <TabsTrigger value="uploaded">
            Uploaded ({uploadedPapers.length})
          </TabsTrigger>
          <TabsTrigger value="notes">
            <FileEdit className="h-4 w-4 mr-2" />
            Notes ({notedPapers.length})
          </TabsTrigger>
          <TabsTrigger value="comments">
            <MessageSquare className="h-4 w-4 mr-2" />
            Comments ({commentedPapers.length})
          </TabsTrigger>
          <TabsTrigger value="bookmarked">
            Bookmarked ({bookmarkedPapers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="uploaded" className="mt-6">
          {uploadedPapers.length === 0 ? (
            renderEmptyState(
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />,
              "No papers uploaded yet.",
              "Upload a paper to get started!"
            )
          ) : (
            <div className="space-y-4">
              {uploadedPapers.map((paper) => renderPaperCard(paper, true))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          {notedPapers.length === 0 ? (
            renderEmptyState(
              <FileEdit className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />,
              "No papers with notes yet.",
              "Open a paper and add notes to see them here!"
            )
          ) : (
            <div className="space-y-4">
              {notedPapers.map((paper) => renderPaperCard(paper))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comments" className="mt-6">
          {commentedPapers.length === 0 ? (
            renderEmptyState(
              <MessageSquare className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />,
              "No papers with comments yet.",
              "Comment on a paper to see it here!"
            )
          ) : (
            <div className="space-y-4">
              {commentedPapers.map((paper) => renderPaperCard(paper))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bookmarked" className="mt-6">
          {bookmarkedPapers.length === 0 ? (
            renderEmptyState(
              <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />,
              "No bookmarked papers yet.",
              "Bookmark a paper to save it for later!"
            )
          ) : (
            <div className="space-y-4">
              {bookmarkedPapers.map((paper) => renderPaperCard(paper))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{paperToDelete?.title}" and all associated data including comments and notes. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
