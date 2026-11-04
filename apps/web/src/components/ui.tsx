import * as Tooltip from "@radix-ui/react-tooltip";
import type { QueryObserverResult } from "@tanstack/react-query";
import { CircleHelp } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "ghost",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "ghost" | "primary";
}) {
  const tone =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "border border-border bg-transparent text-foreground hover:bg-white/5";
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tone} ${className}`}
      {...props}
    />
  );
}

export function Panel({
  title,
  question,
  hint,
  action,
  children,
}: {
  title: string;
  question: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted">{question}</p>
        </div>
        <div className="flex items-center gap-2">
          {hint ? <Hint label={hint} /> : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

export function Hint({ label }: { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="text-muted hover:text-foreground"
          aria-label={label}
        >
          <CircleHelp size={18} aria-hidden="true" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={8}
          className="z-50 max-w-sm rounded-md border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground shadow-none"
        >
          {label}
          <Tooltip.Arrow className="fill-border" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "neutral" | "primary" | "warning" | "danger" | "success" | "info";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-white/5 text-muted",
    primary: "bg-primary/15 text-primary",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
    success: "bg-success/15 text-success",
    info: "bg-info/15 text-info",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-sm font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "warning";
  children: ReactNode;
}) {
  const color =
    tone === "warning"
      ? "border-warning/40 text-warning"
      : "border-danger/40 text-danger";
  return (
    <div className={`rounded-md border bg-card px-3 py-2 text-sm ${color}`} role="alert">
      {children}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-white/5 ${className}`} />;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border px-4 py-10 text-center text-base text-muted">
      {children}
    </p>
  );
}

export function QueryBoundary<T>({
  query,
  skeleton,
  children,
}: {
  query: {
    isPending: boolean;
    isError: boolean;
    error: unknown;
    data: T | undefined;
    refetch: QueryObserverResult<T>["refetch"];
  };
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) {
    return skeleton ?? <Skeleton className="h-36 w-full" />;
  }
  if (query.isError || query.data === undefined) {
    const message =
      query.error instanceof Error
        ? query.error.message
        : "Falha desconhecida";
    return (
      <Alert>
        <p>Não foi possível carregar os dados. Tente novamente.</p>
        <p className="mt-1 text-xs opacity-80">{message}</p>
        <Button className="mt-3" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </Alert>
    );
  }
  return children(query.data);
}
