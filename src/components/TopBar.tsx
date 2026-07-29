import { MapPin, Bell } from "lucide-react";
import { useAddresses } from "@/hooks/useApi";

export function TopBar() {
  const { data: addresses } = useAddresses();
  const defaultAddress = addresses?.[0];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4">
      <button className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <div className="text-left">
          <p className="text-xs font-medium text-foreground leading-tight">
            {defaultAddress?.label || "Add Address"}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight truncate max-w-[200px]">
            {defaultAddress?.full || "Set your location"}
          </p>
        </div>
      </button>
      <button
        onClick={() => alert("You have no new notifications.")}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-secondary"
      >
        <Bell className="h-4 w-4 text-foreground" />
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
      </button>
    </header>
  );
}
