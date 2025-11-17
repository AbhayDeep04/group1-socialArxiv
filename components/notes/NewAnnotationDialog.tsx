'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Rect } from '@/lib/types/note';

interface NewAnnotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote: string;
  pageRects: Rect[];
  onSave: (content: string, color: string) => Promise<void>;
}

const HIGHLIGHT_COLORS = [
  { name: 'Yellow', value: '#fff475' },
  { name: 'Green', value: '#a8e6a1' },
  { name: 'Blue', value: '#a1d4e6' },
  { name: 'Pink', value: '#ffa8d4' },
  { name: 'Orange', value: '#ffd4a8' },
];

export function NewAnnotationDialog({
  open,
  onOpenChange,
  quote,
  pageRects,
  onSave,
}: NewAnnotationDialogProps) {
  const [content, setContent] = useState('');
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].value);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim() || isSaving) return;

    setIsSaving(true);
    try {
      await onSave(content.trim(), selectedColor);
      setContent('');
      setSelectedColor(HIGHLIGHT_COLORS[0].value);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save annotation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setContent('');
    setSelectedColor(HIGHLIGHT_COLORS[0].value);
    onOpenChange(false);
  };

  const pageNumber = pageRects[0]?.pageNumber;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Annotation</DialogTitle>
          <DialogDescription>
            Add a note to your highlighted text
            {pageNumber && ` (Page ${pageNumber})`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Selected Text</label>
            <div className="p-3 bg-muted rounded text-sm italic max-h-24 overflow-y-auto">
              "{quote.substring(0, 300)}{quote.length > 300 ? '...' : ''}"
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Highlight Color</label>
            <div className="flex gap-2">
              {HIGHLIGHT_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`w-8 h-8 rounded border-2 transition-all ${
                    selectedColor === color.value
                      ? 'border-primary scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => setSelectedColor(color.value)}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Note</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add your thoughts about this passage..."
              className="min-h-[100px] resize-none"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!content.trim() || isSaving}>
            {isSaving ? 'Saving...' : 'Save Annotation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
