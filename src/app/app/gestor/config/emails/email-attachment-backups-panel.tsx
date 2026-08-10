"use client";

import {
  downloadEmailAttachmentBackupAction,
  downloadEmailAttachmentBackupZipAction,
  listEmailAttachmentBackupsAction,
} from "@/app/app/gestor/email-actions";
import { formatDateTimeShortBrazil } from "@/lib/datetime/format-brazil";
import type {
  EmailBackupAudience,
  EmailDispatchAttachmentBackupListItem,
} from "@/lib/email/attachment-backup-path";
import { emailBackupAudienceFolder } from "@/lib/email/attachment-backup-path";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { cn } from "@/lib/utils";
import { Archive, Download, FolderArchive, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

type Props = {
  /** Optional SSR seed; when omitted the panel loads after first paint. */
  initialRows?: EmailDispatchAttachmentBackupListItem[];
  months?: string[];
};

function triggerBrowserDownload(filename: string, href: string) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function triggerBase64Download(filename: string, base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  triggerBrowserDownload(filename, url);
  URL.revokeObjectURL(url);
}

export function EmailAttachmentBackupsPanel({
  initialRows,
  months: initialMonths,
}: Props) {
  const seeded = initialRows != null && initialMonths != null;
  const [rows, setRows] = useState<EmailDispatchAttachmentBackupListItem[]>(
    initialRows ?? [],
  );
  const [months, setMonths] = useState<string[]>(initialMonths ?? []);
  const [yearMonth, setYearMonth] = useState(initialMonths?.[0] ?? "");
  const [audience, setAudience] = useState<EmailBackupAudience | "all">("all");
  const [pending, startTransition] = useTransition();
  const [loadingList, setLoadingList] = useState(!seeded);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (seeded) {
      return;
    }
    let cancelled = false;
    void listEmailAttachmentBackupsAction().then((result) => {
      if (cancelled) {
        return;
      }
      setLoadingList(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      setMonths(result.months);
      setYearMonth((current) => current || result.months[0] || "");
    });
    return () => {
      cancelled = true;
    };
  }, [seeded]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (yearMonth && row.year_month !== yearMonth) {
        return false;
      }
      if (audience !== "all" && row.send_type_code !== audience) {
        return false;
      }
      return true;
    });
  }, [audience, rows, yearMonth]);

  const grouped = useMemo(() => {
    const map = new Map<string, EmailDispatchAttachmentBackupListItem[]>();
    for (const row of filtered) {
      const key = `${row.year_month}:${row.send_type_code}`;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  function downloadOne(backupId: string) {
    setError(null);
    setBusyId(backupId);
    startTransition(async () => {
      const result = await downloadEmailAttachmentBackupAction({ backupId });
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      triggerBrowserDownload(result.filename, result.url);
    });
  }

  function downloadZip(month: string, folderAudience: EmailBackupAudience) {
    setError(null);
    setBusyId(`zip:${month}:${folderAudience}`);
    startTransition(async () => {
      const result = await downloadEmailAttachmentBackupZipAction({
        yearMonth: month,
        audience: folderAudience,
      });
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      triggerBase64Download(
        result.filename,
        result.base64,
        "application/zip",
      );
    });
  }

  return (
    <section className="space-y-3 rounded-[var(--radius)] border border-border p-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Archive className="size-4" aria-hidden />
          Backup dos anexos enviados
        </h3>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">
          Após cada envio bem-sucedido ao Financeiro ou RH, o DevPulse arquiva
          uma cópia dos PDFs com o mesmo nome amigável do e-mail no storage
          hospedado (não no disco do seu Mac). Estrutura:{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
            /AAAA/AAAA-MM/Financeiro|RH/
          </code>
          . Baixe individualmente ou em ZIP.
        </p>
      </div>

      <div className="rounded-[var(--radius-sm)] border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
        Pasta no Mac só seria possível com um agente local (sync/Drive). Aqui o
        arquivamento automático fica no cloud; use download/ZIP para copiar
        para o seu computador.
      </div>

      {loadingList ? (
        <div
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Carregando backups…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <label className="space-y-1 text-xs">
              <span className="font-medium">Competência</span>
              <select
                value={yearMonth}
                onChange={(event) => setYearMonth(event.target.value)}
                className="block min-w-[10rem] rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Todas</option>
                {months.map((month) => (
                  <option key={month} value={month}>
                    {formatYearMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs">
              <span className="font-medium">Setor</span>
              <select
                value={audience}
                onChange={(event) =>
                  setAudience(event.target.value as EmailBackupAudience | "all")
                }
                className="block min-w-[10rem] rounded-[var(--radius-sm)] border border-border bg-background px-2 py-1.5 text-sm"
              >
                <option value="all">Todos</option>
                <option value="financeiro">Financeiro</option>
                <option value="rh">RH</option>
              </select>
            </label>
          </div>

          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum backup encontrado para este filtro.
            </p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([key, list]) => {
                const [month, sendType] = key.split(":");
                const folderAudience = sendType as EmailBackupAudience;
                const zipBusy = busyId === `zip:${month}:${folderAudience}`;
                return (
                  <div
                    key={key}
                    className="space-y-2 rounded-[var(--radius-sm)] border border-border/80 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">
                        {formatYearMonthLabel(month)} ·{" "}
                        {emailBackupAudienceFolder(folderAudience)}
                      </p>
                      <button
                        type="button"
                        className="ui-btn-secondary text-xs"
                        disabled={pending || zipBusy}
                        onClick={() => downloadZip(month, folderAudience)}
                      >
                        {zipBusy ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <FolderArchive className="size-3.5" />
                        )}
                        ZIP da pasta
                      </button>
                    </div>
                    <ul className="space-y-1.5">
                      {list.map((row) => {
                        const rowBusy = busyId === row.id;
                        return (
                          <li
                            key={row.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-muted/30 px-2.5 py-2 text-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {row.filename}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {row.developer_name ?? "—"} ·{" "}
                                {formatDateTimeShortBrazil(row.created_at)}
                              </p>
                            </div>
                            <button
                              type="button"
                              className={cn(
                                "ui-btn-secondary text-xs",
                                rowBusy && "opacity-70",
                              )}
                              disabled={pending || rowBusy}
                              onClick={() => downloadOne(row.id)}
                            >
                              {rowBusy ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Download className="size-3.5" />
                              )}
                              Baixar
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
