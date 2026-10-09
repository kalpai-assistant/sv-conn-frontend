export interface Category {
  id: string;
  name: string;
  /** URL-safe identifier from the backend. Keys the icon lookup in
   *  `lib/category-icons.ts` and supplies the param for the
   *  `/category/$slug` route — both need something stable and readable,
   *  which the UUID id is not. */
  slug: string;
  /** Catalogue ordering from the backend. Doubles as the index into the tile
   *  colour palette: the API exposes no colour per category, and this is the
   *  only stable per-category number it does return. */
  sortOrder: number;
  /** SVC-286: NULL ⇒ Level-1 (home tile). Non-NULL ⇒ Level-2 (rendered
   *  inside a category page as a sub-category tile). CategoryGrid filters to
   *  L1 for the home view; the category page renders sub-category tiles
   *  when the fetched category has children, or services when it doesn't. */
  parentId: string | null;
}

export interface ServiceProvider {
  id: string;
  name: string;
  phone: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  photo?: string;
}

/**
 * A priced option within a service — "2 BHK", "SUV", "Filter replacement".
 *
 * The booking is placed against a variant, not against the service's
 * `base_price`: that field is only the "starting at" figure shown before the
 * user has chosen. Booking without one lets the backend fall back to the first
 * variant, which is how every Vehicle Wash was being sold at Hatchback
 * pricing (SVC-232).
 */
export interface ServiceVariant {
  id: string;
  label: string;
  /** Groups variants under a heading when one service mixes kinds of work
   *  (RO Purifier: "Basic" / "Installation" / "Filter"). Null = ungrouped. */
  subcategory: string | null;
  price: number;
  /** What the provider earns on this variant, from `service_variants.provider_payout`.
   *  Carried because the provider-facing catalogue shows earnings rather than the
   *  customer price (SVC-258) — the number they actually decide on. Stored
   *  per-variant server-side even though today's values are a uniform 30% split,
   *  so it is read rather than derived. */
  payout: number;
  /** Variant-level override; falls back to the service's duration when unset. */
  duration?: string;
}

export interface Service {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  description: string;
  price: number;
  /** Cheapest variant's payout — the "from ₹X" the provider catalogue shows.
   *  Mirrors how `price` is derived for the consumer side. */
  payout: number;
  duration: string;
  /** Active variants in catalogue order. Can be empty for a service the
   *  catalogue hasn't priced yet — callers must handle that, not assume [0]. */
  variants: ServiceVariant[];
  provider?: ServiceProvider;
  image?: string;
  /** SVC-293: curated banner media. Both null by default — the service
   *  sheet's banner slot falls through to sub-category → L1 → colour block
   *  when they are, so partial coverage renders intentionally. */
  bannerImageUrl?: string | null;
  bannerVideoUrl?: string | null;
}

export interface Address {
  id: string;
  label: string;
  full: string;
  // Optional per the backend's BookingAddress schema (SVC-170): older
  // rows have no coordinates, and CreateAddressRequest accepts an
  // address without them. Consumers must treat `full` as the source of
  // truth and coordinates as an enhancement.
  lat?: number | null;
  lng?: number | null;
  // SVC-287: the parts a map cannot supply, read back so the edit form can
  // prefill them. All optional and null on every address saved before those
  // columns existed — an empty box is the honest rendering of a null column,
  // and the composed `full` above is what those rows still display.
  house_floor?: string | null;
  building?: string | null;
  landmark_area?: string | null;
  pincode?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
}

export interface Review {
  id: string;
  rating: number;
  reviewer: string;
  comment: string;
  date: string;
}

export type BookingStatus =
  "REQUESTED" | "ACCEPTED" | "EN_ROUTE" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED";

/**
 * One state change on a booking, as the API now reports it (SVC-248).
 *
 * `booking_status_logs` was write-only until then, so the tracking timeline
 * knew only the current status and could show neither when a stage was
 * reached nor, for a booking that ended early, how far it actually got.
 *
 * Empty is a real answer, not a loading state: bookings created before the
 * audit table existed have no entries at all, and the timeline degrades to
 * its old current-status-only rendering for them.
 */
export interface BookingStatusEvent {
  status: BookingStatus;
  at: string;
}

export interface BookingItem {
  id: string;
  serviceId: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Booking {
  id: string;
  // The `service` field is preserved for the "primary" service — either
  // the first item, or a placeholder when items haven't loaded yet. It
  // keeps every screen that reads `booking.service.name` working while
  // multi-service carts propagate. Read `items` for the whole cart.
  service: Service;
  items: BookingItem[];
  status: BookingStatus;
  address: Address;
  scheduledAt: string;
  otp?: string;
  paymentMethod: "online" | "cash";
  paymentStatus: "pending" | "paid" | "refunded";
  // Original sum of item totals, before discount, before tip.
  serviceAmount: number;
  discountAmount: number;
  tipAmount: number;
  // Sum the user was (or will be) charged: serviceAmount - discount + tip.
  totalAmount: number;
  // Provider earnings breakdown (SVC-41). BookingResponse has always carried
  // these — the mappers just weren't keeping them until the provider earnings
  // screen needed them. Snapshotted at booking creation.
  platformCommission: number;
  providerPayout: number;
  createdAt: string;
  // Oldest first. See BookingStatusEvent — may legitimately be empty.
  statusHistory: BookingStatusEvent[];
  // Who is doing the job (SVC-324). `null` means nobody: on an ACCEPTED job,
  // a team Pro declined and the SP has to pick someone else. `undefined` means
  // a backend that doesn't send the field yet. Never treat the two alike.
  professional?: BookingProfessional | null;
  // The business behind the job (SVC-324): set from the booking's SP, not
  // from the Pro, so it stays put while a team SP re-picks after a decline.
  // Same `undefined` (older backend) vs `null` (no SP yet) split as above.
  serviceProvider?: BookingServiceProvider | null;
}

export interface BookingProfessional {
  id: string;
  displayName: string;
  photoUrl: string | null;
  /** The SP's own Pro-for-self: the provider is doing it themselves. */
  isSelf: boolean;
}

export interface BookingServiceProvider {
  userId: string;
  /** Null until the SP names their business; most solo SPs never do. */
  businessName: string | null;
  businessImageUrl: string | null;
}

// Nothing imports this as a value — every consumer of this module uses
// `import type`. Kept as a shape reference alongside the interfaces above,
// with slugs matching the live catalogue so it doesn't drift into fiction.
export const categories: Category[] = [
  { id: "1", name: "Cleaning", slug: "cleaning", sortOrder: 0, parentId: null },
  { id: "2", name: "Pest Control", slug: "pest-control", sortOrder: 1, parentId: null },
  { id: "3", name: "AC", slug: "ac", sortOrder: 2, parentId: null },
  { id: "4", name: "Appliances", slug: "appliances", sortOrder: 3, parentId: null },
  { id: "5", name: "Electrician", slug: "electrician", sortOrder: 4, parentId: null },
  { id: "6", name: "Plumber", slug: "plumber", sortOrder: 5, parentId: null },
  { id: "7", name: "Carpenter", slug: "carpenter", sortOrder: 6, parentId: null },
  { id: "8", name: "Painting", slug: "painting", sortOrder: 7, parentId: null },
];

const providers: ServiceProvider[] = [
  {
    id: "p1",
    name: "Rajesh Kumar",
    phone: "+919876543210",
    rating: 4.8,
    reviewCount: 234,
    verified: true,
  },
  {
    id: "p2",
    name: "Priya Sharma",
    phone: "+919876543211",
    rating: 4.9,
    reviewCount: 189,
    verified: true,
  },
  {
    id: "p3",
    name: "Mohammed Irfan",
    phone: "+919876543212",
    rating: 4.6,
    reviewCount: 156,
    verified: true,
  },
  {
    id: "p4",
    name: "Lakshmi Devi",
    phone: "+919876543213",
    rating: 4.7,
    reviewCount: 312,
    verified: true,
  },
  {
    id: "p5",
    name: "Arun Patel",
    phone: "+919876543214",
    rating: 4.5,
    reviewCount: 98,
    verified: false,
  },
  {
    id: "p6",
    name: "Deepa Nair",
    phone: "+919876543215",
    rating: 4.9,
    reviewCount: 278,
    verified: true,
  },
];

export const services: Service[] = [
  {
    id: "s1",
    name: "Full Home Deep Cleaning",
    categoryId: "1",
    categoryName: "Cleaning",
    description:
      "Professional deep cleaning of your entire home including kitchen, bathrooms, bedrooms and living areas. Includes dusting, mopping, sanitization.",
    price: 1999,
    payout: 0,
    duration: "3-4 hours",
    variants: [],
    provider: providers[0],
  },
  {
    id: "s2",
    name: "Bathroom Deep Cleaning",
    categoryId: "1",
    categoryName: "Cleaning",
    description: "Thorough cleaning of bathrooms including tiles, fixtures, mirrors and floor.",
    price: 599,
    payout: 0,
    duration: "1 hour",
    variants: [],
    provider: providers[1],
  },
  {
    id: "s3",
    name: "Pipe Leak Repair",
    categoryId: "2",
    categoryName: "Plumbing",
    description: "Fix leaking pipes, joints and faucets. Includes basic materials.",
    price: 349,
    payout: 0,
    duration: "45 mins",
    variants: [],
    provider: providers[2],
  },
  {
    id: "s4",
    name: "Tap & Mixer Installation",
    categoryId: "2",
    categoryName: "Plumbing",
    description: "Installation of new taps, mixers and other fittings.",
    price: 249,
    payout: 0,
    duration: "30 mins",
    variants: [],
    provider: providers[2],
  },
  {
    id: "s5",
    name: "Fan Installation",
    categoryId: "3",
    categoryName: "Electrical",
    description: "Ceiling or wall fan installation with wiring.",
    price: 299,
    payout: 0,
    duration: "45 mins",
    variants: [],
    provider: providers[4],
  },
  {
    id: "s6",
    name: "Switchboard Repair",
    categoryId: "3",
    categoryName: "Electrical",
    description: "Repair or replacement of switchboards and sockets.",
    price: 199,
    payout: 0,
    duration: "30 mins",
    variants: [],
    provider: providers[4],
  },
  {
    id: "s7",
    name: "Women's Haircut",
    categoryId: "4",
    categoryName: "Salon",
    description: "Professional haircut at your doorstep by experienced stylist.",
    price: 499,
    payout: 0,
    duration: "45 mins",
    variants: [],
    provider: providers[5],
  },
  {
    id: "s8",
    name: "Bridal Makeup",
    categoryId: "4",
    categoryName: "Salon",
    description: "Complete bridal makeup package with HD finish.",
    price: 4999,
    payout: 0,
    duration: "2-3 hours",
    variants: [],
    provider: providers[5],
  },
  {
    id: "s9",
    name: "Single Room Painting",
    categoryId: "5",
    categoryName: "Painting",
    description: "Complete painting of one room including primer and 2 coats.",
    price: 2499,
    payout: 0,
    duration: "1 day",
    variants: [],
    provider: providers[3],
  },
  {
    id: "s10",
    name: "Furniture Assembly",
    categoryId: "6",
    categoryName: "Carpentry",
    description: "Assembly of flat-pack furniture (beds, wardrobes, shelves).",
    price: 499,
    payout: 0,
    duration: "1-2 hours",
    variants: [],
    provider: providers[0],
  },
  {
    id: "s11",
    name: "General Pest Control",
    categoryId: "7",
    categoryName: "Pest Control",
    description: "Cockroach, ant and spider treatment for 1BHK.",
    price: 799,
    payout: 0,
    duration: "1 hour",
    variants: [],
    provider: providers[3],
  },
  {
    id: "s12",
    name: "AC Service & Repair",
    categoryId: "8",
    categoryName: "Appliance",
    description: "Complete AC servicing including gas top-up, filter cleaning and general checkup.",
    price: 599,
    payout: 0,
    duration: "1 hour",
    variants: [],
    provider: providers[2],
  },
];

export const reviews: Review[] = [
  {
    id: "r1",
    rating: 5,
    reviewer: "Ananya Gupta",
    comment: "Excellent service! Very thorough and professional.",
    date: "2025-04-10",
  },
  {
    id: "r2",
    rating: 4,
    reviewer: "Vikram Singh",
    comment: "Good work, arrived on time. Could improve on communication.",
    date: "2025-04-08",
  },
  {
    id: "r3",
    rating: 5,
    reviewer: "Meera Krishnan",
    comment: "Best cleaning service I've ever used. Will book again!",
    date: "2025-04-05",
  },
  {
    id: "r4",
    rating: 4,
    reviewer: "Rohit Jain",
    comment: "Decent job. Price is fair for the quality.",
    date: "2025-04-02",
  },
  {
    id: "r5",
    rating: 5,
    reviewer: "Sneha Reddy",
    comment: "Very professional and polite. Highly recommend!",
    date: "2025-03-28",
  },
];

export const savedAddresses: Address[] = [
  { id: "a1", label: "Home", full: "12, Lane 5, Koregaon Park, Pune 411001" },
  { id: "a2", label: "Work", full: "WeWork Baner, Baner Road, Pune 411045" },
];

// Each mock booking synthesises a 1-item cart from its `service`. Enough
// for fallback dev data; real bookings from the API carry multiple items.
const _oneItemCart = (svc: Service, id: string): BookingItem[] => [
  {
    id: `${id}-item`,
    serviceId: svc.id,
    serviceName: svc.name,
    quantity: 1,
    unitPrice: svc.price,
    totalPrice: svc.price,
  },
];

export const mockBookings: Booking[] = [
  {
    id: "b1",
    service: services[0],
    items: _oneItemCart(services[0], "b1"),
    status: "IN_PROGRESS",
    address: savedAddresses[0],
    scheduledAt: "2026-04-15T10:00:00",
    otp: "4829",
    paymentMethod: "online",
    paymentStatus: "pending",
    statusHistory: [],
    serviceAmount: 2099,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 2099,
    platformCommission: 420,
    providerPayout: 1679,
    createdAt: "2026-04-15T09:30:00",
  },
  {
    id: "b2",
    service: services[11],
    items: _oneItemCart(services[11], "b2"),
    status: "ACCEPTED",
    address: savedAddresses[1],
    scheduledAt: "2026-04-15T14:00:00",
    otp: "7163",
    paymentMethod: "cash",
    paymentStatus: "pending",
    statusHistory: [],
    serviceAmount: 649,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 649,
    platformCommission: 130,
    providerPayout: 519,
    createdAt: "2026-04-15T12:00:00",
  },
  {
    id: "b3",
    service: services[6],
    items: _oneItemCart(services[6], "b3"),
    status: "COMPLETED",
    address: savedAddresses[0],
    scheduledAt: "2026-04-12T11:00:00",
    paymentMethod: "online",
    paymentStatus: "paid",
    statusHistory: [],
    serviceAmount: 549,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 549,
    platformCommission: 110,
    providerPayout: 439,
    createdAt: "2026-04-12T10:00:00",
  },
  {
    id: "b4",
    service: services[2],
    items: _oneItemCart(services[2], "b4"),
    status: "COMPLETED",
    address: savedAddresses[0],
    scheduledAt: "2026-04-10T16:00:00",
    paymentMethod: "cash",
    paymentStatus: "paid",
    statusHistory: [],
    serviceAmount: 399,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 399,
    platformCommission: 80,
    providerPayout: 319,
    createdAt: "2026-04-10T15:00:00",
  },
  {
    id: "b5",
    service: services[4],
    items: _oneItemCart(services[4], "b5"),
    status: "CANCELLED",
    address: savedAddresses[1],
    scheduledAt: "2026-04-08T09:00:00",
    paymentMethod: "online",
    paymentStatus: "refunded",
    statusHistory: [],
    serviceAmount: 349,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 349,
    platformCommission: 70,
    providerPayout: 279,
    createdAt: "2026-04-08T08:00:00",
  },
];

export const currentUser = {
  id: "u1",
  name: "Arjun Mehta",
  phone: "+919876543200",
  email: "arjun.mehta@gmail.com",
};
