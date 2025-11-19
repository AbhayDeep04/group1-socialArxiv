'use client';

import { useState, useEffect } from 'react';
import { getBookmarkedPaperIds } from '@/lib/firestore/bookmarks';
import { updatePinnedPapers } from '@/lib/profile';
import { collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import type { Paper } from '@/lib/types/paper';

interface PinSelectorProps {
  userId: string;
  currentPins: string[];
}

export function PinSelector({ userId, currentPins }: PinSelectorProps) {
  const [bookmarkedPapers, setBookmarkedPapers] = useState<Paper[]>([]);
  const [selectedPins, setSelectedPins] = useState<string[]>(currentPins);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadBookmarks() {
      try {
        const paperIds = await getBookmarkedPaperIds(userId);
        
        if (paperIds.length > 0) {
          const papersRef = collection(db, 'papers');
          const q = query(papersRef, where(documentId(), 'in', paperIds.slice(0, 10)));
          const snapshot = await getDocs(q);
          const papers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Paper));
          setBookmarkedPapers(papers);
        }
      } catch (error) {
        console.error('Error loading bookmarks:', error);
      } finally {
        setLoading(false);
      }
    }

    loadBookmarks();
  }, [userId]);

  useEffect(() => {
    setSelectedPins(currentPins);
  }, [currentPins]);

  const handleTogglePin = (paperId: string) => {
    setSelectedPins(prev => {
      if (prev.includes(paperId)) {
        return prev.filter(id => id !== paperId);
      } else if (prev.length < 4) {
        return [...prev, paperId];
      }
      return prev;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updatePinnedPapers(selectedPins);
      alert('Pinned papers updated successfully!');
    } catch (error) {
      console.error('Error updating pins:', error);
      alert('Failed to update pinned papers');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading bookmarks...</p>;
  }

  if (bookmarkedPapers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You don't have any bookmarked papers yet. Bookmark papers to pin them to your profile.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select up to 4 papers to pin to your profile ({selectedPins.length}/4 selected)
      </p>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {bookmarkedPapers.map((paper) => (
          <Card
            key={paper.id}
            className={selectedPins.includes(paper.id) ? 'border-primary' : ''}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedPins.includes(paper.id)}
                  onCheckedChange={() => handleTogglePin(paper.id)}
                  disabled={!selectedPins.includes(paper.id) && selectedPins.length >= 4}
                />
                <div className="flex-1">
                  <h4 className="font-medium text-sm mb-1">{paper.title}</h4>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {paper.abstract}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? 'Saving...' : 'Save Pinned Papers'}
      </Button>
    </div>
  );
}
