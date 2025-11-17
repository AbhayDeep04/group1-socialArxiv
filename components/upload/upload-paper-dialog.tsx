"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUploadDialog } from "@/components/providers/upload-dialog-provider";
import { MetadataForm, PaperMetadata } from "./metadata-form";
import { useAuth } from "@/lib/auth-context";
import { storage } from "@/lib/firebaseConfig";
import { ref, uploadBytes } from "firebase/storage";
import { createPaper, updatePaper } from "@/lib/firestore/papers";
import { useRouter } from "next/navigation";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export function UploadPaperDialog() {
  const { isOpen, closeDialog } = useUploadDialog();
  const { user } = useAuth();
  const router = useRouter();
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setError("");
    
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors.some((e: any) => e.code === "file-too-large")) {
        setError("File is too large. Maximum size is 25MB.");
      } else if (rejection.errors.some((e: any) => e.code === "file-invalid-type")) {
        setError("Please upload a PDF file.");
      } else {
        setError("Invalid file. Please try again.");
      }
      return;
    }

    if (acceptedFiles.length > 0) {
      const file = acceptedFiles[0];
      if (file.type !== "application/pdf") {
        setError("Please upload a PDF file.");
        return;
      }
      setSelectedFile(file);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxSize: MAX_FILE_SIZE,
    multiple: false,
  });

  const handleMetadataSubmit = async (metadata: PaperMetadata) => {
    if (!selectedFile || !user) return;

    setIsUploading(true);
    setError("");

    try {
      // Create Firestore document first
      const paperId = await createPaper({
        source: "upload",
        ownerId: user.uid,
        title: metadata.title,
        authors: metadata.authors,
        abstract: metadata.abstract,
        year: metadata.year,
        venue: metadata.venue,
        tags: metadata.tags,
        status: "uploading",
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        contentType: selectedFile.type,
      });

      // Upload to Firebase Storage
      const storagePath = `user-uploads/${user.uid}/${paperId}/source.pdf`;
      const storageRef = ref(storage, storagePath);
      
      await uploadBytes(storageRef, selectedFile, {
        contentType: "application/pdf",
        customMetadata: {
          paperId,
          ownerId: user.uid,
          originalName: selectedFile.name,
        },
      });

      // Update Firestore with storage path
      await updatePaper(paperId, {
        status: "uploaded",
        storagePath,
      });

      setSuccess(true);
      
      // Wait a moment to show success, then redirect
      setTimeout(() => {
        setSelectedFile(null);
        setSuccess(false);
        closeDialog();
        router.push("/library");
      }, 2000);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to upload paper. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setError("");
    setSuccess(false);
    closeDialog();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload Paper</DialogTitle>
        </DialogHeader>

        {!selectedFile ? (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                {isDragActive ? "Drop your PDF here" : "Drag and drop your PDF here"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                or click to browse files
              </p>
              <p className="text-xs text-muted-foreground">
                Maximum file size: 25MB
                </p>
                </div>

                {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                <AlertCircle className="h-4 w-4" />
                <p className="text-sm">{error}</p>
                </div>
                )}
                </div>
                ) : (
                <div className="space-y-4">
                {success ? (
                <div className="flex items-center gap-3 p-6 bg-green-500/10 text-green-600 dark:text-green-400 rounded-lg justify-center">
                <CheckCircle2 className="h-6 w-6" />
                <p className="font-medium">Paper uploaded successfully! Redirecting...</p>
                </div>
                ) : (
                <>
                <div className="flex items-center gap-3 p-4 bg-secondary rounded-lg">
                  <FileText className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm">{error}</p>
                  </div>
                )}

              <MetadataForm
                onSubmit={handleMetadataSubmit}
                onCancel={handleCancel}
                isSubmitting={isUploading}
              />
            </>
          )}
        </div>
      )}
      </DialogContent>
    </Dialog>
  );
}
