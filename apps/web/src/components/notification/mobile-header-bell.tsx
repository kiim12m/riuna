import NotificationDropdown from "@/components/notification/notification-dropdown";
import { useIsMobile } from "@/hooks/use-mobile";

/**
 * La campana vive en el selector de espacio, dentro de la barra lateral. En
 * movil esa barra es un panel que solo existe abierto, asi que el contador de
 * no leidas no se veia nunca (ADR 048). En movil la cabecera lleva su propia
 * campana; se decide en JS y no con `md:hidden` para que en escritorio no
 * haya una segunda instancia montada y oculta.
 */
export function MobileHeaderBell() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return <NotificationDropdown registerShortcut={false} />;
}
