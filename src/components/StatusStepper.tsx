import { Check } from "lucide-react";
import type { BookingStatus } from "@/lib/mock-data";

const steps: { status: BookingStatus; label: string }[] = [
  { status: "REQUESTED", label: "Requested" },
  { status: "ACCEPTED", label: "Accepted" },
  { status: "EN_ROUTE", label: "En Route" },
  { status: "IN_PROGRESS", label: "In Progress" },
  { status: "COMPLETED", label: "Completed" },
];

const statusOrder: BookingStatus[] = ["REQUESTED", "ACCEPTED", "EN_ROUTE", "IN_PROGRESS", "COMPLETED"];

export function StatusStepper({ currentStatus }: { currentStatus: BookingStatus }) {
  const currentIndex = statusOrder.indexOf(currentStatus);

  return (
    <div className="flex flex-col gap-0">
      {steps.map((step, i) => {
        const isCompleted = i < currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step.status} className="flex items-start gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full border-2 transition-colors ${
                  isCompleted
                    ? "border-success bg-success"
                    : isCurrent
                      ? "border-primary bg-primary"
                      : "border-border bg-card"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-3.5 w-3.5 text-success-foreground" />
                ) : (
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isCurrent ? "bg-primary-foreground" : "bg-muted-foreground/30"
                    }`}
                  />
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`h-6 w-0.5 ${
                    isCompleted ? "bg-success" : "bg-border"
                  }`}
                />
              )}
            </div>
            <span
              className={`pt-1 text-sm ${
                isCurrent
                  ? "font-semibold text-foreground"
                  : isCompleted
                    ? "font-medium text-success"
                    : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
