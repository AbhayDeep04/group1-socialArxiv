'use client';

import { useState, useEffect } from 'react';
import { useAuthUser } from '@/lib/hooks/useAuth';
import { getProfile, updateProfile } from '@/lib/profile';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebaseConfig';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';
import { PinSelector } from '@/components/pin-selector';
import type { UserProfile } from '@/lib/types/profile';

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuthUser();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [institution, setInstitution] = useState('');
  const [location, setLocation] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.replace('/login');
      return;
    }

    async function loadUserData() {
      if (!user) return;
      
      try {
        const profileData = await getProfile(user.uid);
        if (profileData) {
          setProfile(profileData);
          setDisplayName(profileData.displayName);
          setBio(profileData.bio);
          setInstitution(profileData.institution);
          setLocation(profileData.location);
        }

        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          setEmail(userDoc.data().email || user.email || '');
        }
      } catch (error) {
        console.error('Error loading user data:', error);
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, [authLoading, user, router]);

  const handleSaveProfile = async () => {
    if (!user) return;

    setSaving(true);
    try {
      await updateProfile(user.uid, {
        displayName,
        bio,
        institution,
        location,
      });

      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, {
        displayName,
        institution,
        location,
        updatedAt: serverTimestamp(),
      });

      alert('Profile updated successfully!');
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container py-8">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="container py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Profile Settings</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Public Profile</CardTitle>
            <CardDescription>
              This information will be visible to other users
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your display name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 300))}
                placeholder="Tell us about yourself"
                rows={4}
                maxLength={300}
              />
              <p className="text-xs text-muted-foreground">
                {bio.length}/300 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="institution">Institution/Affiliation</Label>
              <Input
                id="institution"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="University, Company, etc."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, Country"
              />
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              {saving ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pinned Papers</CardTitle>
            <CardDescription>
              Pin up to 4 papers from your bookmarks to display on your profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PinSelector userId={user.uid} currentPins={profile?.pinnedPaperIds || []} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              Your account information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed at this time
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
