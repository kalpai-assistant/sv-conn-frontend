/**
 * SVC-290: tapping an L1 tile on Home opens a sub-categories picker sheet.
 *
 * The sheet shows the L1's sub-categories (L2s) as an illustrated grid.
 * Tapping a sub-category navigates to that L2's own `/category/{slug}`
 * services listing page (the existing screen, unchanged).
 *
 * The sheet lives at the root so `CategoryRail` and the `/category/$slug`
 * L1-deep-link stub can both call `openCategory(id)` without prop drilling.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { CategorySubcategoriesSheet } from "@/components/home/CategorySubcategoriesSheet";

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
        <CategorySubcategoriesSheet categoryId={openCategoryId} onClose={closeCategory} />
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
