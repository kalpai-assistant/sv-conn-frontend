import { useState } from "react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { X, Loader2, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { MapPicker } from "./MapPicker";
import { isGeocodeFailure, withoutPinCode } from "@/lib/geocode-result";
import { useAddAddress, useUpdateAddress } from "@/hooks/useApi";
import { useMapOpeningCentre, type MapOpeningCentre } from "@/hooks/useMapOpeningCentre";
import { useSelectedAddress } from "@/hooks/useSelectedAddress";
import { useAuth } from "@/lib/auth-context";

/** The address being edited, when the sheet is opened from Edit (SVC-277). */
export interface EditingAddress {
  id: string;
  label: string;
  full: string;
  // SVC-287: prefilled from the stored columns, never parsed out of `full`.
  //
  // Null on every address saved before those columns existed, and the form
  // renders that as an empty box — which is honest. Splitting `full` on commas
  // to fill them would read "Lane Number 1, Kharadi, Pune…" and put a *street*
  // in the flat-number field; the user taps Save, and a provider is then sent
  // to a door number that nobody ever wrote down.
  house_floor?: string | null;
  building?: string | null;
  landmark_area?: string | null;
  pincode?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
}

/**
 * The ten digits of an Indian mobile number, for a field that shows `+91`
 * beside it.
 *
 * Stored and sent as `+91XXXXXXXXXX` to match `users.phone`, so a provider's
 * tap-to-call link does not care whether the number came from the account or
 * from an address's contact person. Only the display half is local.
 */
function localPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  return e164.replace(/^\+91/, "");
}

/**
 * One labelled box.
 *
 * The label sits inside as a placeholder while the box is empty and rises to
 * the border once it has a value — so a filled form still says what each line
 * is, which a placeholder-only field loses the moment it is typed into. That
 * matters most on the two optional fields, where "Amogh Residency Lane No 7"
 * on its own does not tell you whether it was meant as the building or the
 * landmark.
 */
function FormField({
  label,
  value,
  onChange,
  required = false,
  optional = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  optional?: boolean;
  inputMode?: "text" | "numeric";
}) {
  const filled = value.length > 0;
  return (
    <div className="relative">
      {filled && (
        <span className="absolute -top-2 left-3 bg-card px-1 text-[10px] text-muted-foreground">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </span>
      )}
      <input
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        placeholder={
          filled ? undefined : `${label}${optional ? " (Optional)" : required ? " *" : ""}`
        }
        className="w-full rounded-xl border border-border bg-transparent px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

export function AddAddressSheet({
  onClose,
  editing,
  initialCentre,
}: {
  onClose: () => void;
  editing?: EditingAddress;
  /**
   * Open the map here rather than resolving a centre (SVC-283).
   *
   * Passed by the location gate after "Use my current location" has actually
   * acquired a fix. That fix is better than anything `useMapOpeningCentre`
   * could work out — it is a live position the user just asked for, not an
   * inference from a saved address — and letting the hook run anyway would
   * race it and could open the map somewhere else entirely.
   */
  initialCentre?: [number, number] | null;
}) {
  // Sheets are mounted only while open, so locking on mount is the same as
  // locking on open. Without this the page scrolls behind the backdrop.
  useLockBodyScroll(true);

  // Editing opens straight on the form. The map step exists to pick a point
  // for a brand-new address; someone correcting a flat number should not have
  // to re-pin their building, and re-pinning is how a small text edit turns
  // into a moved location.
  const [step, setStep] = useState<"map" | "form">(editing ? "form" : "map");
  const [lat, setLat] = useState(0);
  const [lng, setLng] = useState(0);
  // What the geocoder called this point — the locality shown above the form,
  // and the tail the backend appends when it composes the stored line.
  const [addressLine, setAddressLine] = useState(editing?.full ?? "");
  const [label, setLabel] = useState(
    editing ? editing.label.charAt(0).toUpperCase() + editing.label.slice(1) : "Home",
  );

  // SVC-287: the parts a map cannot know.
  //
  // Prefilled from the stored columns when editing, empty when they are null —
  // which is every address saved before those columns existed. An empty box is
  // the honest rendering of a null column; the alternative is splitting the
  // composed line on commas, which would offer "Lane Number 1" as a flat
  // number and get it saved as one.
  const [houseFloor, setHouseFloor] = useState(editing?.house_floor ?? "");
  const [building, setBuilding] = useState(editing?.building ?? "");
  const [landmarkArea, setLandmarkArea] = useState(editing?.landmark_area ?? "");
  const [pincode, setPincode] = useState(editing?.pincode ?? "");

  // Who meets the provider. Seeded from the account on a new address, because
  // the common case is the person booking — one less thing to type, and the
  // field arrives populated rather than blank. Editable for the cases where it
  // is a parent, a tenant, a flatmate.
  const { user } = useAuth();
  const [contactName, setContactName] = useState(
    editing ? (editing.contact_name ?? "") : (user?.name ?? ""),
  );
  const [contactPhone, setContactPhone] = useState(
    editing ? localPhone(editing.contact_phone) : localPhone(user?.phone),
  );
  const { mutateAsync: addAddress, isPending: isAdding } = useAddAddress();
  const { mutateAsync: updateAddress, isPending: isUpdating } = useUpdateAddress();
  // A new address becomes the selected one — see handleSave.
  const { setSelectedId } = useSelectedAddress();
  const isPending = isAdding || isUpdating;
  const [errorMsg, setErrorMsg] = useState("");
  // Where the map should open. Null until resolved — see useMapOpeningCentre.
  const resolved = useMapOpeningCentre();
  // A caller-supplied centre wins outright: it is a position the user just
  // asked for and waited on, so there is nothing to resolve and no honest
  // reason to show the "this map is a guess" banner over it.
  const opening: MapOpeningCentre = initialCentre
    ? { centre: initialCentre, source: "position", fallbackLabel: resolved.fallbackLabel }
    : resolved;
  const handleLocationSelected = (l: number, g: number, addr: string) => {
    setLat(l);
    setLng(g);
    // A failed geocode is not an address (SVC-283). MapPicker reports one as
    // "Unknown Location" or "Could not fetch address", and both are long
    // enough to satisfy the backend's min_length — so without this they get
    // saved verbatim and the user ends up with an address book entry called
    // "Could not fetch address".
    //
    // Same class of bug as the coordinate strings this ticket removes: text
    // that describes our failure, stored as though it described a place.
    // Blanking it leaves the field empty with its placeholder showing, which
    // is what the form is for.
    //
    // The PIN code goes too, because OSM's is wrong for Kharadi (411001 for
    // what is really 411014) and no zoom level fixes it — see withoutPinCode.
    setAddressLine(isGeocodeFailure(addr) ? "" : withoutPinCode(addr));
  };

  /**
   * The structured fields as the API takes them.
   *
   * An untouched box sends `undefined`, not `""`. On a PATCH those are
   * different things: `undefined` means "this edit did not mention the
   * landmark", while an empty string would ask the backend to clear one the
   * user never looked at.
   */
  const structuredFields = () => ({
    house_floor: houseFloor.trim() || undefined,
    building: building.trim() || undefined,
    landmark_area: landmarkArea.trim() || undefined,
    pincode: pincode.trim() || undefined,
    contact_name: contactName.trim() || undefined,
    // Sent in the stored form; the field only ever shows the local ten digits.
    contact_phone: contactPhone.trim() ? `+91${contactPhone.trim()}` : undefined,
  });

  const handleSave = async () => {
    try {
      setErrorMsg("");
      // House & Floor is the one field a provider cannot do without, so a new
      // address must carry it.
      //
      // An *edit* must not (SVC-287). Every address saved before these columns
      // existed has none, and demanding one to change a label would turn an
      // unrelated edit into an upgrade prompt. The backend agrees: the PATCH
      // schema leaves it optional.
      if (!editing && !houseFloor.trim()) {
        setErrorMsg("Add your flat or house number so the provider can find your door.");
        return;
      }
      // A PIN code is optional, but a half-typed one is worse than none — it
      // reaches the provider looking authoritative. The backend pattern would
      // reject it as a bare 422; this says which field and why.
      if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
        setErrorMsg("A PIN code is six digits.");
        return;
      }
      if (contactPhone.trim() && !/^\d{10}$/.test(contactPhone.trim())) {
        setErrorMsg("A mobile number is ten digits, after +91.");
        return;
      }
      // The locality still has to exist: it is the tail the backend appends,
      // and without it a composed address names a flat and no city. Empty only
      // when the geocode failed, which SVC-283 leaves for the user to fill.
      if (addressLine.trim().length < 5) {
        setErrorMsg("Add the area or locality so the provider knows where to go.");
        return;
      }
      if (editing) {
        // Coordinates are omitted unless the user actually re-pinned: sending
        // the initial 0,0 would move the address to the Gulf of Guinea. The
        // backend keeps the existing point when lat/lng are absent.
        const moved = lat !== 0 || lng !== 0;
        await updateAddress({
          addressId: editing.id,
          label: label.toLowerCase(),
          full_address: addressLine,
          ...(moved ? { lat, lng } : {}),
          ...structuredFields(),
        });
      } else {
        const created = await addAddress({
          label: label.toLowerCase(),
          full_address: addressLine,
          lat,
          lng,
          ...structuredFields(),
        });
        // Saving an address is choosing it (SVC-283).
        //
        // The sheet used to save and close, leaving the selection pointing
        // wherever it already pointed — so someone who added an address in
        // Kharadi went back to a header still reading Karve Nagar, and the
        // next booking would have gone to the old address. Invisible on the
        // profile screen, where adding an address is genuinely just adding one;
        // glaring from the location gate, where the user has just answered
        // "where are you?" and watched the answer be ignored.
        //
        // Selection is stored by id (see useSelectedAddress), which is why
        // this needs the created row rather than a refetch.
        if (created?.id) setSelectedId(created.id);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save address");
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] flex-col rounded-t-3xl border-t border-border bg-card shadow-2xl safe-bottom"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
          <h2 className="text-lg font-semibold text-foreground">
            {step === "map" ? "Pin Location" : editing ? "Edit Address" : "Address Details"}
          </h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-secondary">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {step === "map" ? (
          <div className="flex-1 flex flex-col relative min-h-0">
            {/* SVC-281: don't mount the map until we know where to open it.
                Rendering first and recentring after would drag the view out
                from under anyone who started moving the pin immediately. */}
            {opening.centre === null ? (
              <div className="flex flex-1 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* AC2: a wrong-city map used to be silent. If we are guessing,
                    name the guess so the user knows to move it rather than
                    trusting a pin 840km from home. */}
                {/* The banner stays; the button that used to sit under it does
                    not (SVC-287).

                    Naming the guess is the SVC-281 fix and still earns its
                    place — a wrong-city map used to be silent, and a user who
                    does not know the pin is 840km out has no reason to move
                    it. What went is the second "Use my current location"
                    button, which duplicated the locate control already inside
                    the map a few pixels below it.

                    Three of them existed in one flow: the gate's Enable, this,
                    and the map's own. A user who arrived here by tapping "we
                    cannot find you → enter it manually" was then offered the
                    same failed question twice more. The map's own button is
                    the one that stays: it sits where the pin it moves is. */}
                {opening.source === "fallback" && (
                  <div className="border-b border-border bg-secondary px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      We don&apos;t know where you are yet, so this map is a guess. Drag the pin to
                      your address, or tap the locate button.
                    </p>
                  </div>
                )}
                <MapPicker
                  // `initialCenter` seeds MapPicker's state once, so changing
                  // it cannot move an already-rendered map. Keying on the
                  // coordinates remounts it instead — which is what makes "use
                  // my current location" actually jump the pin rather than
                  // silently fetching a position and doing nothing with it.
                  // Keyed on the opening centre alone now (SVC-287). The
                  // sheet used to hold an `override` purely to remount this
                  // map when its own locate button fetched a position — that
                  // button is gone, and MapPicker's own control recentres
                  // itself via handleCenterChanged, so there is nothing left
                  // for an override to do.
                  key={opening.centre?.join(",")}
                  initialCenter={opening.centre}
                  onLocationSelected={handleLocationSelected}
                />
              </>
            )}
            <div className="p-4 border-t border-border bg-card">
              <button
                onClick={() => setStep("form")}
                className="w-full h-12 bg-primary text-primary-foreground font-semibold rounded-xl"
              >
                Confirm Location
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {errorMsg && (
              <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg">
                {errorMsg}
              </div>
            )}

            {/* Where the pin is, restated above the boxes (SVC-287).
                
                The map is gone from this step, so without this the user is
                typing a flat number with no reminder of which building it
                belongs to. `Change` goes back rather than opening a second
                map — the pin already exists, this is a correction. */}
            <div className="flex items-start gap-3 rounded-xl border border-border bg-secondary/40 p-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                {addressLine || "Location not set"}
              </p>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setStep("map")}
                  className="shrink-0 rounded-lg border border-primary px-3 py-1 text-xs font-medium text-primary"
                >
                  Change
                </button>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Add address</p>

              {/* The one field a provider cannot do without, so it is first and
                  it is the only required one. Empty on an address saved before
                  these columns existed — see EditingAddress for why it is not
                  parsed out of the stored line. */}
              <FormField
                label="House No. & Floor"
                required
                value={houseFloor}
                onChange={setHouseFloor}
              />
              <FormField
                label="Building & Block No."
                optional
                value={building}
                onChange={setBuilding}
              />
              <FormField
                label="Landmark & Area Name"
                optional
                value={landmarkArea}
                onChange={setLandmarkArea}
              />
              {/* Ours, not a pattern borrowed from anywhere: the geocoder's PIN
                  code is wrong here (411001 for Kharadi, which is 411014 —
                  SVC-284), so the only trustworthy source is the person who
                  lives there. Optional, because a wrong one is worse than none
                  and nobody should be blocked on recalling it. */}
              <FormField
                label="PIN code"
                optional
                value={pincode}
                onChange={(v) => setPincode(v.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground">Add address label</p>
              <div className="flex gap-2">
                {["Home", "Work", "Other"].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLabel(l)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      label === l
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* "Contact person", not "receiver" — we send a plumber to a flat,
                not a parcel. Optional throughout: whether a customer names
                someone is their business, and left blank the provider falls
                back to the person who booked, exactly as before. */}
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">
                Contact person <span className="font-normal text-muted-foreground">(Optional)</span>
              </p>
              <FormField label="Name" value={contactName} onChange={setContactName} />
              <div className="flex items-stretch gap-2">
                <div className="flex items-center rounded-xl border border-border px-3 text-sm text-muted-foreground">
                  +91
                </div>
                <div className="min-w-0 flex-1">
                  <FormField
                    label="Mobile number"
                    value={contactPhone}
                    onChange={(v) => setContactPhone(v.replace(/\D/g, "").slice(0, 10))}
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4">
              <button
                onClick={handleSave}
                disabled={isPending}
                className="w-full flex items-center justify-center h-12 bg-primary text-primary-foreground font-semibold rounded-xl disabled:opacity-70"
              >
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save Address"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );
}
