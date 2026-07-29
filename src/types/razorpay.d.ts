// Razorpay checkout is loaded via a <script> tag, not a module — so the
// constructor lives on `window`. We only need enough typing to make
// `window.Razorpay` addressable; the call site casts to `any` for the actual
// options object shape, since the full SDK types aren't published as a package.
declare global {
  interface Window {
    Razorpay?: new (options: unknown) => { open(): void };
  }
}

export {};
