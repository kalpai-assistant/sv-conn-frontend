/** The /operator/kyc page through the real router and guard. Only fetch is faked. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setSessionToken } from "@/lib/api";
import { resetAuthState, type AdminRole } from "@/lib/auth";
import { KYC_PENDING_COUNT_PATH, kycQueuePath, type KycQueueRow, type KycTab } from "@/lib/kyc";
import { adminUser, appError, json, mockApi, renderApp } from "@/test/harness";
import { KYC_VERDICT_FIXTURES, kycDetail, proRow, spRow } from "@/test/kyc-fixtures";

const ME = "GET /admin/auth/me";
const COUNT = `GET ${KYC_PENDING_COUNT_PATH}`;
const queue = (tab: KycTab = "pending", page = 1) => `GET ${kycQueuePath(tab, page)}`;

const ASHA = spRow();
const HARI = proRow();
const ASHA_DETAIL = "GET /admin/providers/u-asha/kyc";
const ASHA_VERIFY = "POST /admin/providers/u-asha/kyc/verify";
const ASHA_REJECT = "POST /admin/providers/u-asha/kyc/reject";
const HARI_DETAIL = "GET /admin/pros/p-hari/kyc";
const HARI_VERIFY = "POST /admin/pros/p-hari/kyc/verify";
const HARI_REJECT = "POST /admin/pros/p-hari/kyc/reject";

const REVIEWED = { kyc_status: "verified", kyc_reviewed_at: "2026-11-06T10:00:00Z" } as const;

type Routes = Record<string, () => Response | Promise<Response>>;

function signedIn(routes: Routes = {}, role: AdminRole = "admin") {
  setSessionToken("t1");
  return mockApi({
    [ME]: () => json(adminUser(role)),
    [COUNT]: () => json({ count: 2 }),
    [queue()]: () => json([ASHA, HARI]),
    [ASHA_DETAIL]: () => json(kycDetail()),
    [HARI_DETAIL]: () => json({ ...kycDetail({ name: "Hari Kumar" }), kind: "pro" }),
    ...routes,
  });
}

function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const row = (name: string | RegExp) => screen.findByRole("button", { name });

async function select(name: string | RegExp) {
  await userEvent.click(await row(name));
  return screen.findByRole("region", { name: "KYC detail" });
}

const approveButton = () => screen.findByRole("button", { name: "Approve" });
const rejectButton = () => screen.findByRole("button", { name: "Reject" });
const filter = (name: string) =>
  within(screen.getByRole("navigation", { name: "KYC filters" })).getByRole("link", { name });

beforeEach(() => {
  resetAuthState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the queue", () => {
  it("always asks for team Pros too, and shows who each row is", async () => {
    const api = signedIn({ [queue()]: () => json([ASHA, HARI, spRow({ id: "x", name: null })]) });
    renderApp("/operator/kyc");

    expect(await screen.findByRole("heading", { name: "KYC review queue" })).toBeInTheDocument();
    expect(await row(/Asha Rao/)).toHaveTextContent("+919000000001");
    expect(api.count(queue())).toBeGreaterThan(0);
    expect(await row(/\(no name yet\)/)).toBeInTheDocument();
  });

  it("marks a team Pro and shows its business name", async () => {
    signedIn();
    renderApp("/operator/kyc");

    expect(await row(/Hari Kumar/)).toHaveTextContent("Team Pro · Bright Homes");
    expect(await row(/Asha Rao/)).not.toHaveTextContent("Team Pro");
  });

  it("still marks a Pro whose owner has no business name", async () => {
    signedIn({ [queue()]: () => json([proRow({ sp_business_name: null })]) });
    renderApp("/operator/kyc");

    const button = await row(/Hari Kumar/);
    expect(button).toHaveTextContent("Team Pro");
    expect(button).not.toHaveTextContent("·");
  });

  it("gives a pending row its age dot, and no other filter does", async () => {
    signedIn({
      [queue("approved")]: () => json([spRow({ ...REVIEWED })]),
    });
    renderApp("/operator/kyc");

    expect((await row(/Asha Rao/)).querySelector("[aria-hidden='true'].rounded-full")).toBeTruthy();

    await userEvent.click(filter("Approved"));
    await waitFor(() => expect(filter("Approved")).toHaveAttribute("aria-current", "page"));
    expect((await row(/Asha Rao/)).querySelector("[aria-hidden='true'].rounded-full")).toBeNull();
  });

  it("shows the reason on a rejected row", async () => {
    signedIn({
      [queue("rejected")]: () =>
        json([
          spRow({
            kyc_status: "rejected",
            kyc_reviewed_at: "2026-11-06T10:00:00Z",
            kyc_rejection_reason: "Blurred photo",
          }),
        ]),
    });
    renderApp("/operator/kyc?tab=rejected");

    expect(await row(/Asha Rao/)).toHaveTextContent("Reason: Blurred photo");
  });

  it("shows each row's status under All, and the reason on a rejected one", async () => {
    signedIn({
      [queue("all")]: () =>
        json([
          spRow(),
          spRow({ id: "e", name: "Esha", ...REVIEWED }),
          spRow({
            id: "f",
            name: "Farid",
            kyc_status: "rejected",
            kyc_rejection_reason: "Blurred photo",
          }),
        ]),
    });
    renderApp("/operator/kyc?tab=all");

    expect(await row(/Asha Rao/)).toHaveTextContent("Pending");
    expect(await row(/Esha/)).toHaveTextContent("Approved");
    const farid = await row(/Farid/);
    expect(farid).toHaveTextContent("Rejected");
    expect(farid).toHaveTextContent("Reason: Blurred photo");
  });

  it("renders a name and a reason as text, never as markup", async () => {
    const hostile = '<img src=x onerror="window.pwned=1">';
    signedIn({
      [queue("all")]: () =>
        json([spRow({ name: hostile, kyc_status: "rejected", kyc_rejection_reason: hostile })]),
      [ASHA_DETAIL]: () =>
        json(
          kycDetail({
            name: hostile,
            kyc_status: "rejected",
            kyc_rejection_reason: hostile,
            aadhaar_front_url: null,
            aadhaar_back_url: null,
            selfie_url: null,
          }),
        ),
    });
    renderApp("/operator/kyc?tab=all");

    const pane = await select(/onerror/);
    await within(pane).findByText("Rejection reason");
    expect(within(pane).getAllByText(hostile).length).toBeGreaterThan(0);
    expect(document.querySelector("main img")).toBeNull();
  });
});

describe("the filters", () => {
  it.each<[string, KycTab]>([
    ["Approved", "approved"],
    ["Rejected", "rejected"],
    ["Auto-approved", "auto-approved"],
    ["All", "all"],
  ])("%s is kept in the URL and asks the backend for it", async (label, tab) => {
    const api = signedIn({ [queue(tab)]: () => json([]) });
    const router = renderApp("/operator/kyc");
    await row(/Asha Rao/);

    await userEvent.click(filter(label));

    await waitFor(() => expect(api.count(queue(tab))).toBeGreaterThan(0));
    expect(router.state.location.search).toMatchObject({ tab });
    expect(filter(label)).toHaveAttribute("aria-current", "page");
  });

  it("Pending takes the filter back out of the URL", async () => {
    signedIn({ [queue("all")]: () => json([]) });
    const app = renderApp("/operator/kyc?tab=all");
    await screen.findByText("No KYC submissions yet.");

    await userEvent.click(filter("Pending"));

    await row(/Asha Rao/);
    expect(app.state.location.search).not.toHaveProperty("tab");
  });

  it("opens straight on the filter in the URL", async () => {
    const api = signedIn({ [queue("rejected")]: () => json([]) });
    renderApp("/operator/kyc?tab=rejected");

    expect(await screen.findByText("No rejections yet.")).toBeInTheDocument();
    expect(filter("Rejected")).toHaveAttribute("aria-current", "page");
    expect(api.count(queue())).toBe(0);
  });

  it.each([
    ["a bad tab", "?tab=nonsense"],
    ["a page of 0", "?page=0"],
    ["a negative page", "?page=-2"],
    ["a text page", "?page=abc"],
    ["both", "?tab=7&page=abc"],
  ])("treats %s as the default", async (_name, search) => {
    const api = signedIn();
    renderApp(`/operator/kyc${search}`);

    await row(/Asha Rao/);
    expect(api.count(queue())).toBeGreaterThan(0);
    expect(filter("Pending")).toHaveAttribute("aria-current", "page");
  });

  it.each<[KycTab, string, string]>([
    ["pending", "No pending reviews.", "All caught up. Newly submitted KYCs will appear here."],
    ["approved", "No approved KYCs yet.", "Approved KYCs will appear here for reference."],
    ["rejected", "No rejections yet.", "Rejected KYCs will appear here for reference."],
    [
      "auto-approved",
      "No auto-approvals in the last 7 days.",
      "The AI hasn't waved anyone through yet — nothing to spot-check.",
    ],
    ["all", "No KYC submissions yet.", "Submitted KYCs will appear here."],
  ])("an empty %s says so", async (tab, head, body) => {
    signedIn({ [queue(tab)]: () => json([]) });
    renderApp(tab === "pending" ? "/operator/kyc" : `/operator/kyc?tab=${tab}`);

    expect(await screen.findByText(head)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
  });

  it("clears the selection when the filter changes", async () => {
    signedIn({ [queue("all")]: () => json([]) });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);
    await within(pane).findByRole("heading", { name: "Asha Rao" });

    await userEvent.click(filter("All"));

    await screen.findByText("No KYC submissions yet.");
    expect(screen.queryByRole("heading", { name: "Asha Rao" })).not.toBeInTheDocument();
  });
});

describe("loading and failure", () => {
  it("says the queue failed rather than that it's empty, and Try again recovers", async () => {
    let fail = true;
    signedIn({
      [queue()]: () => (fail ? json({ message: "Boom" }, 500) : json([ASHA])),
    });
    renderApp("/operator/kyc");

    expect(await screen.findByText("Couldn't load the KYC queue.")).toBeInTheDocument();
    expect(screen.queryByText("No pending reviews.")).not.toBeInTheDocument();

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await row(/Asha Rao/)).toBeInTheDocument();
  });

  it("a failed refresh shows an error with a retry, not the old rows", async () => {
    let approved = false;
    signedIn({
      [queue()]: () => (approved ? json({ message: "Boom" }, 500) : json([ASHA])),
      [ASHA_VERIFY]: () => {
        approved = true;
        return json({ kyc_status: "verified" });
      },
    });
    renderApp("/operator/kyc");
    await select(/Asha Rao/);

    await userEvent.click(await approveButton());

    expect(await screen.findByText("Couldn't load the KYC queue.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Asha Rao/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("says the detail failed, and Try again recovers", async () => {
    let fail = true;
    signedIn({
      [ASHA_DETAIL]: () => (fail ? json({ message: "Boom" }, 500) : json(kycDetail())),
    });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    expect(
      await within(pane).findByText("Couldn't load this provider's documents."),
    ).toBeInTheDocument();

    fail = false;
    await userEvent.click(within(pane).getByRole("button", { name: "Try again" }));

    expect(await within(pane).findByText("Documents")).toBeInTheDocument();
  });
});

describe("paging", () => {
  const fullPage = (): KycQueueRow[] =>
    Array.from({ length: 50 }, (_, i) => spRow({ id: `u${i}`, name: `Person ${i}` }));

  it("hides the pager when one short page is all there is", async () => {
    signedIn();
    renderApp("/operator/kyc");

    await row(/Asha Rao/);
    expect(screen.queryByRole("link", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  });

  it("a full page offers Next, and page 2 goes in the URL with its own query", async () => {
    const api = signedIn({
      [queue()]: () => json(fullPage()),
      [queue("pending", 2)]: () => json([spRow({ id: "last", name: "Last person" })]),
    });
    const router = renderApp("/operator/kyc");

    await userEvent.click(await screen.findByRole("link", { name: "Next" }));

    expect(await row(/Last person/)).toBeInTheDocument();
    expect(api.count(queue("pending", 2))).toBeGreaterThan(0);
    expect(router.state.location.search).toMatchObject({ page: 2 });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("changing the filter goes back to page 1", async () => {
    const api = signedIn({
      [queue("pending", 2)]: () => json([ASHA]),
      [queue("all")]: () => json([]),
    });
    renderApp("/operator/kyc?page=2");
    await row(/Asha Rao/);

    await userEvent.click(filter("All"));

    await waitFor(() => expect(api.count(queue("all"))).toBeGreaterThan(0));
  });

  it("an empty page 2 after a full page 1 isn't 'No pending reviews', and has a way back", async () => {
    signedIn({
      [queue()]: () => json(fullPage()),
      [queue("pending", 2)]: () => json([]),
    });
    renderApp("/operator/kyc");

    await userEvent.click(await screen.findByRole("link", { name: "Next" }));

    expect(await screen.findByText("Nothing on this page.")).toBeInTheDocument();
    expect(screen.queryByText("No pending reviews.")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Previous" }));

    expect(await row(/Person 0/)).toBeInTheDocument();
  });

  it("approving the last row on page 2 keeps the confirmation and a way back", async () => {
    let done = false;
    signedIn({
      [queue("pending", 2)]: () => json(done ? [] : [ASHA]),
      [ASHA_VERIFY]: () => {
        done = true;
        return json({ kyc_status: "verified" });
      },
    });
    renderApp("/operator/kyc?page=2");
    await select(/Asha Rao/);

    await userEvent.click(await approveButton());

    expect(await screen.findByText("Nothing on this page.")).toBeInTheDocument();
    expect(screen.queryByText("No pending reviews.")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("KYC verified: Asha Rao");
    expect(screen.getByRole("link", { name: "Previous" })).toBeInTheDocument();
  });
});

describe("the detail", () => {
  it("reads an SP's detail from the SP route", async () => {
    const api = signedIn();
    renderApp("/operator/kyc");

    await select(/Asha Rao/);

    await waitFor(() => expect(api.count(ASHA_DETAIL)).toBeGreaterThan(0));
    expect(api.count(HARI_DETAIL)).toBe(0);
  });

  it("reads a Pro's detail by professional id, never its user id on the SP route", async () => {
    const api = signedIn();
    renderApp("/operator/kyc");

    const pane = await select(/Hari Kumar/);

    await within(pane).findByText("Documents");
    expect(api.count(HARI_DETAIL)).toBeGreaterThan(0);
    expect(api.calls.some((call) => call.key.includes("/admin/providers/u-hari"))).toBe(false);
    expect(within(pane).getByText("Team Pro · Bright Homes")).toBeInTheDocument();
  });

  it("treats an SP and a Pro with the same user id as two rows", async () => {
    const pro = proRow({ id: "u-asha", name: "Asha as a Pro" });
    const api = signedIn({ [queue()]: () => json([ASHA, pro]) });
    renderApp("/operator/kyc");

    await select(/Asha as a Pro/);
    expect(await row(/Asha as a Pro/)).toHaveAttribute("aria-current", "true");
    expect(await row(/^Asha Rao/)).not.toHaveAttribute("aria-current");
    await waitFor(() => expect(api.count(HARI_DETAIL)).toBeGreaterThan(0));
  });

  it("shows all 3 documents, and Not uploaded for a missing one", async () => {
    signedIn({ [ASHA_DETAIL]: () => json(kycDetail({ aadhaar_back_url: null })) });
    renderApp("/operator/kyc");

    const pane = await select(/Asha Rao/);

    expect(await within(pane).findByRole("img", { name: "Aadhaar front" })).toHaveAttribute(
      "src",
      "https://docs.example.test/front.png?sig=1",
    );
    expect(within(pane).getByRole("img", { name: "Selfie" })).toBeInTheDocument();
    expect(within(pane).queryByRole("img", { name: "Aadhaar back" })).not.toBeInTheDocument();
    expect(within(pane).getByText("Aadhaar back")).toBeInTheDocument();
    expect(within(pane).getByText("Not uploaded")).toBeInTheDocument();
  });

  it("opens a document in a modal, not a new tab", async () => {
    signedIn();
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    await userEvent.click(await within(pane).findByRole("button", { name: "Open Aadhaar back" }));

    const dialog = await screen.findByRole("dialog", { name: "Aadhaar back" });
    expect(within(dialog).getByRole("img", { name: "Aadhaar back, large view" })).toHaveAttribute(
      "src",
      "https://docs.example.test/back.png?sig=1",
    );
    expect(document.querySelector("a[target='_blank']")).toBeNull();

    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("never puts a document link in the URL", async () => {
    signedIn();
    const router = renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    await userEvent.click(await within(pane).findByRole("button", { name: "Open Selfie" }));
    await screen.findByRole("dialog", { name: "Selfie" });

    expect(router.state.location.href).toBe("/operator/kyc");
  });

  it("offers a retry for a failed image, which fetches a new link", async () => {
    let sig = 1;
    const api = signedIn({
      [ASHA_DETAIL]: () =>
        json(kycDetail({ aadhaar_front_url: `https://docs.example.test/front.png?sig=${sig++}` })),
    });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);
    const image = await within(pane).findByRole("img", { name: "Aadhaar front" });
    const before = api.count(ASHA_DETAIL);

    fireEvent.error(image);

    await userEvent.click(await within(pane).findByRole("button", { name: "Retry Aadhaar front" }));

    await waitFor(() => expect(api.count(ASHA_DETAIL)).toBe(before + 1));
    await waitFor(() =>
      expect(within(pane).getByRole("img", { name: "Aadhaar front" })).toHaveAttribute(
        "src",
        expect.stringMatching(new RegExp(`sig=${before + 1}$`)),
      ),
    );
    expect(
      within(pane).queryByRole("button", { name: "Retry Aadhaar front" }),
    ).not.toBeInTheDocument();
  });

  it("keeps a half-typed reason through an image retry", async () => {
    signedIn();
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);
    await userEvent.click(await rejectButton());
    await userEvent.type(within(pane).getByLabelText("Reason for rejection"), "Half typed");

    fireEvent.error(within(pane).getByRole("img", { name: "Selfie" }));
    await userEvent.click(await within(pane).findByRole("button", { name: "Retry Selfie" }));

    await within(pane).findByRole("img", { name: "Selfie" });
    expect(within(pane).getByLabelText("Reason for rejection")).toHaveValue("Half typed");
  });

  it("shows the AI's verdict, flags and extracted fields, with a dash for the stated DOB", async () => {
    signedIn();
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    expect(
      await within(pane).findByText(
        "AI: Needs review — Name on Aadhaar doesn't match provider's stated name",
      ),
    ).toBeInTheDocument();
    expect(within(pane).getByRole("progressbar", { name: "AI confidence" })).toHaveAttribute(
      "aria-valuenow",
      "61",
    );
    expect(
      within(pane).getByText("OCR confidence too low to trust extracted fields"),
    ).toBeInTheDocument();

    const dob = within(pane).getByRole("cell", { name: "DOB" }).closest("tr")!;
    const [, stated, extracted] = within(dob).getAllByRole("cell");
    expect(stated).toHaveTextContent("—");
    expect(extracted).toHaveTextContent("1988-11-02");
  });

  it("highlights a mismatch with a text colour of its own, readable in night mode", async () => {
    signedIn();
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    const nameRow = (await within(pane).findByRole("cell", { name: "Name" })).closest("tr")!;
    const [, stated] = within(nameRow).getAllByRole("cell");
    expect(stated).toHaveClass("bg-amber-100", "text-amber-950");
  });

  it("explains a null verdict and hides the comparison", async () => {
    signedIn({ [ASHA_DETAIL]: () => json(kycDetail({ ai_verdict: null })) });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    expect(await within(pane).findByText("AI: unavailable")).toBeInTheDocument();
    expect(within(pane).getByText(/Submitted before AI verification was live/)).toBeInTheDocument();
    expect(within(pane).queryByRole("table")).not.toBeInTheDocument();
  });

  // The verdict when the AI check couldn't run: the backend sends extracted as {}.
  it("copes with a verdict that has nothing extracted", async () => {
    signedIn({
      [ASHA_DETAIL]: () =>
        json(
          kycDetail({
            ai_verdict: {
              outcome: "needs_review",
              confidence: 0,
              extracted: {},
              flags: ["llm_unavailable"],
            } as never,
          }),
        ),
    });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    expect(
      await within(pane).findByText(
        "AI: Needs review — AI check was unavailable, so it didn't score this submission",
      ),
    ).toBeInTheDocument();
    const nameRow = within(pane).getByRole("cell", { name: "Name" }).closest("tr")!;
    expect(within(nameRow).getAllByRole("cell")[2]).toHaveTextContent("—");
    expect(within(pane).queryByText(/XXXX/)).not.toBeInTheDocument();
  });

  it("never shows the raw model response", async () => {
    signedIn({
      [ASHA_DETAIL]: () =>
        json(
          kycDetail({
            ai_verdict: {
              ...KYC_VERDICT_FIXTURES.auto_approve,
              raw_response: { secret: "raw-model-output" },
            } as never,
          }),
        ),
    });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    await within(pane).findByText("AI: Auto-approved");
    expect(document.body).not.toHaveTextContent("raw-model-output");
  });

  it("shows the rejection reason banner on a rejected row, whatever the filter", async () => {
    const rejected = {
      kyc_status: "rejected",
      kyc_reviewed_at: "2026-11-06T10:00:00Z",
      kyc_rejection_reason: "Blurred photo",
    } as const;
    signedIn({
      [queue("all")]: () => json([spRow(rejected)]),
      [ASHA_DETAIL]: () => json(kycDetail(rejected)),
    });
    renderApp("/operator/kyc?tab=all");
    const pane = await select(/Asha Rao/);

    expect(await within(pane).findByText("Rejection reason")).toBeInTheDocument();
    expect(within(pane).getByText("Blurred photo")).toBeInTheDocument();
    expect(within(pane).getByText(/^Rejected \d+ .* ago$/)).toBeInTheDocument();
  });

  it("shows the auto-approved banner from the Auto-approved filter only", async () => {
    signedIn({
      [queue("auto-approved")]: () => json([spRow(REVIEWED)]),
      [queue("approved")]: () => json([spRow(REVIEWED)]),
      [ASHA_DETAIL]: () => json(kycDetail(REVIEWED)),
    });
    renderApp("/operator/kyc?tab=auto-approved");
    const pane = await select(/Asha Rao/);
    expect(await within(pane).findByText("Auto-approved by AI")).toBeInTheDocument();
    expect(within(pane).getByText(/no human review/)).toBeInTheDocument();

    await userEvent.click(filter("Approved"));
    await waitFor(() => expect(filter("Approved")).toHaveAttribute("aria-current", "page"));
    const again = await select(/Asha Rao/);
    await within(again).findByText("Documents");
    expect(within(again).queryByText("Auto-approved by AI")).not.toBeInTheDocument();
  });
});

describe("who can act", () => {
  it.each<AdminRole>(["admin", "ops"])(
    "%s can approve and reject a submitted row",
    async (role) => {
      signedIn({}, role);
      renderApp("/operator/kyc");
      await select(/Asha Rao/);

      expect(await approveButton()).toBeEnabled();
      expect(await rejectButton()).toBeEnabled();
    },
  );

  it("support sees everything else, read-only", async () => {
    const api = signedIn({}, "support");
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    expect(await within(pane).findByText("AI Analysis")).toBeInTheDocument();
    expect(within(pane).getByRole("img", { name: "Selfie" })).toBeInTheDocument();
    expect(within(pane).getByText(/Read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(api.calls.filter((call) => call.key.startsWith("POST"))).toEqual([]);
  });

  it.each([
    ["verified", { kyc_status: "verified" }],
    ["rejected", { kyc_status: "rejected", kyc_rejection_reason: "Blurred" }],
  ] as const)("even an admin has no actions on a %s row", async (_status, fields) => {
    signedIn({ [ASHA_DETAIL]: () => json(kycDetail(fields)) });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    await within(pane).findByText("AI Analysis");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
    expect(within(pane).queryByText(/Read-only/)).not.toBeInTheDocument();
  });

  it("goes by the detail's status, not the row's, which may be out of date", async () => {
    signedIn({ [ASHA_DETAIL]: () => json(kycDetail({ kyc_status: "verified" })) });
    renderApp("/operator/kyc");
    const pane = await select(/Asha Rao/);

    await within(pane).findByText("AI Analysis");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });
});

describe("approve", () => {
  it("posts once, confirms, clears the selection and refreshes the queue and badge", async () => {
    let approved = false;
    let count = 2;
    const api = signedIn({
      [queue()]: () => json(approved ? [HARI] : [ASHA, HARI]),
      [COUNT]: () => json({ count }),
      [ASHA_VERIFY]: () => {
        approved = true;
        count = 1;
        return json({ kyc_status: "verified" });
      },
    });
    renderApp("/operator/kyc");
    expect(await screen.findByRole("link", { name: "KYC, 2 pending" })).toBeInTheDocument();
    await select(/Asha Rao/);

    await userEvent.click(await approveButton());

    expect(await screen.findByRole("status")).toHaveTextContent("KYC verified: Asha Rao");
    expect(screen.queryByRole("heading", { name: "Asha Rao" })).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Asha Rao/ })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole("link", { name: "KYC, 1 pending" })).toBeInTheDocument();
    expect(api.count(ASHA_VERIFY)).toBe(1);
    // The backend writes the audit row: nothing else is posted.
    expect(api.calls.filter((call) => call.key.startsWith("POST")).length).toBe(1);
  });

  it("uses the Pro route for a Pro", async () => {
    const api = signedIn({ [HARI_VERIFY]: () => json({ kyc_status: "verified" }) });
    renderApp("/operator/kyc");
    await select(/Hari Kumar/);

    await userEvent.click(await approveButton());

    await screen.findByRole("status");
    expect(api.count(HARI_VERIFY)).toBe(1);
    expect(api.count(ASHA_VERIFY)).toBe(0);
  });

  it("disables both buttons while it runs, and a double click posts once", async () => {
    const answer = deferred();
    const api = signedIn({ [ASHA_VERIFY]: () => answer.promise });
    renderApp("/operator/kyc");
    await select(/Asha Rao/);

    const approve = await approveButton();
    fireEvent.click(approve);
    fireEvent.click(approve);

    await waitFor(() => expect(approve).toBeDisabled());
    expect(await rejectButton()).toBeDisabled();
    expect(api.count(ASHA_VERIFY)).toBe(1);

    answer.resolve(json({ kyc_status: "verified" }));
    await screen.findByRole("status");
  });

  it("names the phone in the confirmation when there's no name", async () => {
    signedIn({
      [queue()]: () => json([spRow({ name: null })]),
      [ASHA_VERIFY]: () => json({ kyc_status: "verified" }),
    });
    renderApp("/operator/kyc");
    await select(/no name yet/);

    await userEvent.click(await approveButton());

    expect(await screen.findByRole("status")).toHaveTextContent("KYC verified: +919000000001");
  });
});

describe("reject", () => {
  async function openReject() {
    const pane = await select(/Asha Rao/);
    await userEvent.click(await rejectButton());
    return { pane, reason: within(pane).getByLabelText("Reason for rejection") };
  }

  it.each([
    ["empty", ""],
    ["only spaces", "    "],
  ])("refuses a reason that's %s, without calling the backend", async (_name, text) => {
    const api = signedIn({ [ASHA_REJECT]: () => json({}) });
    renderApp("/operator/kyc");
    const { pane, reason } = await openReject();
    if (text) await userEvent.type(reason, text);

    await userEvent.click(within(pane).getByRole("button", { name: "Confirm rejection" }));

    expect(await within(pane).findByRole("alert")).toHaveTextContent(
      "Enter a reason for the rejection.",
    );
    expect(reason).toHaveAttribute("aria-invalid", "true");
    expect(api.count(ASHA_REJECT)).toBe(0);
  });

  it("sends the trimmed reason, confirms and refreshes", async () => {
    let rejected = false;
    const api = signedIn({
      [queue()]: () => json(rejected ? [HARI] : [ASHA, HARI]),
      [ASHA_REJECT]: () => {
        rejected = true;
        return json({ kyc_status: "rejected" });
      },
    });
    renderApp("/operator/kyc");
    const { pane, reason } = await openReject();
    await userEvent.type(reason, "  Blurred photo  ");

    await userEvent.click(within(pane).getByRole("button", { name: "Confirm rejection" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "KYC rejected, provider notified: Asha Rao",
    );
    const call = api.calls.find((c) => c.key === ASHA_REJECT)!;
    expect(JSON.parse(String(call.init.body))).toEqual({ reason: "Blurred photo" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Asha Rao/ })).not.toBeInTheDocument(),
    );
  });

  it("uses the Pro route for a Pro", async () => {
    const api = signedIn({ [HARI_REJECT]: () => json({ kyc_status: "rejected" }) });
    renderApp("/operator/kyc");
    const pane = await select(/Hari Kumar/);
    await userEvent.click(await rejectButton());
    await userEvent.type(within(pane).getByLabelText("Reason for rejection"), "Blurred");

    await userEvent.click(within(pane).getByRole("button", { name: "Confirm rejection" }));

    await screen.findByRole("status");
    expect(api.count(HARI_REJECT)).toBe(1);
    expect(api.count(ASHA_REJECT)).toBe(0);
  });

  it("limits the reason to 500 characters", async () => {
    signedIn();
    renderApp("/operator/kyc");
    const { reason } = await openReject();

    expect(reason).toHaveAttribute("maxlength", "500");
  });

  it("Cancel throws the draft away", async () => {
    signedIn();
    renderApp("/operator/kyc");
    const { pane, reason } = await openReject();
    await userEvent.type(reason, "Half typed");

    await userEvent.click(within(pane).getByRole("button", { name: "Cancel" }));
    await userEvent.click(await rejectButton());

    expect(within(pane).getByLabelText("Reason for rejection")).toHaveValue("");
  });

  it("a draft doesn't carry over to another row", async () => {
    signedIn();
    renderApp("/operator/kyc");
    const { reason } = await openReject();
    await userEvent.type(reason, "About Asha");

    await select(/Hari Kumar/);

    expect(await approveButton()).toBeInTheDocument();
    expect(screen.queryByLabelText("Reason for rejection")).not.toBeInTheDocument();
  });

  it("keeps the draft after a failure that leaves the row as it was", async () => {
    signedIn({ [ASHA_REJECT]: () => json({ message: "Boom" }, 500) });
    renderApp("/operator/kyc");
    const { pane, reason } = await openReject();
    await userEvent.type(reason, "Blurred photo");

    await userEvent.click(within(pane).getByRole("button", { name: "Confirm rejection" }));

    expect(await screen.findByText(/Couldn't reject this KYC/)).toBeInTheDocument();
    expect(within(pane).getByLabelText("Reason for rejection")).toHaveValue("Blurred photo");
  });
});

describe("when the server refuses", () => {
  it.each([
    [403, "KYC is not in a reviewable state."],
    [404, "Provider not found."],
  ])(
    "a %i shows its message and refreshes the queue, detail and badge",
    async (status, message) => {
      let moved = false;
      const api = signedIn({
        [queue()]: () => json([ASHA, HARI]),
        [ASHA_DETAIL]: () => json(kycDetail(moved ? { kyc_status: "verified" } : {})),
        [ASHA_VERIFY]: () => {
          moved = true;
          return appError(status, "NOPE", message);
        },
      });
      renderApp("/operator/kyc");
      const pane = await select(/Asha Rao/);
      const approve = await approveButton();
      const queueBefore = api.count(queue());
      const badgeBefore = api.count(COUNT);
      const detailBefore = api.count(ASHA_DETAIL);

      await userEvent.click(approve);

      expect(await screen.findByRole("alert")).toHaveTextContent(`Asha Rao: ${message}`);
      await waitFor(() => expect(api.count(queue())).toBe(queueBefore + 1));
      await waitFor(() => expect(api.count(COUNT)).toBe(badgeBefore + 1));
      await waitFor(() => expect(api.count(ASHA_DETAIL)).toBe(detailBefore + 1));
      await waitFor(() =>
        expect(within(pane).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument(),
      );
      expect(within(pane).getByRole("heading", { name: "Asha Rao" })).toBeInTheDocument();
    },
  );

  it("a server error keeps the actions, and doesn't claim the row moved", async () => {
    const api = signedIn({ [ASHA_VERIFY]: () => json({ message: "db exploded" }, 500) });
    renderApp("/operator/kyc");
    await select(/Asha Rao/);
    const approve = await approveButton();
    const queueBefore = api.count(queue());

    await userEvent.click(approve);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Asha Rao: Couldn't approve this KYC. Please try again.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("db exploded");
    expect(await approveButton()).toBeEnabled();
    expect(api.count(queue())).toBe(queueBefore);
  });

  it("a network failure keeps the actions too", async () => {
    signedIn({
      [ASHA_VERIFY]: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    renderApp("/operator/kyc");
    await select(/Asha Rao/);

    await userEvent.click(await approveButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't approve this KYC.");
    expect(await approveButton()).toBeEnabled();
  });
});

describe("late responses", () => {
  it("a late detail for the old row can't replace the row selected since", async () => {
    const slow = deferred();
    signedIn({
      [ASHA_DETAIL]: () => slow.promise,
      [HARI_DETAIL]: () =>
        json(kycDetail({ name: "Hari Kumar", ai_verdict: KYC_VERDICT_FIXTURES.auto_approve })),
    });
    renderApp("/operator/kyc");
    await select(/Asha Rao/);
    const pane = await select(/Hari Kumar/);
    await within(pane).findByText("AI: Auto-approved");

    slow.resolve(json(kycDetail({ ai_verdict: KYC_VERDICT_FIXTURES.reject })));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(within(pane).getByRole("heading", { name: "Hari Kumar" })).toBeInTheDocument();
    expect(within(pane).getByText("AI: Auto-approved")).toBeInTheDocument();
    expect(within(pane).queryByText(/AI: Rejected/)).not.toBeInTheDocument();
  });

  it("a late approve keeps the row selected since, and still says what happened", async () => {
    const slow = deferred();
    signedIn({ [ASHA_VERIFY]: () => slow.promise });
    renderApp("/operator/kyc");
    await select(/Asha Rao/);
    await userEvent.click(await approveButton());

    const pane = await select(/Hari Kumar/);
    await within(pane).findByText("AI Analysis");
    // Only one action at a time, on any row.
    expect(await approveButton()).toBeDisabled();

    slow.resolve(json({ kyc_status: "verified" }));

    expect(await screen.findByRole("status")).toHaveTextContent("KYC verified: Asha Rao");
    expect(within(pane).getByRole("heading", { name: "Hari Kumar" })).toBeInTheDocument();
    await waitFor(async () => expect(await approveButton()).toBeEnabled());
  });

  it("a late 403 doesn't refetch or change the row selected since", async () => {
    const slow = deferred();
    const api = signedIn({ [ASHA_VERIFY]: () => slow.promise });
    renderApp("/operator/kyc");
    await select(/Asha Rao/);
    await userEvent.click(await approveButton());

    const pane = await select(/Hari Kumar/);
    await within(pane).findByText("AI Analysis");
    const hariBefore = api.count(HARI_DETAIL);
    const ashaBefore = api.count(ASHA_DETAIL);

    slow.resolve(appError(403, "NOPE", "Already reviewed."));

    expect(await screen.findByRole("alert")).toHaveTextContent("Asha Rao: Already reviewed.");
    expect(within(pane).getByRole("heading", { name: "Hari Kumar" })).toBeInTheDocument();
    expect(api.count(HARI_DETAIL)).toBe(hariBefore);
    expect(api.count(ASHA_DETAIL)).toBe(ashaBefore);
  });
});
