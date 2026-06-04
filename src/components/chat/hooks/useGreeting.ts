import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';

function getGreeting(hour: number, name: string): string {
  if (hour >= 5 && hour < 12) return `Bonjour, ${name}`;
  if (hour >= 12 && hour < 18) return `Bon après-midi, ${name}`;
  if (hour >= 18 && hour < 23) return `Bonsoir, ${name}`;
  return `Bonne nuit, ${name}`;
}

export function useGreeting() {
  const { user } = useAuth();
  const { organization } = useOrg();
  const [hour, setHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const interval = setInterval(() => {
      setHour(new Date().getHours());
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const fullName = user?.user_metadata?.full_name as string | undefined;
  const firstName = fullName?.split(' ')[0] ?? user?.email?.split('@')[0] ?? '';
  const orgName = organization?.name ?? '';

  const displayName = orgName || firstName;
  const greeting = getGreeting(hour, displayName);

  return { greeting, firstName, orgName };
}
