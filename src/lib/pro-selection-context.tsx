/**
 * SVC-416: one pro-selection sheet for the whole app.
 *
 * Rendered at the root, like ServiceSheetProvider, so Quick Add (+) on any
 * card and the ServiceSheet CTA open the same sheet without prop-drilling.
 * Also, a fixed-position sheet rendered inside a card is only fixed until
 * some ancestor gets a transform, and the cards sit in animated rails.
 *
 * Must wrap ServiceSheetProvider: ServiceSheet calls `useProSelection`, and
 * this sheet renders after it in the DOM, so it stacks on top at equal z.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { ProSelectionSheet } from "@/components/service/ProSelectionSheet";
import type { Service } from "@/lib/mock-data";

interface ProSelectionContextValue {
  openProSelection: (service: Service, variantId: string) => void;
  closeProSelection: () => void;
}

const ProSelectionContext = createContext<ProSelectionContextValue | null>(null);

export function ProSelectionProvider({ children }: { children: React.ReactNode }) {
  const [target, setTarget] = useState<{ service: Service; variantId: string } | null>(null);

  const openProSelection = useCallback((service: Service, variantId: string) => {
    setTarget({ service, variantId });
  }, []);

  const closeProSelection = useCallback(() => {
    setTarget(null);
  }, []);

  const value = useMemo(
    () => ({ openProSelection, closeProSelection }),
    [openProSelection, closeProSelection],
  );

  return (
    <ProSelectionContext.Provider value={value}>
      {children}
      <AnimatePresence>
        {target && (
          <ProSelectionSheet
            // A new service or variant is a new quote: remount rather than
            // carry the previous sheet's warning strip or confirm state over.
            key={`${target.service.id}:${target.variantId}`}
            service={target.service}
            variantId={target.variantId}
            onClose={closeProSelection}
          />
        )}
      </AnimatePresence>
    </ProSelectionContext.Provider>
  );
}

export function useProSelection(): ProSelectionContextValue {
  const ctx = useContext(ProSelectionContext);
  if (!ctx) {
    throw new Error("useProSelection must be used within a ProSelectionProvider");
  }
  return ctx;
}
