/**
 * SVC-290: a service tap opens a bottom sheet, not a new page.
 *
 * The sheet lives at the root so any card (Home rails, category listing,
 * search results) can call `openService(id)` without prop-drilling and
 * without a route change. `/service/$serviceId` still resolves — it now
 * bounces to Home with the sheet auto-opened, so shared deep-links keep
 * working exactly as they did.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ServiceSheet } from "@/components/service/ServiceSheet";

interface ServiceSheetContextValue {
  openServiceId: string | null;
  openService: (serviceId: string) => void;
  closeService: () => void;
}

const ServiceSheetContext = createContext<ServiceSheetContextValue | null>(null);

export function ServiceSheetProvider({ children }: { children: React.ReactNode }) {
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);

  const openService = useCallback((serviceId: string) => {
    setOpenServiceId(serviceId);
  }, []);

  const closeService = useCallback(() => {
    setOpenServiceId(null);
  }, []);

  const value = useMemo(
    () => ({ openServiceId, openService, closeService }),
    [openServiceId, openService, closeService],
  );

  return (
    <ServiceSheetContext.Provider value={value}>
      {children}
      {openServiceId && <ServiceSheet serviceId={openServiceId} onClose={closeService} />}
    </ServiceSheetContext.Provider>
  );
}

export function useServiceSheet(): ServiceSheetContextValue {
  const ctx = useContext(ServiceSheetContext);
  if (!ctx) {
    throw new Error("useServiceSheet must be used within a ServiceSheetProvider");
  }
  return ctx;
}
