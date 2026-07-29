import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import {
  MapPin,
  CreditCard,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  Edit,
  Trash2,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { useAddresses } from "@/hooks/useApi";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AddAddressSheet } from "@/components/AddAddressSheet";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — ServiceConnect" },
      { name: "description", content: "Manage your ServiceConnect profile." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, login, logout, updateUser } = useAuth();
  const { data: savedAddresses, isLoading: isAddressesLoading } = useAddresses();
  const navigate = useNavigate();

  // Enforce setup mode if user name is not set. `!!` coerces the `user && ...`
  // short-circuit result (which is `undefined | boolean`) to a plain boolean so
  // the `disabled=` prop below stays `boolean | undefined`, not `boolean | null`.
  const isSetupMode = !!(user && !user.name);
  const [isEditing, setIsEditing] = useState(isSetupMode);

  const [editName, setEditName] = useState(user?.name || "");
  const [editEmail, setEditEmail] = useState(user?.email || "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [showAddAddress, setShowAddAddress] = useState(false);

  // Sync state if user arrives late
  useEffect(() => {
    if (user && isSetupMode) {
      setIsEditing(true);
    }
  }, [user, isSetupMode]);

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  const handleSave = async () => {
    if (!editName.trim()) {
      setErrorMsg("Name is required.");
      return;
    }

    setIsSaving(true);
    setErrorMsg("");
    try {
      const response = await apiFetch<components["schemas"]["UserResponse"]>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name: editName.trim(), email: editEmail.trim() || null }),
      });
      updateUser(response);
      setIsEditing(false);
      if (isSetupMode) {
        navigate({ to: "/" });
      }
    } catch (e) {
      console.error(e);
      setErrorMsg("Failed to save profile. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Please log in.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <h1 className="text-lg font-semibold text-foreground">
          {isSetupMode ? "Setup Profile" : "Profile"}
        </h1>
        {!isSetupMode && !isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="p-2 text-primary hover:bg-secondary rounded-full transition-colors"
          >
            <Edit className="h-4 w-4" />
          </button>
        )}
        {isEditing && !isSetupMode && (
          <button
            disabled={isSaving}
            onClick={() => {
              setIsEditing(false);
              setEditName(user.name || "");
              setEditEmail(user.email || "");
            }}
            className="p-2 text-muted-foreground hover:bg-secondary rounded-full transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* User Info / Edit Form */}
      <div className="flex flex-col gap-4 p-4 border-b border-border/50">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-bold text-primary-foreground">
            {(editName || user.name || "U")
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)}
          </div>
          <div className="flex-1">
            {isEditing ? (
              <div className="flex flex-col gap-3">
                {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
                <div>
                  <label className="text-xs font-medium text-muted-foreground ml-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    disabled={isSaving}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full mt-1 p-2 bg-secondary rounded-lg border border-border text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground ml-1">
                    Email <span className="text-muted-foreground/60">(Optional)</span>
                  </label>
                  <input
                    type="email"
                    disabled={isSaving}
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full mt-1 p-2 bg-secondary rounded-lg border border-border text-sm focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !editName.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                  >
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Save Profile
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-base font-semibold text-foreground">{user.name}</h2>
                <p className="text-sm text-muted-foreground">{user.phone}</p>
                {user.email && <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>}
              </>
            )}
          </div>
        </div>
      </div>

      {!isSetupMode && (
        <>
          {/* Addresses */}
          <div className="px-4 pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">My Addresses</h3>
            <div className="flex flex-col gap-2">
              {isAddressesLoading ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                (savedAddresses || []).map((addr) => (
                  <div
                    key={addr.id}
                    className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{addr.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{addr.full}</p>
                    </div>
                    <div className="flex gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-secondary">
                        <Edit className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button className="p-1.5 rounded-lg hover:bg-secondary">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    </div>
                  </div>
                ))
              )}
              <button
                onClick={() => setShowAddAddress(true)}
                className="flex items-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground mt-2 transition-colors hover:bg-secondary"
              >
                <MapPin className="h-4 w-4" /> Add New Address
              </button>
            </div>
          </div>

          {/* Menu Items */}
          <div className="px-4 pt-8 flex flex-col gap-1">
            {[
              { icon: CreditCard, label: "Payment History" },
              { icon: HelpCircle, label: "Help & Support" },
              { icon: Info, label: "About" },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-secondary"
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-left text-sm font-medium text-foreground">
                  {label}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>

          {/* Logout */}
          <div className="px-4 pt-8 pb-4">
            <button
              onClick={handleLogout}
              disabled={isEditing}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-destructive p-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </>
      )}

      {showAddAddress && <AddAddressSheet onClose={() => setShowAddAddress(false)} />}
    </div>
  );
}
