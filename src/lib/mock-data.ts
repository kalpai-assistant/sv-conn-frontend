export interface Category {
  id: string;
  name: string;
  icon: string; // Lucide icon name
  color: string;
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
  duration: string;
  /** Active variants in catalogue order. Can be empty for a service the
   *  catalogue hasn't priced yet — callers must handle that, not assume [0]. */
  variants: ServiceVariant[];
  provider?: ServiceProvider;
  image?: string;
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
  createdAt: string;
}

export const categories: Category[] = [
  { id: "1", name: "Cleaning", icon: "Sparkles", color: "#6C5CE7" },
  { id: "2", name: "Plumbing", icon: "Wrench", color: "#0984E3" },
  { id: "3", name: "Electrical", icon: "Zap", color: "#FDCB6E" },
  { id: "4", name: "Salon", icon: "Scissors", color: "#E17055" },
  { id: "5", name: "Painting", icon: "Paintbrush", color: "#00B894" },
  { id: "6", name: "Carpentry", icon: "Hammer", color: "#D63031" },
  { id: "7", name: "Pest Control", icon: "Bug", color: "#636E72" },
  { id: "8", name: "Appliance", icon: "Settings", color: "#2D3436" },
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
    serviceAmount: 2099,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 2099,
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
    serviceAmount: 649,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 649,
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
    serviceAmount: 549,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 549,
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
    serviceAmount: 399,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 399,
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
    serviceAmount: 349,
    discountAmount: 0,
    tipAmount: 0,
    totalAmount: 349,
    createdAt: "2026-04-08T08:00:00",
  },
];

export const currentUser = {
  id: "u1",
  name: "Arjun Mehta",
  phone: "+919876543200",
  email: "arjun.mehta@gmail.com",
};
