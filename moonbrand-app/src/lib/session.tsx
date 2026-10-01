import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Account, BrandSummary, Session, SignInRequest, SignUpRequest } from '@moonbrand/shared/api/contract';

import { loadServer, refresh, setSignedOutHandler, setToken } from './api';
import { auth, brandsApi } from './services';

type Status = 'unknown' | 'signed-in' | 'signed-out';

interface SessionValue {
  status: Status;
  account: Account | null;
  brands: BrandSummary[];
  brandsLoaded: boolean;
  activeBrand: BrandSummary | null;
  signIn(request: SignInRequest): Promise<void>;
  signUp(request: SignUpRequest): Promise<void>;
  signOut(): Promise<void>;
  setActiveBrand(brandId: string): Promise<void>;
  reloadBrands(): Promise<BrandSummary[]>;
  // Un brand appena creato o modificato entra nell'elenco senza rileggerlo.
  upsertBrand(brand: BrandSummary, activate?: boolean): void;
}

const SessionContext = createContext<SessionValue | null>(null);

// L'account, i brand e quello attivo: come AuthService e BrandsService dello studio.
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('unknown');
  const [account, setAccount] = useState<Account | null>(null);
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandSummary[]>([]);
  const [brandsLoaded, setBrandsLoaded] = useState(false);

  const clear = useCallback(() => {
    setToken(null);
    setAccount(null);
    setActiveBrandId(null);
    setBrands([]);
    setBrandsLoaded(false);
    setStatus('signed-out');
  }, []);

  const reloadBrands = useCallback(async () => {
    const list = await brandsApi.list();
    setBrands(list);
    setBrandsLoaded(true);
    return list;
  }, []);

  const loadMe = useCallback(async () => {
    const me = await auth.me();
    setAccount(me.account);
    setActiveBrandId(me.activeBrandId);
    await reloadBrands();
    setStatus('signed-in');
  }, [reloadBrands]);

  useEffect(() => {
    setSignedOutHandler(clear);
    void (async () => {
      await loadServer();
      const token = await refresh();
      if (!token) return clear();
      try {
        await loadMe();
      } catch {
        clear();
      }
    })();
    return () => setSignedOutHandler(null);
  }, [clear, loadMe]);

  const start = useCallback(
    async (session: Session) => {
      setToken(session.accessToken, session.expiresIn);
      setAccount(session.account);
      await loadMe();
    },
    [loadMe],
  );

  const value = useMemo<SessionValue>(() => {
    const activeBrand = brands.find((brand) => brand.id === activeBrandId) ?? brands[0] ?? null;
    return {
      status,
      account,
      brands,
      brandsLoaded,
      activeBrand,
      signIn: async (request) => start(await auth.signIn(request)),
      signUp: async (request) => start(await auth.signUp(request)),
      signOut: async () => {
        await auth.signOut();
        clear();
      },
      setActiveBrand: async (brandId) => {
        const previous = activeBrandId;
        setActiveBrandId(brandId);
        try {
          await brandsApi.setActive(brandId);
        } catch (error) {
          setActiveBrandId(previous);
          throw error;
        }
      },
      reloadBrands,
      upsertBrand: (brand, activate = false) => {
        setBrands((list) => (list.some((item) => item.id === brand.id) ? list.map((item) => (item.id === brand.id ? brand : item)) : [...list, brand]));
        if (activate) setActiveBrandId(brand.id);
      },
    };
  }, [status, account, brands, brandsLoaded, activeBrandId, start, clear, reloadBrands]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fuori da SessionProvider');
  return value;
}

// Il brand attivo, nelle schermate che esistono solo con un brand.
export function useBrand(): BrandSummary {
  const { activeBrand } = useSession();
  if (!activeBrand) throw new Error('Nessun brand attivo');
  return activeBrand;
}
