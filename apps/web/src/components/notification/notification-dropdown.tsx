import { Bell } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
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
import { KbdSequence } from "@/components/ui/kbd";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { shortcuts } from "@/constants/shortcuts";
import getNotifications from "@/fetchers/notification/get-notifications";
import useClearNotifications from "@/hooks/mutations/notification/use-clear-notifications";
import useMarkAllNotificationsAsRead from "@/hooks/mutations/notification/use-mark-all-notifications-as-read";
import useMarkNotificationAsRead from "@/hooks/mutations/notification/use-mark-notification-as-read";
import useGetNotifications from "@/hooks/queries/notification/use-get-notifications";
import useUnreadNotificationCount from "@/hooks/queries/notification/use-unread-notification-count";
import { useRegisterShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useOpenNotification } from "@/hooks/use-open-notification";
import { cn } from "@/lib/cn";
import { formatRelativeTime } from "@/lib/format";
import {
  getNotificationContent,
  getNotificationTitle,
} from "@/lib/notification";
import type { Notification } from "@/types/notification";

export type NotificationDropdownRef = {
  toggle: () => void;
};

// Lo que devuelve el servidor por pagina cuando no se le pide otra cosa.
const PAGE_SIZE = 50;

type Props = {
  /**
   * Registra el atajo `n o`. Solo debe hacerlo una instancia: el registro va
   * por tecla, y desmontar una segunda campana borraria tambien el atajo de
   * la primera. La campana de la cabecera movil (`MobileHeaderBell`) no lo
   * registra.
   */
  registerShortcut?: boolean;
};

const NotificationDropdown = forwardRef<NotificationDropdownRef, Props>(
  ({ registerShortcut = true }, ref) => {
    const { t } = useTranslation();
    const {
      data: firstPage,
      dataUpdatedAt,
      isError: listFailed,
    } = useGetNotifications();
    const { data: unreadTotal } = useUnreadNotificationCount();
    // Las paginas siguientes a la primera. Se vacian en cuanto la primera se
    // vuelve a leer —marcar leida, borrar, un aviso nuevo—, porque lo que
    // habia ahi ya puede no ser verdad.
    const [olderPages, setOlderPages] = useState<Notification[]>([]);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [reachedEnd, setReachedEnd] = useState(false);
    const [loadMoreFailed, setLoadMoreFailed] = useState(false);
    // biome-ignore lint/correctness/useExhaustiveDependencies: es el aviso de que la primera pagina cambio
    useEffect(() => {
      setOlderPages([]);
      setReachedEnd(false);
      setLoadMoreFailed(false);
    }, [dataUpdatedAt]);
    const notifications = firstPage ? [...firstPage, ...olderPages] : firstPage;
    const canLoadMore =
      !reachedEnd && !listFailed && (firstPage?.length ?? 0) >= PAGE_SIZE;

    const loadMore = async () => {
      const last = notifications?.at(-1);
      if (!last || isLoadingMore) return;
      setIsLoadingMore(true);
      setLoadMoreFailed(false);
      try {
        const next = await getNotifications({
          limit: PAGE_SIZE,
          before: String(last.createdAt),
          beforeId: last.id,
        });
        setOlderPages((current) => [
          ...current,
          ...next.filter(
            (item) => !current.some((seen) => seen.id === item.id),
          ),
        ]);
        if (next.length < PAGE_SIZE) setReachedEnd(true);
      } catch {
        setLoadMoreFailed(true);
      } finally {
        setIsLoadingMore(false);
      }
    };
    const [isOpen, setIsOpen] = useState(false);
    const [showClearDialog, setShowClearDialog] = useState(false);

    const { mutate: markAllAsRead } = useMarkAllNotificationsAsRead();
    const { mutate: clearAll } = useClearNotifications();
    const { mutate: markAsRead } = useMarkNotificationAsRead();
    const openNotification = useOpenNotification();

    const handleNotificationClick = useCallback(
      (notification: Notification) => {
        if (!notification.isRead) {
          markAsRead(notification.id);
        }

        openNotification(notification);
      },
      [markAsRead, openNotification],
    );

    // El total viene del servidor: contar las que se ven ocultaba todas las
    // que no caben en la primera pagina.
    const unreadCount =
      unreadTotal ?? notifications?.filter((n) => !n.isRead).length ?? 0;
    const hasNotifications = notifications && notifications.length > 0;

    useImperativeHandle(ref, () => ({
      toggle: () => setIsOpen(!isOpen),
    }));

    const handleClearAll = () => {
      clearAll();
      setShowClearDialog(false);
    };

    useRegisterShortcuts({
      sequentialShortcuts: registerShortcut
        ? {
            [shortcuts.notification.prefix]: {
              [shortcuts.notification.open]: () => setIsOpen(!isOpen),
            },
          }
        : {},
    });

    return (
      <>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-1 text-label font-semibold leading-none text-white ring-2 ring-sidebar transition-[scale,opacity] duration-200 ease-out starting:scale-75 starting:opacity-0 motion-reduce:starting:scale-100">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                    <span className="sr-only">
                      {t("navigation:notifications")}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p className="flex items-center gap-2">
                  <KbdSequence
                    keys={[
                      shortcuts.notification.prefix,
                      shortcuts.notification.open,
                    ]}
                    description={t("notifications:shortcuts.open")}
                  />
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <DropdownMenuContent align="end" className="w-88 p-0">
            <div className="overflow-hidden rounded-lg">
              <div className="flex h-10 items-center justify-between border-border/50 border-b pr-2 pl-3">
                <h3 className="font-medium text-sm">
                  {t("notifications:title")}
                </h3>
                {unreadCount > 0 && (
                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => markAllAsRead()}
                    className="min-h-0 w-auto cursor-pointer rounded-md px-1.5 py-1 text-muted-foreground text-xs sm:min-h-0 sm:text-xs data-highlighted:text-foreground"
                  >
                    {t("common:actions.markAllRead")}
                  </DropdownMenuItem>
                )}
              </div>

              <div className="relative max-h-80 overflow-y-auto p-1">
                {!hasNotifications ? (
                  <div className="flex flex-col items-center gap-1 py-10 text-center">
                    <Bell className="mb-1 size-5 text-muted-foreground/40" />
                    <p className="text-muted-foreground text-sm">
                      {t("notifications:emptyTitle")}
                    </p>
                    <p className="text-muted-foreground/60 text-xs">
                      {t("notifications:emptySubtitle")}
                    </p>
                  </div>
                ) : (
                  notifications.map((notification) => {
                    const content = getNotificationContent(notification, t);
                    return (
                      <DropdownMenuItem
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className="cursor-pointer items-start rounded-md px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "truncate text-sm transition-colors duration-150",
                                notification.isRead
                                  ? "text-muted-foreground"
                                  : "font-medium text-foreground",
                              )}
                            >
                              {getNotificationTitle(notification, t)}
                            </span>
                            <span className="ml-auto shrink-0 text-label text-muted-foreground/70">
                              {formatRelativeTime(notification.createdAt)}
                            </span>
                            {!notification.isRead && (
                              <span className="size-1.5 shrink-0 rounded-full bg-info" />
                            )}
                          </div>
                          {content && (
                            <p
                              className={cn(
                                "mt-0.5 line-clamp-1 text-xs transition-colors duration-150",
                                notification.isRead
                                  ? "text-muted-foreground/60"
                                  : "text-muted-foreground",
                              )}
                            >
                              {content}
                            </p>
                          )}
                        </div>
                      </DropdownMenuItem>
                    );
                  })
                )}
              </div>
              {hasNotifications && canLoadMore && (
                <div className="border-border/50 border-t p-1">
                  <DropdownMenuItem
                    closeOnClick={false}
                    disabled={isLoadingMore}
                    onClick={loadMore}
                    className="min-h-0 cursor-pointer justify-center rounded-md px-2 py-1 text-muted-foreground text-xs sm:min-h-0 sm:text-xs data-highlighted:text-foreground"
                  >
                    {loadMoreFailed
                      ? t("notifications:loadMoreFailed")
                      : t("notifications:loadMore")}
                  </DropdownMenuItem>
                </div>
              )}
              {hasNotifications && (
                <div className="border-border/50 border-t p-1">
                  <DropdownMenuItem
                    onClick={() => setShowClearDialog(true)}
                    className="min-h-0 cursor-pointer justify-center rounded-md px-2 py-1 text-muted-foreground/70 text-xs sm:min-h-0 sm:text-xs data-highlighted:text-destructive"
                  >
                    {t("notifications:clearAll")}
                  </DropdownMenuItem>
                </div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

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
                    onClick={handleClearAll}
                  />
                }
              >
                {t("common:actions.clearAll")}
              </AlertDialogClose>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  },
);

NotificationDropdown.displayName = "NotificationDropdown";

export default NotificationDropdown;
