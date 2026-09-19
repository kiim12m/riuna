import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import useCreateLocalUser from "@/hooks/mutations/user/use-create-local-user";
import useActiveWorkspace from "@/hooks/queries/workspace/use-active-workspace";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Mismo patron que el servidor en create-local-user.ts. La arroba queda fuera a
// proposito: es lo unico que distingue un usuario de un correo al iniciar sesion.
const USERNAME_PATTERN = /^[a-z0-9._-]{3,32}$/;

const localUserSchema = z.object({
  username: z.string().regex(USERNAME_PATTERN),
  displayName: z.string().min(1),
  password: z.string().min(8),
  role: z.string(),
});

type LocalUserFormValues = z.infer<typeof localUserSchema>;

function CreateLocalUserModal({ open, onClose }: Props) {
  const { t } = useTranslation();
  const { data: workspace } = useActiveWorkspace();
  const workspaceId = workspace?.id;
  const { mutateAsync, isPending } = useCreateLocalUser();

  const form = useForm<LocalUserFormValues>({
    resolver: standardSchemaResolver(localUserSchema),
    defaultValues: {
      username: "",
      displayName: "",
      password: "",
      role: "member",
    },
  });

  const closeAndReset = () => {
    form.reset();
    onClose();
  };

  const onSubmit = async (values: LocalUserFormValues) => {
    if (!workspaceId) {
      toast.error(t("team:localUserModal.error"));
      return;
    }

    try {
      await mutateAsync({ ...values, workspaceId });
      toast.success(
        t("team:localUserModal.created", { username: values.username }),
      );
      closeAndReset();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("team:localUserModal.error"),
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={closeAndReset}>
      <DialogPopup className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{t("team:localUserModal.title")}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
            <DialogPanel className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("team:localUserModal.description")}
              </p>

              <FormField
                control={form.control}
                name="username"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("team:localUserModal.usernameLabel")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t(
                          "team:localUserModal.usernamePlaceholder",
                        )}
                        autoComplete="off"
                        autoFocus
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("team:localUserModal.displayNameLabel")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t(
                          "team:localUserModal.displayNamePlaceholder",
                        )}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t("team:localUserModal.passwordLabel")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="password"
                        autoComplete="new-password"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("team:localUserModal.roleLabel")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger size="sm" className="h-9 w-full">
                        <SelectValue>
                          {t(`team:roles.${field.value}`)}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">
                          {t("team:roles.viewer")}
                        </SelectItem>
                        <SelectItem value="member">
                          {t("team:roles.member")}
                        </SelectItem>
                        <SelectItem value="admin">
                          {t("team:roles.admin")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
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
              <Button
                type="submit"
                size="sm"
                disabled={!workspaceId || isPending}
              >
                {t("team:localUserModal.submit")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogPopup>
    </Dialog>
  );
}

export default CreateLocalUserModal;
