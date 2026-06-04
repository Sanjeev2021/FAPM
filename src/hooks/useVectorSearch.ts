import { useState, useCallback } from 'react';
import {
  searchSupportsMaster,
  searchSupportsVariants,
  searchPlanningKits,
  searchVisuels,
  searchContacts,
  searchAllTables,
  performEnrichedSearch,
  searchSupportsEnriched,
  type SupportMasterMatch,
  type SupportVariantMatch,
  type PlanningKitMatch,
  type VisuelMatch,
  type ContactMatch,
  type MultiTableMatch,
  type EnrichedSearchResult,
  type EnrichedSupportMatch,
} from '../lib/rag/vectorSearch';

export function useVectorSearch() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(
    async <T>(
      searchFn: (query: string, options?: any) => Promise<T>,
      query: string,
      options?: any
    ): Promise<T | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const results = await searchFn(query, options);
        return results;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error occurred');
        setError(error);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    error,
    search,
    searchSupportsMaster: useCallback(
      (query: string, options?: { matchThreshold?: number; matchCount?: number }) =>
        search<SupportMasterMatch[]>(searchSupportsMaster, query, options),
      [search]
    ),
    searchSupportsVariants: useCallback(
      (query: string, options?: { matchThreshold?: number; matchCount?: number }) =>
        search<SupportVariantMatch[]>(searchSupportsVariants, query, options),
      [search]
    ),
    searchPlanningKits: useCallback(
      (query: string, options?: { matchThreshold?: number; matchCount?: number }) =>
        search<PlanningKitMatch[]>(searchPlanningKits, query, options),
      [search]
    ),
    searchVisuels: useCallback(
      (query: string, options?: { matchThreshold?: number; matchCount?: number }) =>
        search<VisuelMatch[]>(searchVisuels, query, options),
      [search]
    ),
    searchContacts: useCallback(
      (query: string, options?: { matchThreshold?: number; matchCount?: number }) =>
        search<ContactMatch[]>(searchContacts, query, options),
      [search]
    ),
    searchAllTables: useCallback(
      (query: string, options?: { matchThreshold?: number; matchCountPerTable?: number }) =>
        search<MultiTableMatch[]>(searchAllTables, query, options),
      [search]
    ),
    performEnrichedSearch: useCallback(
      (query: string, options?: { matchThreshold?: number; resultsPerTable?: number }) =>
        search<EnrichedSearchResult>(performEnrichedSearch, query, options),
      [search]
    ),
    searchSupportsEnriched: useCallback(
      (query: string, options?: { matchCount?: number }) =>
        search<EnrichedSupportMatch[]>(searchSupportsEnriched, query, options),
      [search]
    ),
  };
}
