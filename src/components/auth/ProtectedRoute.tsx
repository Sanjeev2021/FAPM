import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg, OrgRole } from '@/contexts/OrgContext';
import { LoadingState } from '@/components/shared/LoadingState';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: OrgRole | 'super_admin';
  blockSuperAdmin?: boolean;
}

export function ProtectedRoute({ children, requiredRole, blockSuperAdmin }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { hasRole, isSuperAdmin, orgId, loading: orgLoading } = useOrg();
  const navigate = useNavigate();

  const loading = authLoading || orgLoading;

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && user && requiredRole && !hasRole(requiredRole)) {
      navigate('/chat');
    }
  }, [user, loading, requiredRole, hasRole, navigate]);

  useEffect(() => {
    if (!loading && user && blockSuperAdmin && isSuperAdmin && !orgId) {
      navigate('/admin');
    }
  }, [user, loading, blockSuperAdmin, isSuperAdmin, orgId, navigate]);

  if (loading) {
    return <LoadingState />;
  }

  if (!user) {
    return null;
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return null;
  }

  if (blockSuperAdmin && isSuperAdmin && !orgId) {
    return null;
  }

  return <>{children}</>;
}
