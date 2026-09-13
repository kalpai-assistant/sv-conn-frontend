/**
 * SVC-290: tapping an L1 tile on Home opens a services bottom sheet.
 *
 * The sheet is a lightweight L1 → services picker — it lists every service
 * under the tapped L1, grouped by sub-category. Tapping a service inside the
 * sheet still navigates to `/service/$serviceId`, the existing full page,
 * which stays the home for banner media (SVC-293) and related-services
 * sections (SVC-292).
 *
 * The sheet lives at the root so `CategoryRail` and the `/category/$slug`
 * deep-link stub can both call `openCategory(id)` without prop drilling.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CategoryServicesSheet } from "@/components/home/CategoryServicesSheet";

interface CategorySheetContextValue {
  openCategoryId: string | null;
  openCategory: (categoryId: string) => void;
  closeCategory: () => void;
}

const CategorySheetContext = createContext<CategorySheetContextValue | null>(null);

export function CategorySheetProvider({ children }: { children: React.ReactNode }) {
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const openCategory = useCallback((categoryId: string) => {
    setOpenCategoryId(categoryId);
  }, []);

  const closeCategory = useCallback(() => {
    setOpenCategoryId(null);
  }, []);

  const value = useMemo(
    () => ({ openCategoryId, openCategory, closeCategory }),
    [openCategoryId, openCategory, closeCategory],
  );

  return (
    <CategorySheetContext.Provider value={value}>
      {children}
      {openCategoryId && (
        <CategoryServicesSheet categoryId={openCategoryId} onClose={closeCategory} />
      )}
    </CategorySheetContext.Provider>
  );
}

export function useCategorySheet(): CategorySheetContextValue {
  const ctx = useContext(CategorySheetContext);
  if (!ctx) {
    throw new Error("useCategorySheet must be used within a CategorySheetProvider");
  }
  return ctx;
}
