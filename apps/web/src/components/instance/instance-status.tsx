import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { InstanceReport } from "@/fetchers/instance";
import { formatDateTime, formatRelativeTime } from "@/lib/format";

// Los trabajos se llaman por su id en la API; aquí, por su nombre. Un trabajo
// nuevo sin traducción sale con su id, que también se entiende.
const JOB_NAME_KEYS = {
  "due-date-reminders": "settings:instance.jobs.names.dueDateReminders",
  "project-webhook-reminders":
    "settings:instance.jobs.names.projectWebhookReminders",
  "seat-reconciliation": "settings:instance.jobs.names.seatReconciliation",
  "trial-reminders": "settings:instance.jobs.names.trialReminders",
  "recurring-tasks": "settings:instance.jobs.names.recurringTasks",
  automations: "settings:instance.jobs.names.automations",
  "instance-health": "settings:instance.jobs.names.instanceHealth",
} as const;

const STATUS_KEYS = {
  ok: "settings:instance.jobs.statusOk",
  degraded: "settings:instance.jobs.statusDegraded",
  error: "settings:instance.jobs.statusError",
} as const;

function formatBytes(bytes: number, locale: string) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${value.toLocaleString(locale, { maximumFractionDigits: digits })} ${units[unit]}`;
}

function formatMs(ms: number, locale: string) {
  return ms >= 1000
    ? `${(ms / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} s`
    : `${ms.toLocaleString(locale)} ms`;
}

function Section({
  title,
  children,
  note,
}: {
  title: string;
  children: ReactNode;
  note?: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-medium text-section">{title}</h2>
        {note && <p className="text-meta text-muted-foreground">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background p-(--density-card-pad)">
      <p className="text-meta text-muted-foreground">{label}</p>
      <div className="mt-0.5 flex flex-col gap-0.5 text-body">{children}</div>
    </div>
  );
}

function Summary({ report }: { report: InstanceReport }) {
  const { t } = useTranslation();
  const notified = new Set(report.alerts.map((alert) => alert.key));

  if (report.problems.length === 0) {
    return (
      <Alert variant="success">
        <CheckCircle2 />
        <AlertTitle>{t("settings:instance.allGood")}</AlertTitle>
        <AlertDescription>
          {t("settings:instance.refreshNote")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="warning">
      <AlertTriangle />
      <AlertTitle>
        {t("settings:instance.problemsTitle", {
          count: report.problems.length,
        })}
      </AlertTitle>
      <AlertDescription>
        <ul className="flex flex-col gap-1">
          {report.problems.map((problem) => (
            <li key={problem.key} className="flex flex-wrap items-center gap-2">
              <span>{problem.message}</span>
              {notified.has(problem.key) && (
                <Badge variant="outline" size="sm">
                  {t("settings:instance.notified")}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function Facts({ report, locale }: { report: InstanceReport; locale: string }) {
  const { t } = useTranslation();
  const { database, backups, realtime } = report;
  const pending =
    database.appliedMigrations !== null &&
    database.bundledMigrations !== null &&
    database.appliedMigrations < database.bundledMigrations;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      <Fact label={t("settings:instance.version.title")}>
        <span className="tabular-nums">{report.version ?? "—"}</span>
        <span className="text-meta text-muted-foreground">
          {report.revision
            ? t("settings:instance.version.commit", {
                revision: report.revision.slice(0, 7),
              })
            : t("settings:instance.version.noRevision")}
        </span>
        <span className="text-meta text-muted-foreground">
          {t("settings:instance.version.started", {
            when: formatDateTime(report.startedAt, locale),
          })}
        </span>
      </Fact>

      <Fact label={t("settings:instance.database.title")}>
        <span className="tabular-nums">
          {formatBytes(database.sizeBytes, locale)}
        </span>
        <span className="text-meta text-muted-foreground">
          {t("settings:instance.database.postgres", {
            version: database.version ?? "—",
          })}
        </span>
        <span className="text-meta text-muted-foreground tabular-nums">
          {t("settings:instance.database.migrations", {
            applied: database.appliedMigrations ?? "—",
            bundled: database.bundledMigrations ?? "—",
          })}
        </span>
        {pending && (
          <Badge variant="warning" size="sm" className="self-start">
            {t("settings:instance.database.pending")}
          </Badge>
        )}
      </Fact>

      <Fact label={t("settings:instance.backups.title")}>
        {!backups.configured ? (
          <span className="text-meta text-muted-foreground">
            {t("settings:instance.backups.notConfigured")}
          </span>
        ) : (
          <>
            <span>
              {backups.latest
                ? t("settings:instance.backups.latest", {
                    when: formatRelativeTime(backups.latest.createdAt, locale),
                    size: formatBytes(backups.latest.sizeBytes, locale),
                  })
                : t("settings:instance.backups.none")}
            </span>
            <span className="text-meta text-muted-foreground tabular-nums">
              {t("settings:instance.backups.count", { count: backups.count })}
            </span>
            <span className="text-meta text-muted-foreground">
              {t("settings:instance.backups.offsite")}:{" "}
              {!backups.offsite
                ? t("settings:instance.backups.offsiteOff")
                : backups.offsite.status === "ok" &&
                    backups.offsite.lastSuccessAt
                  ? t("settings:instance.backups.offsiteOk", {
                      when: formatRelativeTime(
                        backups.offsite.lastSuccessAt,
                        locale,
                      ),
                      count: backups.offsite.remoteCount ?? 0,
                    })
                  : t("settings:instance.backups.offsiteError", {
                      message: backups.offsite.message ?? "—",
                    })}
            </span>
          </>
        )}
      </Fact>

      <Fact label={t("settings:instance.realtime.title")}>
        <span>
          {realtime.redis
            ? t("settings:instance.realtime.redisOn")
            : t("settings:instance.realtime.redisOff")}
        </span>
        <span className="text-meta text-muted-foreground tabular-nums">
          {t("settings:instance.realtime.connections", {
            users: realtime.connections.users,
            projects: realtime.connections.projects,
          })}
        </span>
      </Fact>
    </div>
  );
}

function Jobs({ report, locale }: { report: InstanceReport; locale: string }) {
  const { t } = useTranslation();

  return (
    <Section title={t("settings:instance.jobs.title")}>
      {!report.schedulerEnabled && (
        <p className="text-meta text-warning-foreground">
          {t("settings:instance.jobs.disabled")}
        </p>
      )}
      {report.jobs.length === 0 ? (
        <p className="text-meta text-muted-foreground">
          {t("settings:instance.jobs.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings:instance.jobs.job")}</TableHead>
                <TableHead>{t("settings:instance.jobs.status")}</TableHead>
                <TableHead>{t("settings:instance.jobs.lastRun")}</TableHead>
                <TableHead className="text-right">
                  {t("settings:instance.jobs.duration")}
                </TableHead>
                <TableHead className="text-right">
                  {t("settings:instance.jobs.failures")}
                </TableHead>
                <TableHead>{t("settings:instance.jobs.error")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.jobs.map((job) => {
                const nameKey =
                  JOB_NAME_KEYS[job.job as keyof typeof JOB_NAME_KEYS];
                const statusKey =
                  STATUS_KEYS[job.lastStatus as keyof typeof STATUS_KEYS];
                return (
                  <TableRow key={job.job}>
                    <TableCell className="font-medium">
                      {nameKey ? t(nameKey) : job.job}
                    </TableCell>
                    <TableCell>
                      <Badge
                        size="sm"
                        variant={
                          job.lastStatus === "ok"
                            ? "success"
                            : job.lastStatus === "degraded"
                              ? "warning"
                              : "error"
                        }
                      >
                        {statusKey ? t(statusKey) : job.lastStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {job.lastFinishedAt
                        ? formatRelativeTime(job.lastFinishedAt, locale)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMs(job.lastDurationMs, locale)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {job.consecutiveFailures}
                    </TableCell>
                    <TableCell className="max-w-80 truncate text-muted-foreground">
                      {job.lastError ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

function Routes({
  report,
  locale,
}: {
  report: InstanceReport;
  locale: string;
}) {
  const { t } = useTranslation();

  return (
    <Section
      title={t("settings:instance.routes.title")}
      note={t("settings:instance.routes.note")}
    >
      <p className="text-meta text-muted-foreground tabular-nums">
        {t("settings:instance.routes.serverErrors", {
          count: report.requests.serverErrors,
        })}
      </p>
      {report.requests.slowest.length === 0 ? (
        <p className="text-meta text-muted-foreground">
          {t("settings:instance.routes.empty")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("settings:instance.routes.route")}</TableHead>
                <TableHead className="text-right">
                  {t("settings:instance.routes.requests")}
                </TableHead>
                <TableHead className="text-right">
                  {t("settings:instance.routes.errors")}
                </TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.requests.slowest.map((route) => (
                <TableRow key={`${route.method} ${route.route}`}>
                  <TableCell className="font-mono text-meta">
                    {route.method} {route.route}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {route.count.toLocaleString(locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {route.errors}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMs(route.p50, locale)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMs(route.p95, locale)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  );
}

/**
 * El estado de la instancia (ADR 075): lo que su admin necesita para saber si
 * la instancia está sana sin abrir una terminal. Solo lectura.
 */
export function InstanceStatus({
  report,
  isLoading,
  isError,
}: {
  report: InstanceReport | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (isError) {
    return (
      <Alert variant="error">
        <AlertTriangle />
        <AlertTitle>{t("settings:instance.loadError")}</AlertTitle>
      </Alert>
    );
  }

  if (isLoading || !report) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Summary report={report} />
      {!report.rateLimitEnabled && (
        <p className="text-meta text-warning-foreground">
          {t("settings:instance.rateLimitOff")}
        </p>
      )}
      <Facts report={report} locale={locale} />
      <Jobs report={report} locale={locale} />
      <Routes report={report} locale={locale} />
      <Section title={t("settings:instance.you.title")}>
        <p className="font-mono text-body">
          {report.you.ip ?? t("settings:instance.you.unknown")}
        </p>
        <p className="text-meta text-muted-foreground">
          {t("settings:instance.you.hint")}
        </p>
      </Section>
    </div>
  );
}

export default InstanceStatus;
