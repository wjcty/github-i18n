"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  CaretLeftIcon,
  CaretRightIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const DESKTOP_PAGE_SIZES = [10, 20, 50] as const;
export const MOBILE_PAGE_SIZES = [5, 10, 20] as const;
export const DEFAULT_DESKTOP_PAGE_SIZE = 10;
export const DEFAULT_MOBILE_PAGE_SIZE = 5;

/** null = 尚未水合，避免移动端先按桌面页大小打一次请求 */
export function useIsMobile(breakpoint = 768): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);

  return mobile;
}

export function usePageSizePreference() {
  const isMobile = useIsMobile();
  const [pageSize, setPageSize] = useState<number | null>(null);

  useEffect(() => {
    if (isMobile === null || pageSize !== null) return;
    setPageSize(isMobile ? DEFAULT_MOBILE_PAGE_SIZE : DEFAULT_DESKTOP_PAGE_SIZE);
  }, [isMobile, pageSize]);

  const sizes = isMobile ? MOBILE_PAGE_SIZES : DESKTOP_PAGE_SIZES;
  return { isMobile, pageSize, setPageSize, sizes };
}

export function FilterField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("min-w-0 flex-1 space-y-1.5 sm:max-w-56", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function DataTableFilter({
  onSubmit,
  onReset,
  children,
  submitting,
}: {
  onSubmit: () => void;
  onReset: () => void;
  children: ReactNode;
  submitting?: boolean;
}) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-3 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {children}
        <div className="flex shrink-0 gap-2 sm:mt-3">
          <Button type="submit" size="sm" disabled={submitting}>
            <MagnifyingGlassIcon className="size-4" aria-hidden />
            查询
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onReset}>
            重置
          </Button>
        </div>
      </div>
    </form>
  );
}

export function DataTableFrame({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {children}
      {footer}
    </div>
  );
}

/** 行数超出可视区域时在表格内滚动，筛选项和分页始终可见 */
export const TABLE_SCROLL_CONTAINER =
  "max-h-[min(24rem,50vh)] overflow-auto sm:max-h-[min(36rem,60vh)]";

export const STICKY_TABLE_HEADER =
  "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_0_var(--border)] [&_th]:bg-card";

export function DataTablePagination({
  page,
  pageSize,
  total,
  pageSizes,
  onPageChange,
  onPageSizeChange,
  disabled,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  pageSizes: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const sizeItems = pageSizes.map((n) => ({
    value: String(n),
    label: `${n} 条/页`,
  }));

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4",
        className,
      )}
    >
      <p className="text-muted-foreground">
        共 <span className="font-medium text-foreground">{total}</span> 条
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Select
          items={sizeItems}
          value={String(pageSize)}
          onValueChange={(v) => {
            if (!v) return;
            onPageSizeChange(Number(v));
          }}
        >
          <SelectTrigger
            size="sm"
            className="w-[7.5rem]"
            aria-label="每页条数"
            disabled={disabled}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizes.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} 条/页
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="tabular-nums text-muted-foreground">
          {safePage} / {pageCount}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="上一页"
            disabled={disabled || safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
          >
            <CaretLeftIcon className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="下一页"
            disabled={disabled || safePage >= pageCount}
            onClick={() => onPageChange(safePage + 1)}
          >
            <CaretRightIcon className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  );
}
