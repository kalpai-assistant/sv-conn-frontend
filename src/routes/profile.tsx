import { createFileRoute, Link } from "@tanstack/react-router";
import { BackButton } from "@/components/BackButton";
import { useAuth } from "@/lib/auth-context";
import {
  AlertCircle,
  Briefcase,
  MapPin,
  Users,
  HelpCircle,
  Info,
  ChevronRight,
  Edit,
  Trash2,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";
import { toast } from "sonner";
import { useAddresses } from "@/hooks/useApi";
import { isTeamPro, useProMe } from "@/hooks/usePro";
import { hasPendingInvite } from "@/lib/invite";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { apiFetch } from "@/lib/api";
import type { components } from "@/types/api";
import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { AddAddressSheet, type EditingAddress } from "@/components/AddAddressSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NotificationsRow } from "@/components/NotificationsRow";
import { LanguageRow } from "@/components/language/LanguageRow";
import { APP_VERSION } from "@/lib/version";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — EazyServ" },
      { name: "description", content: "Manage your EazyServ profile." },
    ],
  }),
  component: ProfilePage,
});

/**
 * First letter only.
 *
 * The CSS `capitalize` class cannot be used for this string: it capitalises
 * every word, turning "2 saved · home in use" into "2 Saved · Home In Use".
 * Only the label is a proper noun here.
 */
function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function ProfilePage() {
  const { user, login, updateUser } = useAuth();
  const {
    data: savedAddresses,
    isLoading: isAddressesLoading,
    isError: isAddressesError,
  } = useAddresses();
  // Which address is actually in use. Read from the same hook the picker
  // writes to, so this row and the Home location bar cannot disagree.
  const { selected } = useSelectedAddress();
  const addressCount = savedAddresses?.length ?? 0;
  const navigate = useNavigate();
  // SVC-322: a Pro's account is a consumer account, and this is the screen
  // both apps share. Already cached by the root gate.
  const { data: proMe } = useProMe(user?.id);

  // Enforce setup mode if user name is not set. `!!` coerces the `user && ...`
  // short-circuit result (which is `undefined | boolean`) to a plain boolean so
  // the `disabled=` prop below stays `boolean | undefined`, not `boolean | null`.
  const isSetupMode = !!(user && !user.name);
  const [isEditing, setIsEditing] = useState(isSetupMode);

  const [editName, setEditName] = useState(user?.name || "");
  const [editEmail, setEditEmail] = useState(user?.email || "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  // SVC-277: both of these controls rendered and did nothing.

  // Sync state if user arrives late
  useEffect(() => {
    if (user && isSetupMode) {
      setIsEditing(true);
    }
  }, [user, isSetupMode]);

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
        // Replace: setup is a one-time gate the user has just cleared, so it
        // shouldn't sit under home as somewhere back returns to.
        //
        // Back to /invite if that is what they came for (SVC-322): a new
        // invitee is sent here for their name before they can join, and the
        // name matters — the backend takes the Pro's display name from it at
        // the moment they accept.
        navigate({ to: hasPendingInvite() ? "/invite" : "/", replace: true });
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
        <div className="flex min-w-0 items-center gap-3">
          {/* SVC-273: Profile left the tab bar for the Home avatar, so it needs
              its own way back — reached from the avatar it is a normal push,
              unlike a tab.

              Not in setup mode. A new user is sent here by the root guard until
              they have a name, so an arrow there would offer an escape from
              something they cannot actually skip: they would land on Home and
              be redirected straight back. */}
          {!isSetupMode && <BackButton fallbackTo="/" />}
          <h1 className="truncate text-lg font-semibold text-foreground">
            {isSetupMode ? "Setup Profile" : "Profile"}
          </h1>
        </div>
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
          {/* The way back into the Pro app (SVC-322). The gate lands a Pro
              there once per sign-in and then leaves them in whichever app
              they choose; this row is the consumer side's half of that pair,
              opposite "Book a service" on Pro Home. First, because for a Pro
              it is the reason they opened Profile. */}
          {isTeamPro(proMe) && (
            <div className="px-4 pt-4">
              <Link
                to="/pro"
                className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 transition-colors hover:bg-primary/10"
              >
                <Briefcase className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Open Pro app</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Your jobs with {proMe.service_provider.business_name?.trim() || "your team"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          )}

          {/* SVC-375: a team Pro's language, here because their avatar opens
              this screen. Team Pros only, and only while i18n_enabled, so a
              customer sees no change. The row stays English: /profile is a
              customer route; the choice applies inside the Pro app. */}
          {isTeamPro(proMe) && user?.i18n_enabled === true && (
            <div className="px-4 pt-3">
              <LanguageRow />
            </div>
          )}

          {/* The way onto a team for someone holding an invite code
              (SVC-322). The SMS link opens /invite directly where App Links
              work; this is the way in where they don't, or after the SMS is
              gone. Not shown to a Pro: they are on a team already. */}
          {proMe === null && (
            <div className="px-4 pt-4">
              <Link
                to="/invite"
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
              >
                <Users className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">Have an invite code?</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Join a service provider’s team
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </div>
          )}

          {/* Saved addresses (SVC-287).

              The list used to be inline here, with Edit and Delete as icon
              buttons inside every row. That shape produced two of Rohan's
              findings: the label rendered raw (`home`, not `Home`), and a row
              crowded with two destructive-adjacent controls could never itself
              become tappable.

              It is a screen of its own now. This row carries the count and
              which address is in use, so the common question is answered
              without a tap — and it is the one place on Profile that reports
              the active address, which is what the ticket asked for. */}
          <div className="px-4 pt-4">
            <Link
              to="/addresses"
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-secondary/50"
            >
              <MapPin className="h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Saved Addresses</p>
                <p className="truncate text-xs text-muted-foreground">
                  {isAddressesLoading
                    ? "Loading…"
                    : isAddressesError
                      ? "Couldn't load addresses"
                      : addressCount === 0
                        ? "None yet — add one"
                        : selected
                          ? `${addressCount} saved · ${capitalise(selected.label)} in use`
                          : `${addressCount} saved`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </div>

          {/* Menu Items */}
          <div className="px-4 pt-8 flex flex-col gap-1">
            {/* SVC-67: the user-gesture entry point for push permission —
                iOS Safari won't prompt without one. Renders nothing where
                push isn't supported. */}
            <NotificationsRow />
            {/* SVC-277: these were <button>s with no handler and no destination —
                a chevron promising a screen that did not exist. Payment History
                is deliberately absent rather than left dead: there is no such
                screen yet, and a row that does nothing is the exact bug this
                ticket is about. It comes back when it has somewhere to go. */}
            {[
              { to: "/support", icon: HelpCircle, label: "Help & Support" },
              { to: "/about", icon: Info, label: "About" },
            ].map(({ to, icon: Icon, label }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-secondary"
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="flex-1 text-left text-sm font-medium text-foreground">
                  {label}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>

          {/* Logout — shared with the provider profile (SVC-269). Extracted
              rather than duplicated: this control was consumer-only, and
              `__root.tsx` bounces providers off this route, so providers had no
              way to sign out at all. Sharing it means the next change to how
              signing out works cannot reach one persona and miss the other. */}
          <div className="px-4 pt-8 pb-4">
            <LogoutButton disabled={isEditing} />
          </div>

          {/* SVC-367: below Logout, last thing on the screen — both stores
              require it, but it should never be where a thumb lands first. */}
          <div className="px-4 pb-4">
            <DeleteAccountButton
              persona="consumer"
              isTeamPro={isTeamPro(proMe)}
              disabled={isEditing}
            />
          </div>

          {/* Small footer with the running JS bundle version. Doubles as a
              live check that the auto-publish release pipeline (SVC-227.2)
              landed the intended bundle on the device. */}
          <p className="pb-6 text-center text-[10px] text-muted-foreground">
            EazyServ · v{APP_VERSION}
          </p>
        </>
      )}
    </div>
  );
}
