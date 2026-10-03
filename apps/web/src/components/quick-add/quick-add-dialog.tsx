import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuickAddStore } from "@/store/quick-add";
import { QuickAddInput } from "./quick-add-input";

/**
 * La captura rapida desde cualquier pantalla (tecla `q` o la paleta). Se
 * cierra al capturar: lo que se busca es apuntar y volver a lo que se hacia.
 */
export function QuickAddDialog({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const open = useQuickAddStore((state) => state.open);
  const setOpen = useQuickAddStore((state) => state.setOpen);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("quickAdd:dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("quickAdd:dialogDescription")}
          </DialogDescription>
        </DialogHeader>
        {open && workspaceId && (
          <DialogPanel scrollFade={false}>
            <QuickAddInput
              workspaceId={workspaceId}
              autoFocus
              onCaptured={() => setOpen(false)}
            />
          </DialogPanel>
        )}
      </DialogContent>
    </Dialog>
  );
}
