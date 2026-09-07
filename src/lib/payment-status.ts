/**
 * How a booking's payment state reads to a consumer (SVC-259).
 *
 * The tracking screen showed the method and the amount but never whether the
 * money had actually moved. "Paid" was inferred from the *absence* of the Pay
 * Now button — weak on a good day, and wrong on a bad one, because that button
 * is suppressed for CANCELLED and EXPIRED regardless of payment. An expired
 * booking therefore looked identical whether or not it had been charged.
 *
 * It matters more now that tracking is reached *after* paying rather than
 * before: the screen is the confirmation, so it should confirm something.
 *
 * Its own module rather than inline in the route so the wording can be tested
 * without mounting the screen — the failure worth catching is a raw enum value
 * reaching a consumer's receipt.
 */

/** Human wording for `payment_status`. */
export function paymentStatusLabel(status: string): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "refunded":
      return "Refunded";
    case "refund_processing":
      return "Refund on its way";
    case "refund_failed":
      // Deliberately not "failed": a failed refund is ours to chase, not
      // something the consumer did wrong or can act on.
      return "Refund being sorted";
    case "expired":
      return "Not paid";
    default:
      // Covers "pending" and anything a newer backend adds — a state this
      // client has not heard of must not render blank.
      return "Payment pending";
  }
}

/**
 * Green only for money that has actually arrived somewhere it should be.
 *
 * "Pending" stays neutral on purpose: nothing has gone wrong, the consumer
 * simply has not paid yet, and colouring it red would report a problem that
 * does not exist.
 */
export function paymentStatusTone(status: string): string {
  if (status === "paid" || status === "refunded") return "text-success";
  if (status === "refund_failed") return "text-destructive";
  return "text-muted-foreground";
}
