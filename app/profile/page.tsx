'use client';

import { useAuthUser } from '@/lib/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ProfilePage() {
  const { user, loading } = useAuthUser();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace('/login');
    } else {
      router.replace(`/u/${user.uid}`);
    }
  }, [user, loading, router]);

  return (
    <div className="container py-8">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );
}
