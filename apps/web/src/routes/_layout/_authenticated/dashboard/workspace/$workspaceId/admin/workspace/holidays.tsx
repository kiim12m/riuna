import { createFileRoute } from "@tanstack/react-router";
import { CalendarOff, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFrame,
  CardHeader,
  CardPanel,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHolidayMutations } from "@/hooks/mutations/availability/use-availability-mutations";
import { useHolidays } from "@/hooks/queries/availability/use-availability";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { HttpError } from "@/lib/http-error";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/workspace/$workspaceId/admin/workspace/holidays",
)({
  component: RouteComponent,
});

/**
 * Los festivos del espacio (ADR 060): todos los ven en su Planificador, con
 * la capacidad del dia a 0; solo quien tiene `workspace:manage_settings` los
 * añade o quita.
 */
function RouteComponent() {
  const { t, i18n } = useTranslation();
  const { workspace, canManageSettings } = useWorkspacePermission();
  const canManage = canManageSettings();
  const workspaceId = workspace?.id ?? "";
  const { data: holidays } = useHolidays(workspaceId);
  const { create, remove } = useHolidayMutations(workspaceId);
  const dayId = useId();
  const nameId = useId();
  const [day, setDay] = useState("");
  const [name, setName] = useState("");

  const formatDay = new Intl.DateTimeFormat(i18n.language, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const add = () =>
    create.mutate(
      { day, name: name.trim() },
      {
        onSuccess: () => {
          setDay("");
          setName("");
        },
        onError: (error) =>
          toast.error(
            error instanceof HttpError && error.status === 409
              ? t("availability:holidays.duplicate")
              : t("availability:holidays.error"),
          ),
      },
    );

  return (
    <>
      <PageTitle title={t("availability:holidays.title")} />
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-page">{t("availability:holidays.title")}</h1>
          <p className="text-muted-foreground">
            {t("availability:holidays.subtitle")}
          </p>
        </div>

        <CardFrame>
          <Card className="!rounded-none !border-t-0">
            <CardHeader>
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <CalendarOff className="size-4" />
                {t("availability:holidays.title")}
              </CardTitle>
              <CardDescription>
                {t("availability:holidays.cardDescription")}
              </CardDescription>
            </CardHeader>
            <CardPanel className="space-y-4">
              {holidays && holidays.length > 0 ? (
                <ul className="space-y-2" data-testid="holiday-list">
                  {holidays.map((holiday) => (
                    <li
                      key={holiday.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{holiday.name}</p>
                        <p className="text-xs text-muted-foreground first-letter:uppercase">
                          {formatDay.format(new Date(holiday.day))}
                        </p>
                      </div>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("availability:holidays.remove", {
                            name: holiday.name,
                          })}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(holiday.id)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t("availability:holidays.empty")}
                </p>
              )}

              {canManage && (
                <div className="grid gap-3 border-border border-t pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                  <div className="space-y-1.5">
                    <Label htmlFor={dayId}>
                      {t("availability:holidays.day")}
                    </Label>
                    <Input
                      id={dayId}
                      type="date"
                      value={day}
                      onChange={(event) => setDay(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={nameId}>
                      {t("availability:holidays.name")}
                    </Label>
                    <Input
                      id={nameId}
                      maxLength={100}
                      placeholder={t("availability:holidays.namePlaceholder")}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <Button
                    disabled={!day || !name.trim() || create.isPending}
                    onClick={add}
                  >
                    {t("availability:holidays.add")}
                  </Button>
                </div>
              )}
            </CardPanel>
          </Card>
        </CardFrame>
      </div>
    </>
  );
}
