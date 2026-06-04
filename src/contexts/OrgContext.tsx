import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';

export type OrgRole = 'org_admin' | 'commercial';

const ROLE_HIERARCHY: Record<OrgRole, number> = {
  org_admin: 2,
  commercial: 1,
};

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
}

export interface OrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
}

interface OrgContextType {
  organization: Organization | null;
  membership: OrgMember | null;
  role: OrgRole | null;
  isSuperAdmin: boolean;
  isOrgAdmin: boolean;
  isCommercial: boolean;
  hasRole: (requiredRole: OrgRole | 'super_admin') => boolean;
  refreshOrg: () => void;
  loading: boolean;
  orgId: string | null;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [membership, setMembership] = useState<OrgMember | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const loadedUserIdRef = useRef<string | null>(null);

  const refreshOrg = useCallback(() => setRefreshCounter((c) => c + 1), []);

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setOrganization(null);
      setMembership(null);
      setIsSuperAdmin(false);
      loadedUserIdRef.current = null;
      setLoading(false);
      return;
    }

    // Only show loading spinner on first load or user change — not on tab refocus
    const isNewUser = loadedUserIdRef.current !== user.id;
    if (isNewUser) {
      setLoading(true);
    }

    async function loadOrgData() {
      try {
        // Get profile org_id and check super admin status in parallel
        const [profileResult, superAdminResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('organization_id')
            .eq('id', user!.id)
            .single(),
          supabase.rpc('is_super_admin'),
        ]);

        if (superAdminResult.error) {
          console.warn('is_super_admin RPC failed:', superAdminResult.error.message);
        }
        if (superAdminResult.data === true) {
          setIsSuperAdmin(true);
        }

        if (profileResult.error) {
          console.error('Failed to load profile:', profileResult.error.message);
          return;
        }

        const profile = profileResult.data;
        if (!profile?.organization_id) {
          return;
        }

        // Load org and membership in parallel
        const [orgResult, memberResult] = await Promise.all([
          supabase
            .from('organizations')
            .select('*')
            .eq('id', profile.organization_id)
            .single(),
          supabase
            .from('organization_members')
            .select('*')
            .eq('user_id', user!.id)
            .eq('organization_id', profile.organization_id)
            .single(),
        ]);

        if (orgResult.data) setOrganization(orgResult.data);
        if (memberResult.data) setMembership(memberResult.data as OrgMember);
      } catch (err) {
        console.error('Error loading org data:', err);
      } finally {
        loadedUserIdRef.current = user!.id;
        setLoading(false);
      }
    }

    loadOrgData();
  }, [user, authLoading, refreshCounter]);

  const role = membership?.role ?? null;

  const hasRole = (requiredRole: OrgRole | 'super_admin'): boolean => {
    // Super admin bypasses everything
    if (isSuperAdmin) return true;
    if (requiredRole === 'super_admin') return false;
    if (!role) return false;
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[requiredRole];
  };

  const value: OrgContextType = {
    organization,
    membership,
    role,
    isSuperAdmin,
    isOrgAdmin: hasRole('org_admin'),
    isCommercial: hasRole('commercial'),
    hasRole,
    refreshOrg,
    loading,
    orgId: organization?.id ?? null,
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg() {
  const context = useContext(OrgContext);
  if (context === undefined) {
    throw new Error('useOrg must be used within an OrgProvider');
  }
  return context;
}
