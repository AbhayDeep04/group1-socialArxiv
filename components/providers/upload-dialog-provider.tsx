"use client";

import React, { createContext, useContext, useState } from "react";

interface UploadDialogContextType {
  isOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const UploadDialogContext = createContext<UploadDialogContextType | undefined>(undefined);

export function UploadDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openDialog = () => setIsOpen(true);
  const closeDialog = () => setIsOpen(false);

  return (
    <UploadDialogContext.Provider value={{ isOpen, openDialog, closeDialog }}>
      {children}
    </UploadDialogContext.Provider>
  );
}

export function useUploadDialog() {
  const context = useContext(UploadDialogContext);
  if (context === undefined) {
    throw new Error("useUploadDialog must be used within UploadDialogProvider");
  }
  return context;
}
