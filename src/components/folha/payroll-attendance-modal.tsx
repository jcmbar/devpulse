"use client";

import { loadPayrollAttendanceCalendarAction } from "@/app/app/gestor/folha/actions";
import { PayrollAttendancePanel } from "@/components/folha/payroll-attendance-panel";
import { PersonAvatar } from "@/components/person-avatar";
import type { HolidayOverlayEntry } from "@/lib/metrics/holiday-overlay";
import type {
  PayrollAttendanceDay,
  PayrollClosingItem,
} from "@/types/payroll-closing";
import { X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";

type PayrollAttendanceModalProps = {
  item: PayrollClosingItem;
  yearMonth: string;
  onClose: () => void;
  readOnly?: boolean;
  finalizedClosingId?: string | null;
  avatarUrl?: string | null;
};

export function PayrollAttendanceModal({
  item,
  yearMonth,
  onClose,
  readOnly = false,
  finalizedClosingId = null,
  avatarUrl = null,
}: PayrollAttendanceModalProps) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<PayrollAttendanceDay[]>([]);
  const [holidays, setHolidays] = useState<HolidayOverlayEntry[]>([]);
  const [dirty, setDirty] = useState(false);

  const requestClose = useCallback(() => {
    if (
      dirty &&
      !window.confirm(
        "Há alterações não salvas. Sair do calendário mesmo assim?",
      )
    ) {
      return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDirty(false);

    void loadPayrollAttendanceCalendarAction({
      itemId: item.id,
      developerId: item.developer_id,
      yearMonth,
    }).then((result) => {
      if (cancelled) {
        return;
      }
      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }
      setDays(result.days);
      setHolidays(result.holidays);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [item.developer_id, item.id, yearMonth]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [requestClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Fechar"
        onClick={requestClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(94dvh,100%)] w-full min-w-0 max-w-6xl flex-col overflow-hidden rounded-t-[var(--radius)] border border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] sm:rounded-[var(--radius)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <PersonAvatar
              name={item.developer_name}
              src={avatarUrl}
              size="md"
            />
            <div className="min-w-0">
              <h2
                id={titleId}
                className="truncate text-base font-semibold tracking-tight"
              >
                Presença e refeição · {item.developer_name}
              </h2>
              <p className="text-xs text-muted-foreground">
                Ajuste o calendário e salve. Os valores da NF continuam no
                sintético da folha.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
            aria-label="Fechar calendário"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {loading ? (
            <p className="text-sm text-muted-foreground">
              Carregando calendário…
            </p>
          ) : error ? (
            <p className="ui-alert-error" role="alert">
              {error}
            </p>
          ) : (
            <PayrollAttendancePanel
              item={item}
              days={days}
              holidays={holidays}
              onClose={onClose}
              readOnly={readOnly}
              finalizedClosingId={finalizedClosingId}
              avatarUrl={avatarUrl}
              embedded
              onDirtyChange={setDirty}
            />
          )}
        </div>
      </div>
    </div>
  );
}
