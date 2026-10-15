import { toastManager } from "@/components/ui/toast";

type ToastVariant = "success" | "error" | "info" | "warning";

type ToastAction = {
  label: string;
  onClick?: () => void;
};

type ToastOptions = {
  description?: string;
  action?: ToastAction;
  cancel?: ToastAction;
};

function addToast(
  title: string,
  variant?: ToastVariant,
  options?: ToastOptions,
) {
  let id = "";

  const action = options?.action ?? options?.cancel;

  id = toastManager.add({
    title,
    description: options?.description,
    type: variant,
    actionProps: action
      ? {
          children: action.label,
          onClick: () => {
            action.onClick?.();
            toastManager.close(id);
          },
        }
      : undefined,
  });

  return id;
}

type ToastFn = (title: string, options?: ToastOptions) => string;
type ToastId = string;

const success: ToastFn = (title, options) =>
  addToast(title, "success", options);
const error: ToastFn = (title, options) => addToast(title, "error", options);
const info: ToastFn = (title, options) => addToast(title, "info", options);
const warning: ToastFn = (title, options) =>
  addToast(title, "warning", options);
const message: ToastFn = (title, options) =>
  addToast(title, undefined, options);
const loading: ToastFn = (title, options) =>
  toastManager.add({
    title,
    description: options?.description,
    type: "loading",
  });
// Sin `id` no hay a quien cerrar: heredado de sonner, `dismiss()` cerraba
// todos, y aqui se quedaba en nada y el aviso de carga no se iba nunca.
const dismiss = (id: ToastId) => toastManager.close(id);

const toast = Object.assign(message, {
  success,
  error,
  info,
  warning,
  message,
  loading,
  dismiss,
});

export type { ToastOptions };
export { toast };
