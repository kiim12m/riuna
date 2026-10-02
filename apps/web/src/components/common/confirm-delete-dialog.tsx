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

/**
 * "¿Borrar esto?" con Cancelar y Borrar: el mismo `AlertDialog` que ya repiten
 * a mano las etiquetas, las claves de API, los proyectos y las entradas del
 * parte de horas. Nace con el borrado de widgets y objetivos, que se hacia de
 * un clic y sin vuelta atras (interludio de productividad, sub-bloque 0.5).
 */
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isPending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void;
  isPending?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
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
                disabled={isPending}
                onClick={onConfirm}
              />
            }
          >
            {t("common:actions.delete")}
          </AlertDialogClose>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
