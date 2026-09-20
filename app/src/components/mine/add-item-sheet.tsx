"use client";

import { Camera, ClipboardList, Car } from "lucide-react";
import { useState } from "react";

import { useAppState } from "@/components/shell/app-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, apiPost } from "@/lib/api";
import { motion, useReducedMotion } from "motion/react";

import { FoilChip } from "@/components/common/foil-chip";
import { PhotoError, photoToJpeg } from "@/lib/image";
import type {
  Item,
  NormaliseResult,
  OcrResult,
  PasteRow,
  UploadTicket,
  OcrWord,
} from "@/lib/types";

type Created = { items: Item[]; count: number };
const message = (err: unknown) =>
  err instanceof ApiError || err instanceof PhotoError || err instanceof Error
    ? err.message
    : String(err);

/** The three ways a thing arrives: a strip photo, pasted lines, a vehicle. Each ends in POST
 *  /items and then an automatic check (the caller starts it). */
export function AddItemSheet({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (items: Item[]) => void;
}) {
  const { demo } = useAppState();
  const done = (items: Item[]) => {
    onAdded(items);
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto rounded-l-lg border-line bg-surface-1 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-line p-5 pr-12">
          <SheetTitle className="font-display text-xl font-semibold text-ink">
            Add something you own
          </SheetTitle>
          <SheetDescription className="text-[13px] text-muted">
            It is checked against every notice as soon as it is added.
            {demo && " Demo data is read-only: adding runs on the live API."}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="scan" className="gap-0 p-5">
          <TabsList className="mb-5 w-full">
            <TabsTrigger value="scan" className="gap-1.5">
              <Camera aria-hidden className="size-4" /> Scan strip
            </TabsTrigger>
            <TabsTrigger value="paste" className="gap-1.5">
              <ClipboardList aria-hidden className="size-4" /> Paste lines
            </TabsTrigger>
            <TabsTrigger value="vehicle" className="gap-1.5">
              <Car aria-hidden className="size-4" /> Vehicle
            </TabsTrigger>
          </TabsList>
          <TabsContent value="scan">
            <ScanTab demo={demo} onDone={done} />
          </TabsContent>
          <TabsContent value="paste">
            <PasteTab demo={demo} onDone={done} />
          </TabsContent>
          <TabsContent value="vehicle">
            <VehicleTab demo={demo} onDone={done} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/**
 * C-14 ScanConfirm: the photo with the lines Textract read drawn on it (T-06, 40 ms stagger),
 * the line that holds the batch in the accent, and the batch itself on a foil chip under it.
 * Every box is Textract's own geometry: nothing here is decoration.
 */
function ScanPhoto({
  src,
  words,
  batch,
}: {
  src: string;
  words: OcrWord[];
  batch: string;
}) {
  const reduce = useReducedMotion();
  const shown = words.slice(0, 12);
  return (
    <figure className="space-y-2">
      <div className="relative overflow-hidden rounded-md border border-line bg-surface-2">
        {/* a blob: preview of the upload; next/image adds nothing for a local object URL */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="The strip you photographed"
          className="block max-h-64 w-full object-contain"
        />
        {shown.map((word, i) => (
          <motion.span
            key={`${word.text}-${i}`}
            aria-hidden
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : i * 0.04, duration: 0.2 }}
            className={`absolute rounded-[2px] border ${
              word.is_batch
                ? "border-2 border-primary bg-primary/10"
                : "border-line-strong/70"
            }`}
            style={{
              left: `${word.box.left * 100}%`,
              top: `${word.box.top * 100}%`,
              width: `${word.box.width * 100}%`,
              height: `${word.box.height * 100}%`,
            }}
          />
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        Textract read {words.length} lines.
        {batch ? (
          <>
            <span>Batch:</span>
            <motion.span layoutId="scan-batch">
              <FoilChip code={batch} />
            </motion.span>
          </>
        ) : (
          <span>No batch found yet — type it below.</span>
        )}
      </figcaption>
    </figure>
  );
}

// --- Scan strip -------------------------------------------------------------------------------

type ScanStep = "idle" | "uploading" | "reading" | "form" | "saving";

function ScanTab({
  demo,
  onDone,
}: {
  demo: boolean;
  onDone: (items: Item[]) => void;
}) {
  const [step, setStep] = useState<ScanStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    brand: "",
    batch: "",
    mfg_date: "",
    exp_date: "",
    purchase_date: "",
  });

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setOcr(null);
    try {
      setStep("uploading");
      const jpeg = await photoToJpeg(file);
      setPreview(URL.createObjectURL(jpeg));
      const ticket = await apiPost<UploadTicket>(
        "/uploads",
        { content_type: "image/jpeg" },
        demo,
      );
      const put = await fetch(ticket.url, {
        method: "PUT",
        headers: ticket.headers,
        body: jpeg,
      });
      if (!put.ok)
        throw new Error(`the upload was refused (HTTP ${put.status})`);
      setStep("reading");
      const read = await apiPost<OcrResult>(
        "/items/ocr",
        { key: ticket.key },
        demo,
      );
      setOcr(read);
      const f = read.fields;
      setForm({
        name: f.name ?? "",
        brand: f.brand ?? "",
        batch: f.batch ?? "",
        mfg_date: f.mfg_date ?? "",
        exp_date: f.exp_date ?? "",
        purchase_date: "",
      });
      setStep("form");
    } catch (err) {
      setError(message(err));
      setStep("idle");
    }
  };

  const save = async () => {
    if (!ocr) return;
    setStep("saving");
    setError(null);
    try {
      const body = {
        kind: "medicine",
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        batch: form.batch.trim() || null,
        mfg_date: form.mfg_date.trim() || null,
        exp_date: form.exp_date.trim() || null,
        purchase_date: form.purchase_date || null,
        photo_s3_key: ocr.key,
      };
      onDone((await apiPost<Created>("/items", body, demo)).items);
    } catch (err) {
      setError(message(err));
      setStep("form");
    }
  };

  const uncertain = new Set(ocr?.uncertain ?? []);
  const field = (
    key: keyof typeof form,
    label: string,
    mono = false,
    type = "text",
  ) => {
    const conf = ocr?.confidence?.[key];
    const flagged = uncertain.has(key) || (ocr?.missing ?? []).includes(key);
    return (
      <div className="space-y-1">
        <Label htmlFor={`scan-${key}`} className="text-xs text-muted">
          {label}
        </Label>
        <Input
          id={`scan-${key}`}
          type={type}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className={`${mono ? "font-mono" : ""} ${flagged ? "border-warning" : ""}`}
          aria-describedby={flagged ? `scan-${key}-hint` : undefined}
        />
        {flagged && (
          <p id={`scan-${key}-hint`} className="text-xs text-warning">
            {form[key]
              ? `Read at ${Math.round((conf ?? 0) * 100)}%: check it against the strip.`
              : "Not found on the photo: type it in."}
          </p>
        )}
      </div>
    );
  };

  const busy = step === "uploading" || step === "reading" || step === "saving";
  return (
    <div className="space-y-4">
      <p className="m-0 text-[13px] text-muted">
        Photograph the back of the strip so the batch stamp is in the picture
        (it is often printed along one edge).
      </p>
      <label
        className={`inline-flex ${busy || demo ? "pointer-events-none opacity-50" : ""}`}
      >
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy || demo}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <span className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-sm border border-line px-3 text-sm font-medium text-ink hover:bg-surface-2">
          <Camera aria-hidden className="size-4" />{" "}
          {ocr ? "Scan another photo" : "Take or choose a photo"}
        </span>
      </label>

      {(busy || ocr) && (
        <ol
          className="m-0 list-none space-y-1 p-0 text-[13px]"
          aria-label="Reading the strip"
        >
          <Step state={step === "uploading" ? "running" : "done"}>
            Uploading the photo
          </Step>
          <Step
            state={
              step === "uploading"
                ? "pending"
                : step === "reading"
                  ? "running"
                  : "done"
            }
          >
            Reading the print with Amazon Textract
          </Step>
          {ocr?.passes?.some((p) => p.startsWith("edge")) && (
            <Step state="done">
              Read the edge stamp separately (
              {ocr.passes
                .filter((p) => p.startsWith("edge"))
                .map((p) => p.slice(5))
                .join(", ")}{" "}
              edge)
            </Step>
          )}
        </ol>
      )}

      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}

      {ocr && (
        <div className="space-y-3">
          {preview && (
            <ScanPhoto
              src={preview}
              words={ocr.words ?? []}
              batch={form.batch}
            />
          )}
          <div className="grid gap-3">
            {field("name", "Product, as printed")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field("brand", "Manufacturer")}
            {field("batch", "Batch", true)}
            {field("mfg_date", "Mfg (YYYY-MM)", true)}
            {field("exp_date", "Exp (YYYY-MM)", true)}
            {field("purchase_date", "Bought on (optional)", true, "date")}
          </div>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">
              What Textract read ({ocr.lines.length} lines)
            </summary>
            <ul className="mt-2 max-h-40 list-none space-y-0.5 overflow-y-auto p-0 font-mono">
              {ocr.lines.map((line, i) => (
                <li key={i}>
                  {line.edge ? `[${line.edge} edge] ` : ""}
                  {line.text}
                </li>
              ))}
            </ul>
          </details>
          <Button onClick={save} disabled={busy || !form.name.trim() || demo}>
            {step === "saving" ? "Checking…" : "Check this batch"}
          </Button>
        </div>
      )}
    </div>
  );
}

function Step({
  state,
  children,
}: {
  state: "pending" | "running" | "done";
  children: React.ReactNode;
}) {
  const glyph = state === "done" ? "●" : state === "running" ? "◐" : "○";
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className={`w-3 font-mono ${state === "running" ? "text-primary" : state === "done" ? "text-ink" : "text-muted"}`}
      >
        {glyph}
      </span>
      <span className={state === "pending" ? "text-muted" : "text-ink"}>
        {children}
      </span>
    </li>
  );
}

// --- Paste lines -------------------------------------------------------------------------------

const EXAMPLE =
  "Pantoprazole Tablets IP Finecure Pharmaceuticals PEP5001\nHavells Efficiencia Neo Ceiling Fan 1200mm\nJeep Compass 2022 MH12AB1234";

function PasteTab({
  demo,
  onDone,
}: {
  demo: boolean;
  onDone: (items: Item[]) => void;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<(PasteRow & { ok: boolean })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = async () => {
    setBusy(true);
    setError(null);
    try {
      const out = await apiPost<NormaliseResult>(
        "/items/normalise",
        { text },
        demo,
      );
      setRows(out.rows.map((r) => ({ ...r, ok: !r.needs_confirm })));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const update = (i: number, patch: Partial<PasteRow & { ok: boolean }>) =>
    setRows(
      (prev) => prev && prev.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    );

  const add = async () => {
    if (!rows) return;
    setBusy(true);
    setError(null);
    try {
      const items = rows
        .filter((r) => r.ok)
        .map((r) => ({
          kind: r.kind,
          name: r.name,
          brand: r.brand,
          batch: r.batch,
          model: r.model,
          make: r.make,
          year: r.year,
          reg_no: r.reg_no,
        }));
      onDone((await apiPost<Created>("/items", { items }, demo)).items);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  const ready = rows?.filter((r) => r.ok).length ?? 0;
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="paste-lines" className="text-xs text-muted">
          One product per line: from an order history, a bill, or typed
        </Label>
        <Textarea
          id="paste-lines"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={EXAMPLE}
          className="font-mono text-[13px]"
        />
      </div>
      <Button
        variant="outline"
        onClick={read}
        disabled={busy || !text.trim() || demo}
      >
        {busy && !rows ? "Reading…" : "Read lines"}
      </Button>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}
      {rows && (
        <div className="space-y-3">
          <ul className="m-0 list-none space-y-2 p-0">
            {rows.map((r, i) => (
              <li
                key={i}
                className={`space-y-2 border border-line bg-surface-1 p-3 ${r.needs_confirm && !r.ok ? "border-l-4 border-l-warning" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-[13px]">
                    <p className="m-0 truncate text-ink">{r.name || "—"}</p>
                    <p className="m-0 truncate text-xs text-muted">
                      {r.kind}
                      {r.why?.[0] ? ` · ${r.why[0]}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-mono text-[11px] ${r.confidence >= 0.8 ? "text-success" : "text-warning"}`}
                    title="How sure the reading is (Comprehend + the rules)"
                  >
                    {Math.round(r.confidence * 100)}%
                  </span>
                </div>
                <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
                  <Input
                    aria-label={`Brand for line ${i + 1}`}
                    value={r.brand ?? ""}
                    placeholder="Brand"
                    onChange={(e) => update(i, { brand: e.target.value })}
                    className="h-8 text-[13px]"
                  />
                  <Input
                    aria-label={`${r.kind === "vehicle" ? "Year" : "Batch"} for line ${i + 1}`}
                    value={
                      r.kind === "vehicle"
                        ? String(r.year ?? "")
                        : (r.batch ?? "")
                    }
                    placeholder={r.kind === "vehicle" ? "Year" : "Batch"}
                    onChange={(e) =>
                      r.kind === "vehicle"
                        ? update(i, {
                            year: Number.parseInt(e.target.value, 10) || null,
                          })
                        : update(i, { batch: e.target.value || null })
                    }
                    className="h-8 font-mono text-[13px]"
                  />
                </div>
                <label className="flex items-center gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={r.ok}
                    onChange={(e) => update(i, { ok: e.target.checked })}
                    className="size-4 accent-[var(--primary-brand)]"
                  />
                  {r.needs_confirm ? "Looks right: add it" : "Add it"}
                </label>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            onClick={add}
            disabled={busy || ready === 0 || demo}
          >
            {busy ? "Adding…" : `Add ${ready} and check`}
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Vehicle ----------------------------------------------------------------------------------

const MAKES = [
  "Maruti Suzuki",
  "Hyundai",
  "Tata",
  "Mahindra",
  "Honda",
  "Toyota",
  "Kia",
  "Jeep",
  "Volkswagen",
  "Skoda",
  "Renault",
  "MG",
];

function VehicleTab({
  demo,
  onDone,
}: {
  demo: boolean;
  onDone: (items: Item[]) => void;
}) {
  const [f, setF] = useState({ make: "", model: "", year: "", reg_no: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid =
    f.make.trim() && f.model.trim() && /^\d{4}$/.test(f.year.trim());

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const make = f.make.trim();
      const body = {
        kind: "vehicle",
        name: `${make} ${f.model.trim()}`,
        brand: make,
        make: make.toLowerCase().replace(/^maruti suzuki$/, "maruti"),
        model: f.model.trim().toLowerCase(),
        year: Number(f.year),
        reg_no: f.reg_no.trim().toUpperCase().replace(/\s+/g, "") || null,
      };
      onDone((await apiPost<Created>("/items", body, demo)).items);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="v-make" className="text-xs text-muted">
            Make
          </Label>
          <Input
            id="v-make"
            list="v-makes"
            value={f.make}
            onChange={(e) => setF({ ...f, make: e.target.value })}
          />
          <datalist id="v-makes">
            {MAKES.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-model" className="text-xs text-muted">
            Model
          </Label>
          <Input
            id="v-model"
            value={f.model}
            onChange={(e) => setF({ ...f, model: e.target.value })}
            placeholder="Compass"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-year" className="text-xs text-muted">
            Model year
          </Label>
          <Input
            id="v-year"
            inputMode="numeric"
            value={f.year}
            onChange={(e) => setF({ ...f, year: e.target.value })}
            placeholder="2022"
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="v-reg" className="text-xs text-muted">
            Registration (optional)
          </Label>
          <Input
            id="v-reg"
            value={f.reg_no}
            onChange={(e) => setF({ ...f, reg_no: e.target.value })}
            placeholder="MH12AB1234"
            className="font-mono"
          />
        </div>
      </div>
      <p className="m-0 text-xs text-muted">
        Checked against NHTSA campaigns for the same make, model and year.
      </p>
      {error && (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {error}
        </p>
      )}
      <Button variant="outline" onClick={add} disabled={busy || !valid || demo}>
        {busy ? "Adding…" : "Add and check"}
      </Button>
    </div>
  );
}
