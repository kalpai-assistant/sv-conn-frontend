// Razorpay checkout is loaded via a <script> tag, not a module — so the
// constructor lives on `window`. Types here cover only what we actually pass
// and consume; the full SDK surface is much larger, but Razorpay doesn't
// publish official types as an npm package, so we type just what the code
// touches (used call sites in src/routes/tracking.$bookingId.tsx).
export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
}

// What Razorpay hands back to the `handler` callback on successful checkout.
// Every field is a caller-verified string — we forward them verbatim to the
// backend's /payments/verify, which re-checks the signature.
export interface RazorpaySuccessResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayInstance {
  open(): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

export {};
