import { useNavigate } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import useClearNotifications from "@/hooks/mutations/notification/use-clear-notifications";
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

/**
 * La bandeja a pagina completa.
 *
 * Es la misma consulta `["notifications"]` que alimenta la campana, asi que
 * marcar una como leida aqui actualiza tambien el contador de la barra lateral
 * sin ningun trabajo extra. No hay estado nuevo —ni archivado ni pospuesto—:
 * esto es la superficie que a un desplegable no le cabe, no un modelo distinto.
 */
export function MyWorkInbox() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: notifications, isPending } = useGetNotifications();
  const [showClearDialog, setShowClearDialog] = useState(false);

  const { mutate: markAsRead } = useMarkNotificationAsRead();
  const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
  const { mutate: clearAll } = useClearNotifications();

  const unreadCount = notifications?.filter((item) => !item.isRead).length ?? 0;
  const hasNotifications = Boolean(notifications && notifications.length > 0);

  function handleClick(notification: Notification) {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }

    const target = getNotificationTarget(notification);
    if (target) {
      navigate({
        to: "/dashboard/workspace/$workspaceId/project/$projectId/task/$taskId",
        params: target,
      });
    }
  }

  if (isPending) {
    return (
      <div className="space-y-2">
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton key={key} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!hasNotifications) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bell />
          </EmptyMedia>
          <EmptyTitle>{t("myWork:inbox.empty.title")}</EmptyTitle>
          <EmptyDescription>
            {t("myWork:inbox.empty.description")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {/* `getNotifications` esta topada en 50 sin paginar: invisible en un
              desplegable, visible aqui. Decirlo es mas honrado que fingir que
              esto es todo lo que ha pasado. */}
          {t("myWork:inbox.limitNotice")}
        </span>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => markAllAsRead()}>
              {t("common:actions.markAllRead")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setShowClearDialog(true)}
          >
            {t("notifications:clearAll")}
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        {notifications?.map((notification) => {
          const content = getNotificationContent(notification, t);
          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleClick(notification)}
              className="flex w-full items-start gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  notification.isRead ? "bg-transparent" : "bg-info",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      notification.isRead
                        ? "text-muted-foreground"
                        : "font-medium text-foreground",
                    )}
                  >
                    {getNotificationTitle(notification, t)}
                  </span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground/70">
                    {formatRelativeTime(notification.createdAt)}
                  </span>
                </span>
                {content && (
                  <span
                    className={cn(
                      "mt-0.5 line-clamp-2 block text-xs",
                      notification.isRead
                        ? "text-muted-foreground/60"
                        : "text-muted-foreground",
                    )}
                  >
                    {content}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("notifications:clearDialogTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("notifications:clearDialogDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" size="sm" />}>
              {t("common:actions.cancel")}
            </AlertDialogClose>
            <AlertDialogClose
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    clearAll();
                    setShowClearDialog(false);
                  }}
                />
              }
            >
              {t("common:actions.clearAll")}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
