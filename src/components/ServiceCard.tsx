import { Star } from "lucide-react";
import type { Service } from "@/lib/mock-data";
import { Link } from "@tanstack/react-router";

export function ServiceCard({ service }: { service: Service }) {
  return (
    <Link
      to="/service/$serviceId"
      params={{ serviceId: service.id }}
      className="flex gap-3 rounded-xl bg-card p-3 shadow-sm border border-border/50 transition-shadow hover:shadow-md"
    >
      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-accent text-xl font-bold text-accent-foreground">
        {service.name.charAt(0)}
      </div>
      <div className="flex flex-1 flex-col justify-center min-w-0">
        <h3 className="text-sm font-semibold text-foreground truncate">{service.name}</h3>
        <p className="text-xs text-muted-foreground">Qualified Professionals</p>
        <div className="mt-1 flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-medium text-foreground">4.8</span>
          </div>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground">{service.duration}</span>
        </div>
      </div>
      <div className="flex flex-col items-end justify-center">
        <span className="text-sm font-bold text-primary">₹{service.price}</span>
      </div>
    </Link>
  );
}
