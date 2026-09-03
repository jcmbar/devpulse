"use client";

import { updatePayrollMonthStatusAction } from "@/app/app/gestor/folha/actions";
import {
  PAYROLL_CLOSING_STATUS_LABELS,
  PAYROLL_CLOSING_STATUSES,
  type PayrollClosingStatus,
  type PayrollMonthClosing,
} from "@/types/payroll-closing";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function PayrollMonthStatusControl({
  closing,
}: {
  closing: PayrollMonthClosing;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="ui-control-row">
      <label className="text-sm text-muted-foreground" htmlFor="payroll-status">
        Status
      </label>
      <select
        id="payroll-status"
        className="ui-select w-auto min-w-[10rem]"
        value={closing.status}
        disabled={pending}
        onChange={(event) => {
          const status = event.target.value as PayrollClosingStatus;
          setError(null);
          startTransition(async () => {
            const result = await updatePayrollMonthStatusAction({
              closingId: closing.id,
              status,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {PAYROLL_CLOSING_STATUSES.map((status) => (
          <option key={status} value={status}>
            {PAYROLL_CLOSING_STATUS_LABELS[status]}
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
