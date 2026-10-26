/**
 * Pre-booking FAQs — the questions users ask themselves right before
 * tapping Add to Cart (SVC-392).
 *
 * ## Why placeholder content ships with the component
 *
 * The ticket requires a per-service `faqs` field on the backend; populating
 * it is content-pipeline work (the ticket calls content "the long pole,
 * not the code"). Until per-service copy lands, the sheet renders a short
 * set of universal fallbacks — the three questions that apply to every
 * on-demand home service we offer. The alternative (hiding the section)
 * would make the sheet feel incomplete on every service for weeks.
 *
 * When the backend starts sending real `faqs`, caller-supplied content
 * takes precedence; the fallback never renders alongside real copy.
 */
import type { UI_ServiceFAQ } from "@/hooks/useApi";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FALLBACK_FAQS: UI_ServiceFAQ[] = [
  {
    question: "Do I need to provide any supplies?",
    answer:
      "No. Our pros bring everything needed to complete the service — equipment, cleaning materials, and consumables are all included in the price.",
  },
  {
    question: "Can I reschedule or cancel?",
    answer:
      "Yes. You can reschedule up to 2 hours before your slot without any charge. Cancellations within 2 hours of the slot may be billed up to a visit fee — check the booking confirmation for the exact window.",
  },
  {
    question: "What if I'm not satisfied?",
    answer:
      "Flag it from the booking screen within 24 hours of the service and we'll either re-do the problem area or process a full refund, whichever you prefer.",
  },
];

export function FAQSection({ faqs }: { faqs: UI_ServiceFAQ[] }) {
  const list = faqs.length > 0 ? faqs : FALLBACK_FAQS;

  return (
    <section aria-labelledby="faq-heading" className="px-4 pt-5">
      <h4 id="faq-heading" className="mb-1 text-sm font-semibold text-foreground">
        Frequently asked
      </h4>
      <Accordion type="single" collapsible className="w-full">
        {list.map((faq, i) => (
          <AccordionItem key={i} value={`faq-${i}`}>
            <AccordionTrigger className="text-sm text-foreground hover:no-underline">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
