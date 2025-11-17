"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { getUserPapers } from "@/lib/firestore/papers";
import { Paper } from "@/lib/types/paper";
import Link from "next/link";
import { FileText, Clock, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export default function LibraryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPapers() {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userPapers = await getUserPapers(user.uid);
        setPapers(userPapers);
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

  return (
    <div className="container py-8">
      <h1 className="text-3xl font-bold mb-4">Library</h1>
      
      {papers.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No papers in your library yet.</p>
          <p className="text-sm text-muted-foreground">Upload a paper to get started!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {papers.map((paper) => (
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
                
                {paper.status === "ready" && (
                  <Link href={`/paper/${paper.id}`}>
                    <Button variant="outline" size="sm">
                      View Paper
                    </Button>
                  </Link>
                )}
              </div>
              
              {paper.errorMessage && (
                <div className="mt-3 p-2 bg-destructive/10 text-destructive text-sm rounded">
                  Error: {paper.errorMessage}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
