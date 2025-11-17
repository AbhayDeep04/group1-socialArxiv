'use client';

import type { User } from 'firebase/auth';
import { cn } from '@/lib/utils';

function stringToHsl(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = input.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 60%, 60%)`;
}

function getInitials(displayName?: string | null, email?: string | null) {
  const name = (displayName || email || 'U').trim();
  const tokens = name.includes('@')
    ? name.split('@')[0].split(/[^a-zA-Z]/).filter(Boolean)
    : name.split(/\s+/).filter(Boolean);

  const first = tokens[0]?.[0] ?? 'U';
  const last = tokens.length > 1 ? tokens[tokens.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function UserAvatar({
  user,
  className,
  size = 32,
}: { user?: User | null; className?: string; size?: number }) {
  const initials = getInitials(user?.displayName, user?.email);
  const bg = stringToHsl(user?.uid || user?.email || initials);

  return (
    <div
      className={cn('inline-flex items-center justify-center rounded-full overflow-hidden', className)}
      style={{ width: size, height: size, background: user?.photoURL ? undefined : bg }}
      aria-label="User avatar"
    >
      {user?.photoURL ? (
        <img 
          src={user.photoURL} 
          alt="Profile picture" 
          width={size} 
          height={size} 
          className="w-full h-full object-cover" 
        />
      ) : (
        <span className="text-xs font-semibold text-white">{initials}</span>
      )}
    </div>
  );
}
