// frontend/components/ui/TablePagination.tsx
"use client";

import type { PageSize } from "../../lib/page-size";
import { PAGE_SIZE_OPTIONS } from "../../lib/page-size";

interface TablePaginationProps {
  page: number;
  limit: PageSize;
  total: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: PageSize) => void;
  className?: string;
}

const TablePagination = ({
  page,
  limit,
  total,
  onPageChange,
  onLimitChange,
  className = ""
}: TablePaginationProps): JSX.Element => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (safePage - 1) * limit + 1;
  const to = Math.min(safePage * limit, total);

  return (
    <div
      className={`flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between ${className}`}
    >
      <p className="text-sm text-textSecondary">
        {total === 0 ? (
          "Sin registros"
        ) : (
          <>
            Mostrando <span className="font-medium text-textPrimary">{from}</span>–
            <span className="font-medium text-textPrimary">{to}</span> de{" "}
            <span className="font-medium text-textPrimary">{total}</span>
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-textSecondary">
          <span className="whitespace-nowrap">Filas</span>
          <select
            className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-textPrimary"
            value={limit}
            onChange={(e) => {
              onLimitChange(Number(e.target.value) as PageSize);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-textPrimary hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-sm text-textSecondary">
            Página {safePage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onPageChange(safePage + 1)}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-textPrimary hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
};

export default TablePagination;
