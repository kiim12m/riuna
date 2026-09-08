import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import useMarkAllNotificationsAsRead from "@/hooks/mutations/notification/use-mark-all-notifications-as-read";
import useMarkNotificationAsRead from "@/hooks/mutations/notification/use-mark-notification-as-read";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import {
  getNotificationContent,
  getNotificationTarget,
  getNotificationTitle,
} from "@/lib/notification";
import type { Notification } from "@/types/notification";

/** Cuantas caben en una tarjeta sin convertirla en una pagina. */
const VISIBLE = 8;

/**
 * La bandeja como widget.
 *
 * **No pasa por el endpoint del panel**: se pinta con la misma consulta
 * `["notifications"]` que alimenta la campana, asi que marcar leido aqui
 * actualiza el contador de la barra lateral sin trabajo extra y sin una segunda
 * lectura de lo mismo. Es lo que decidio la ADR 024 y sigue valiendo: la bandeja
 * no estrena modelo.
 *
 * Lo que se pierde al dejar de ser pagina es el listado largo; la campana sigue
 * estando, y `getNotifications` continua topada en 50 sin paginar, que es deuda
 * declarada desde la Fase 6.
 */
export function InboxWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: notifications, isPending, isError } = useGetNotifications();
  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();

  if (isPending) {
    return (
      <div className="space-y-(--density-gap)">
        {["a", "b", "c"].map((key) => (
          <Skeleton key={key} className="h-8 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-4 text-center text-muted-foreground text-meta">
        {t("panels:inbox.error")}
      </p>
    );
  }

  const all = notifications ?? [];
  const unreadCount = all.filter((item) => !item.isRead).length;

  if (all.length === 0) {
    return (
      <p className="py-4 text-center text-muted-foreground text-meta">
        {t("panels:inbox.empty")}
      </p>
    );
  }

  function open(notification: Notification) {
    if (!notification.isRead) markAsRead(notification.id);

    const target = getNotificationTarget(notification);
    if (target) {
      navigate({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
        params: target,
      });
    }
  }

  return (
    <div className="space-y-2">
      {unreadCount > 0 && (
        <div className="flex justify-end">
          <Button variant="ghost" size="xs" onClick={() => markAllAsRead()}>
            {t("common:actions.markAllRead")}
          </Button>
        </div>
      )}

      <ul className="flex flex-col gap-(--density-gap)">
        {all.slice(0, VISIBLE).map((notification) => (
          <li key={notification.id}>
            <button
              type="button"
              onClick={() => open(notification)}
              className="flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left transition-colors duration-(--motion-fast) ease-out-quart hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  notification.isRead ? "bg-transparent" : "bg-info",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      "truncate text-body",
                      notification.isRead
                        ? "text-muted-foreground"
                        : "font-medium text-foreground",
                    )}
                  >
                    {getNotificationTitle(notification, t)}
                  </span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </span>
                {getNotificationContent(notification, t) && (
                  <span className="line-clamp-1 block text-[10px] text-muted-foreground">
                    {getNotificationContent(notification, t)}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
