import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import useManageAccount from "@/hooks/mutations/user/use-manage-account";
import { toast } from "@/lib/toast";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";

export type ManagedAccount = {
  userId: string;
  name: string;
  email: string;
  isLocalAccount: boolean;
  banned: boolean;
};

type Props = {
  account: ManagedAccount | null;
  workspaceId: string;
  onClose: () => void;
};

const manageSchema = z.object({
  name: z.string().min(1),
  // Vacio significa «no tocar»: ni la contrasena ni el correo se cambian solos.
  email: z.string(),
  password: z.string(),
  banned: z.boolean(),
});

type ManageFormValues = z.infer<typeof manageSchema>;

function ManageAccountModal({ account, workspaceId, onClose }: Props) {
  const { t } = useTranslation();
  const { mutateAsync, isPending } = useManageAccount();

  const form = useForm<ManageFormValues>({
    resolver: standardSchemaResolver(manageSchema),
    defaultValues: { name: "", email: "", password: "", banned: false },
  });

  const { reset } = form;

  useEffect(() => {
    if (!account) return;
    reset({
      name: account.name,
      email: "",
      password: "",
      banned: account.banned,
    });
  }, [account, reset]);

  const onSubmit = async (values: ManageFormValues) => {
    if (!account) return;

    const email = values.email.trim();
    // La contrasena va tal cual: recortarla guardaba una distinta de la que se
    // escribio, y quien la recibia no podia entrar con ella.
    const password = values.password;

    if (password && password.length < 8) {
      form.setError("password", {
        message: t("team:manageAccount.shortPassword"),
      });
      return;
    }

    try {
      await mutateAsync({
        userId: account.userId,
        workspaceId,
        name: values.name !== account.name ? values.name : undefined,
        email: email || undefined,
        password: password || undefined,
        banned: values.banned !== account.banned ? values.banned : undefined,
      });
      toast.success(t("team:manageAccount.saved"));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("team:manageAccount.error"),
      );
    }
  };

  return (
    <Dialog open={Boolean(account)} onOpenChange={onClose}>
      <DialogPopup className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{t("team:manageAccount.title")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <DialogPanel className="space-y-3">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("team:manageAccount.nameLabel")}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {account?.isLocalAccount ? (
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t("team:manageAccount.emailLabel")}
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder={t("team:manageAccount.emailPlaceholder")}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        {t("team:manageAccount.emailHelp")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <div className="space-y-1">
                  <span className="font-medium text-sm">
                    {t("team:manageAccount.emailLabel")}
                  </span>
                  <p className="text-muted-foreground text-sm">
                    {account?.email}
                  </p>
                </div>
              )}

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("team:manageAccount.passwordLabel")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                        placeholder={t(
                          "team:manageAccount.passwordPlaceholder",
                        )}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="banned"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-md border border-border/70 p-3">
                    <div className="space-y-0.5">
                      <FormLabel>
                        {t("team:manageAccount.blockLabel")}
                      </FormLabel>
                      <p className="text-xs text-muted-foreground">
                        {t("team:manageAccount.blockHelp")}
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={Boolean(field.value)}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </DialogPanel>

            <DialogFooter>
              <DialogClose
                render={<Button variant="outline" size="sm" type="button" />}
              >
                {t("common:actions.cancel")}
              </DialogClose>
              <Button type="submit" size="sm" disabled={isPending}>
                {t("common:actions.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}

export default ManageAccountModal;
