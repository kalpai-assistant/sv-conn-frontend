import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CatalogBackLink() {
  return (
    <Button asChild variant="ghost" size="sm" className="-ml-2">
      <Link to="/operator/catalog">
        <ArrowLeft aria-hidden="true" />
        Catalog
      </Link>
    </Button>
  );
}
