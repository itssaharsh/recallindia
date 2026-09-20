"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useAppState } from "@/components/shell/app-state";
import {
  CASE_UI_STATES,
  CaseView,
  POLL_BUDGET_MS,
  POLL_MS,
  uiStateFrom,
  useCasePhase,
  type AuditEntry,
  type CaseApproval,
  type CaseEvidence,
  type CasePending,
  type CaseRecord,
  type CaseUiState,
  type Household,
  type NearMiss,
  type TamperResult,
  type Item as ViewItem,
  type Notice as ViewNotice,
  type VerifyResult as ViewVerify,
} from "@/components/v3/case";
import { EmptyState, shellToast } from "@/components/v3/shell";
import { Button } from "@/components/v3/ui";
import { ApiError, DEMO_HOUSEHOLD, apiGet, apiPost } from "@/lib/api";
import { IN_FLIGHT, displayThing } from "@/lib/case";
import type { Case, ClaimLink, Evidence, Item, Notice, VerifyResult } from "@/lib/types";
import { usePoll } from "@/lib/use-poll";

/**
 * The /case route's data layer: the v3 `CaseView` is presentational, so everything that talks to the
 * API lives here. The id comes from `?id=` (a static export has no /case/[id] pages), the case is
 * polled every 600 ms while the pipeline runs, and the approve / dismiss / verify calls are the same
 * ones the v2 view made (`@/lib/api`, `@/lib/case`). `?state=` forces any page state for QA.
 */

const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/* ------------------------------------------------------------------ id */

/** ?id=, or — behind the Amplify rewrite /case/<id> -> /case/ — the path itself. */
function caseIdFrom(search: string | null, pathname: string): string | null {
  if (search) return search;
  const match = pathname.match(/^\/case\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/* ------------------------------------------------------------------ API -> view types
 * The API shapes in `@/lib/types` are looser than the view's (every field the API may omit is
 * optional there). These map one to one, with no value invented: a missing field becomes null. */

const PIPELINE_STATUS = new Set<CaseRecord["status"]>([
  "waiting_approval", "approving", "sealing", "writing_letter", "verifying", "verified", "rejected", "expired",
]);

/** The case's own state. "matching" / "error" / an older record without one: read it off the record. */
function viewStatus(c: Case): CaseRecord["status"] {
  const s = c.status as CaseRecord["status"] | undefined;
  if (s && PIPELINE_STATUS.has(s)) return s;
  if (c.approval?.status === "rejected") return "rejected";
  if (c.approval?.status === "expired") return "expired";
  if (c.evidence && c.claim_pdf_s3_key) return "verified";
  return "waiting_approval";
}

/** Any step the server recorded an error on (the "failed" page state). */
function stepFailed(c: Case | null): boolean {
  if (!c) return false;
  if (c.status === "error") return true;
  const steps = c.steps;
  return !!steps && (["approve", "seal_evidence", "write_letter", "verify"] as const).some((k) => steps[k]?.error);
}

function viewSteps(c: Case): CaseRecord["steps"] {
  const one = (k: keyof NonNullable<Case["steps"]>) => ({
    started_at: c.steps?.[k]?.started_at ?? null,
    finished_at: c.steps?.[k]?.finished_at ?? null,
    error: c.steps?.[k]?.error ?? null,
  });
  return {
    approve: one("approve"),
    seal_evidence: one("seal_evidence"),
    write_letter: one("write_letter"),
    verify: one("verify"),
  };
}

function viewEvidence(e: Evidence | null | undefined): CaseEvidence | null {
  if (!e) return null;
  return {
    sha256: e.sha256,
    // signed_at and the retain-until are written together by the sealing step
    signed_at: e.signed_at || e.object_lock_retain_until,
    key_alias: e.key_alias || e.kms_key_id,
    signing_algorithm: e.signing_algorithm || "RSASSA_PKCS1_V1_5_SHA_256",
    object_lock_mode: (e.object_lock_mode ?? "GOVERNANCE") as CaseEvidence["object_lock_mode"],
    object_lock_retain_until: e.object_lock_retain_until,
    snapshot_bytes: e.snapshot_bytes ?? 0,
    snapshot_kind: e.snapshot_kind ?? "portal_row",
    snapshot_s3_key: e.snapshot_s3_key,
    snapshot_version_id: e.snapshot_version_id ?? "",
    source_url: e.source_url ?? "",
    kms_key_id: e.kms_key_id,
    content_type: e.content_type ?? undefined,
    signature_b64: e.signature_b64,
  };
}

/** claim.py ADDRESSEE: who the letter is written to, by kind (the API fills it in when it drafts). */
const addresseeFor = (kind: Item["kind"] | undefined) =>
  kind === "medicine" ? "pharmacy" : kind === "vehicle" ? "dealer" : "retailer";

/** The API calls the open gate "waiting"; the view calls it "pending". */
const approvalStatus = (s: string | null | undefined): CaseApproval["status"] =>
  s === "approved" || s === "rejected" || s === "expired" ? s : "pending";

function viewCase(c: Case, item: Item | null): CaseRecord {
  return {
    case_id: c.case_id,
    status: viewStatus(c),
    created_at: c.created_at ?? "",
    item_id: c.item_id,
    notice_id: c.notice_id,
    household_id: c.household_id ?? DEMO_HOUSEHOLD,
    decision: c.decision,
    approval: {
      status: approvalStatus(c.approval?.status),
      approved_at: c.approval?.approved_at ?? null,
      rejected_at: c.approval?.rejected_at ?? null,
      expired_at: c.approval?.expired_at ?? null,
      approver: c.approval?.approver ?? null,
      reason: c.approval?.reason ?? null,
      token_issued_at: c.approval?.token_issued_at ?? null,
    },
    steps: viewSteps(c),
    evidence: viewEvidence(c.evidence),
    claim_text: c.claim_text ?? null,
    claim_pdf_s3_key: c.claim_pdf_s3_key ?? null,
    claim_created_at: c.claim_created_at ?? null,
    claim_addressee: c.claim_addressee ?? addresseeFor(item?.kind),
    quoted_sentence: c.quoted_sentence ?? "",
    range_check: c.range_check
      ? { yours: c.range_check.yours, listed: c.range_check.listed, inside: !!c.range_check.inside }
      : null,
    reasoning: c.reasoning ?? "",
    reason: c.reason,
    verifier: c.verifier ?? "deterministic",
    confidence: c.confidence ?? 0,
    sold_after_notice: !!c.sold_after_notice,
    audit: (c.audit ?? []).map((a) => ({ ts: a.ts, event: a.event, detail: a.detail ?? {} })),
  };
}

/** NHTSA prints the component as the uppercase prefix of its hazard line. */
function nhtsaComponent(hazard: string | null | undefined): string | null {
  if (!hazard) return null;
  const caps: string[] = [];
  for (const part of hazard.split(": ")) {
    if (part === part.toUpperCase() && /[A-Z]/.test(part)) caps.push(part);
    else break;
  }
  return caps.length ? caps.join(": ") : null;
}

/** The listed model years for this vehicle: the widest range the notice lists for it. */
function modelYears(n: Notice, item: Item | null): [number, number] | null {
  const rows = (n.vehicles ?? []).filter((v) => {
    if (!item?.make && !item?.model) return true;
    const make = (item.make ?? "").toLowerCase();
    const model = (item.model ?? "").toLowerCase();
    return (!make || v.make?.toLowerCase() === make) && (!model || v.model?.toLowerCase() === model);
  });
  const use = rows.length ? rows : (n.vehicles ?? []);
  if (!use.length) return null;
  return [Math.min(...use.map((v) => v.year_from)), Math.max(...use.map((v) => v.year_to))];
}

function viewNotice(n: Notice, item: Item | null): ViewNotice {
  return {
    notice_id: n.notice_id,
    pk: n.pk,
    source: n.source as ViewNotice["source"],
    title: n.title,
    product: n.product,
    brand: n.brand ?? null,
    batches: n.batches ?? [],
    mfg_date: n.mfg_date ?? null,
    exp_date: n.exp_date ?? null,
    hazard_or_failed_test: n.hazard_or_failed_test ?? null,
    lab: n.lab ?? null,
    row_ref: n.row_ref
      ? { page: n.row_ref.page ?? null, row: n.row_ref.row ?? null, month: n.row_ref.month ?? null }
      : null,
    published_at: n.published_at,
    url: n.url,
    raw_excerpt: n.raw_excerpt ?? "",
    remedy: n.remedy ?? null,
    model: n.model ?? null,
    component: n.source === "nhtsa" ? nhtsaComponent(n.hazard_or_failed_test) : null,
    model_years: modelYears(n, item),
  };
}

function viewItem(i: Item): ViewItem {
  return {
    item_id: i.item_id,
    kind: i.kind,
    // the words the person typed, never the normalised matching keys ("jeep compass")
    name: displayThing(i),
    brand: i.brand?.trim() || null,
    batch: i.batch ?? null,
    serial: i.serial ?? null,
    make: i.make ?? null,
    model: i.model ?? null,
    year: i.year ?? null,
    mfg_date: i.mfg_date ?? null,
    exp_date: i.exp_date ?? null,
    purchase_date: i.purchase_date ?? null,
  };
}

const viewVerify = (v: VerifyResult): ViewVerify => ({
  valid: v.valid,
  sha256: v.sha256,
  recomputed_sha256: v.recomputed_sha256,
  checked_at: v.checked_at,
});

function viewTamper(v: VerifyResult): TamperResult | null {
  if (!v.tampered || v.flipped_byte_index == null || v.byte_before == null || v.byte_after == null) return null;
  return {
    valid: false,
    tampered: true,
    flipped_byte_index: v.flipped_byte_index,
    byte_before: v.byte_before,
    byte_after: v.byte_after,
    sha256: v.sha256,
    recomputed_sha256: v.recomputed_sha256,
    checked_at: v.checked_at,
    demo_control: !!v.demo_control,
  };
}

/* ------------------------------------------------------------------ route */

export function CaseWire() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { demo, ready, href, household, makeCopy } = useAppState();

  const id = caseIdFrom(params.get("id"), pathname);
  const forced = params.get("state") as CaseUiState | null;

  const [kase, setCase] = useState<Case | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [things, setThings] = useState<Item[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [pending, setPending] = useState<CasePending>({});
  const [verify, setVerify] = useState<ViewVerify | null>(null);
  const [tamper, setTamper] = useState<TamperResult | null>(null);
  const [verifiedAgainAt, setVerifiedAgainAt] = useState<string | null>(null);
  const [clientAudit, setClientAudit] = useState<AuditEntry[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const deadline = useRef<number | null>(null);
  const claimBusy = useRef(false);

  /** Anything a click couldn't finish says so in the shell's toast, next to the action. */
  const fail = useCallback((title: string, err: unknown) => {
    shellToast.show({ kind: "sourceDown", title, description: message(err), dismissible: true });
  }, []);

  /* ---------------------------------------------------------------- load: case, then notice + item */
  useEffect(() => {
    if (!ready || !id) return;
    const controller = new AbortController();
    const { signal } = controller;
    setLoadError(null);
    setVerify(null);
    setTamper(null);
    setVerifiedAgainAt(null);
    setClientAudit([]);
    (async () => {
      try {
        const c = await apiGet<Case>(`/cases/${enc(id)}`, demo, signal);
        if (signal.aborted) return;
        const [it, n] = await Promise.all([
          apiGet<Item>(`/items/${enc(c.item_id)}`, demo, signal).catch(() => null),
          c.notice_id ? apiGet<Notice>(`/v1/notices/${enc(c.notice_id)}`, demo, signal).catch(() => null) : null,
        ]);
        if (signal.aborted) return;
        // all three land together: the view reads the item's kind and the notice's row for its copy
        setCase(c);
        setItem(it);
        setNotice(n);
        if (!it || !n) setLoadError(new Error(!n ? "the notice behind it didn't load" : "the thing didn't load"));
      } catch (err) {
        if (!signal.aborted) setLoadError(err instanceof Error ? err : new Error(String(err)));
      }
    })();
    return () => controller.abort();
  }, [ready, id, demo, household, attempt]);

  /* ---------------------------------------------------------------- the household's other things:
   * the near-miss footer on the batch card is the item whose dismissed case points at this notice */
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    apiGet<{ items: Item[] }>("/items", demo, controller.signal)
      .then(({ items }) => setThings(items))
      .catch(() => undefined);
    return () => controller.abort();
  }, [ready, demo, household]);

  useEffect(() => {
    if (item?.name) document.title = `${item.name} · Case · RecallIndia`;
  }, [item?.name]);

  /* ---------------------------------------------------------------- poll while the pipeline runs */
  const running = kase?.status ? IN_FLIGHT.has(kase.status) : false;
  const wasRunning = useRef(false);
  useEffect(() => {
    if (running && !wasRunning.current) {
      deadline.current = performance.now() + POLL_BUDGET_MS;
      setTimedOut(false);
    } else if (!running && wasRunning.current) {
      deadline.current = null;
    }
    wasRunning.current = running;
  }, [running]);

  usePoll(
    async (signal) => {
      if (!kase) return;
      if (deadline.current != null && performance.now() > deadline.current) {
        setTimedOut(true);
        return;
      }
      const fresh = await apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo, signal);
      if (!signal.aborted) setCase(fresh);
    },
    POLL_MS,
    running && !timedOut,
  );

  /* ---------------------------------------------------------------- the gate */
  const answer = useCallback(
    async (approve: boolean) => {
      if (!kase) return;
      setPending((p) => (approve ? { ...p, approve: true } : { ...p, dismiss: true }));
      try {
        const body = await apiPost<{ case: Case | null }>(
          `/cases/${enc(kase.case_id)}/${approve ? "approve" : "reject"}`,
          undefined,
          demo,
        );
        if (body.case) setCase(body.case);
      } catch (err) {
        // a 409 is not an error to the reader: somebody already answered, so show what is true
        if (err instanceof ApiError && err.status === 409) {
          try {
            setCase(await apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo));
          } catch {
            fail("Couldn't reach the approval step. Try again.", err);
          }
        } else {
          fail("Couldn't reach the approval step. Try again.", err);
        }
      } finally {
        setPending((p) => ({ ...p, approve: false, dismiss: false }));
      }
    },
    [kase, demo, fail],
  );

  /* ---------------------------------------------------------------- verify-evidence (and the tamper
   * test: a client-side question about the stored signature, which never writes the case) */
  const check = useCallback(
    async (mode: "load" | "again" | "tamper") => {
      if (!kase?.evidence) return;
      const tampering = mode === "tamper";
      if (mode !== "load") setPending((p) => (tampering ? { ...p, tamper: true } : { ...p, verify: true }));
      // the page's own minimum dwell, so the answer never flashes past (spec §5 X0 / V0)
      const dwell = mode === "load" ? Promise.resolve() : sleep(500);
      try {
        const res = await apiGet<VerifyResult>(
          `/cases/${enc(kase.case_id)}/verify-evidence${tampering ? "?tamper=1" : ""}`,
          demo,
        );
        await dwell;
        if (tampering) {
          const t = viewTamper(res);
          if (!t) throw new Error("the tamper test answered without a flipped byte");
          setTamper(t);
          setClientAudit((rows) => [
            ...rows,
            {
              ts: t.checked_at,
              event: "evidence.tamper_test",
              detail: {
                flipped_byte_index: t.flipped_byte_index,
                byte_before: t.byte_before,
                byte_after: t.byte_after,
              },
            },
          ]);
        } else {
          setVerify(viewVerify(res));
          setTamper(null);
          if (mode === "again") setVerifiedAgainAt(res.checked_at);
        }
      } catch (err) {
        await dwell;
        if (mode !== "load") fail("Couldn't check the signature. Try again.", err);
      } finally {
        setPending((p) => ({ ...p, tamper: false, verify: false }));
      }
    },
    [kase, demo, fail],
  );

  // the page checks the signature once when it lands on a sealed, verified case (spec §7)
  const checkedFor = useRef<string | null>(null);
  const sha = kase?.evidence?.sha256 ?? null;
  useEffect(() => {
    if (!sha || kase?.status !== "verified" || checkedFor.current === sha) return;
    checkedFor.current = sha;
    void check("load");
  }, [sha, kase?.status, check]);

  /* ---------------------------------------------------------------- the letter */
  const openClaim = useCallback(async () => {
    if (!kase?.claim_pdf_s3_key || claimBusy.current) return;
    claimBusy.current = true;
    // the tab is opened inside the click: one opened after the await is a blocked pop-up
    const tab = window.open("", "_blank");
    try {
      const link = await apiGet<ClaimLink>(`/cases/${enc(kase.case_id)}/claim`, demo);
      const url = link.download || link.view || link.url || "";
      if (!url) throw new Error("the API returned no link");
      const absolute = new URL(url, window.location.href).toString();
      if (tab) {
        tab.opener = null;
        tab.location.replace(absolute);
      } else {
        window.location.assign(absolute);
      }
    } catch (err) {
      tab?.close();
      fail("The claim letter couldn't be opened. Try again.", err);
    } finally {
      claimBusy.current = false;
    }
  }, [kase, demo, fail]);

  /* ---------------------------------------------------------------- the rest of the actions */
  const copyDemo = useCallback(async () => {
    const made = await makeCopy();
    // the demo household's case belongs to the demo household: your copy has its own case
    if (made) router.push(href("/mine/"));
  }, [makeCopy, router, href]);

  const checkAgain = useCallback(async () => {
    if (!kase) return;
    try {
      await apiPost(`/items/${enc(kase.item_id)}/check`, undefined, demo);
      router.push(href("/mine/"));
    } catch (err) {
      fail("Couldn't start the check. Try again.", err);
    }
  }, [kase, demo, router, href, fail]);

  const checkStatus = useCallback(async () => {
    if (!kase) return;
    deadline.current = performance.now() + POLL_BUDGET_MS;
    setTimedOut(false);
    try {
      setCase(await apiGet<Case>(`/cases/${enc(kase.case_id)}`, demo));
    } catch (err) {
      fail("Couldn't reach the API. Try again.", err);
    }
  }, [kase, demo, fail]);

  /* ---------------------------------------------------------------- derived */
  // the demo household's case is readable by anyone and answerable by nobody (the API says 403
  // demo_read_only), so the gate shows "Make my own copy" instead of Approve
  const readOnly = demo || household === DEMO_HOUSEHOLD || (kase?.household_id ?? DEMO_HOUSEHOLD) === DEMO_HOUSEHOLD;

  const householdProp = useMemo<Household>(
    () => ({
      id: readOnly ? DEMO_HOUSEHOLD : household,
      demo: readOnly,
      name: readOnly ? "Demo household" : "My household",
      thing_count: things?.length,
    }),
    [readOnly, household, things?.length],
  );

  const record = useMemo(() => (kase ? viewCase(kase, item) : null), [kase, item]);
  const noticeProp = useMemo(() => (notice ? viewNotice(notice, item) : null), [notice, item]);
  const itemProp = useMemo(() => (item ? viewItem(item) : null), [item]);

  const nearMiss = useMemo<NearMiss | null>(() => {
    if (!kase || !things) return null;
    const other = things.find(
      (t) =>
        t.item_id !== kase.item_id &&
        t.case?.notice_id === kase.notice_id &&
        t.case?.decision === "dismiss" &&
        (t.case?.range_check?.yours || t.batch),
    );
    if (!other) return null;
    return {
      item_id: other.item_id,
      batch: other.case?.range_check?.yours || other.batch || "",
      status: "dismissed",
    };
  }, [kase, things]);

  const latest: CaseUiState = record
    ? uiStateFrom(record.status, { demo: readOnly, tampered: !!tamper, failed: stepFailed(kase) })
    : "loading";
  const shown = useCasePhase(latest);
  const state = forced && CASE_UI_STATES.includes(forced) ? forced : shown;

  const on = useMemo(
    () => ({
      onApprove: () => void answer(true),
      onDismiss: () => void answer(false),
      onMakeCopy: () => void copyDemo(),
      onRunTamperTest: () => void check("tamper"),
      onVerifyAgain: () => void check("again"),
      onDownload: () => void openClaim(),
      onCheckAgain: () => void checkAgain(),
      onCheckStatus: () => void checkStatus(),
    }),
    [answer, copyDemo, check, openClaim, checkAgain, checkStatus],
  );

  /* ---------------------------------------------------------------- nothing to show */
  if (!id) {
    return (
      <EmptyState
        type="not-found"
        headingAs="h1"
        feedHref="/feed/"
        mineHref="/mine/"
        footnote="A case opens from a thing that is on a notice."
      />
    );
  }
  if (loadError && !(record && noticeProp && itemProp)) {
    const missing = loadError instanceof ApiError && loadError.status === 404;
    if (missing) {
      return (
        <EmptyState
          type="not-found"
          headingAs="h1"
          feedHref="/feed/"
          mineHref="/mine/"
          footnote="This case may belong to another household, or the thing was checked again and the case was replaced."
        />
      );
    }
    return (
      <section className="rounded-lg border border-line bg-surface-1 px-8 py-9 max-md:px-5 max-md:py-6">
        <h1 className="font-display text-[30px] leading-[1.08] font-extrabold tracking-[-0.03em] text-ink">
          Couldn&apos;t load this case
        </h1>
        <p className="mt-2.5 max-w-[640px] text-[16px] leading-[1.5] text-ink-muted">
          The API didn&apos;t answer ({loadError.message}). Your household is unchanged.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
          <Button variant="secondary" href="/mine/">
            Back to my things
          </Button>
        </div>
      </section>
    );
  }

  return (
    <CaseView
      state={state}
      caseRecord={record}
      notice={noticeProp}
      item={itemProp}
      household={householdProp}
      nearMiss={nearMiss}
      verify={verify}
      tamper={tamper}
      verifiedAgainAt={verifiedAgainAt}
      claimPdfUrl={null}
      timedOut={timedOut}
      pending={pending}
      clientAudit={clientAudit}
      backHref="/mine/"
      className="px-0!" // the shell's <main> already carries the page gutter
      on={on}
    />
  );
}

/** The skeleton the Suspense boundary shows while the client reads `?id=`. */
export function CaseWireFallback() {
  return (
    <CaseView
      state="loading"
      caseRecord={null}
      notice={null}
      item={null}
      household={{ id: DEMO_HOUSEHOLD, demo: true, name: "Demo household" }}
      backHref="/mine/"
      className="px-0!"
    />
  );
}
