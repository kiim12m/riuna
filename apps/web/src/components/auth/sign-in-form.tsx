import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error";
import { toast } from "@/lib/toast";

export type SignInFormValues = {
  // Correo o nombre de usuario: las cuentas locales no tienen correo real.
  identifier: string;
  password: string;
};

type SignInFormProps = {
  onSuccess?: () => void;
  defaultEmail?: string;
};

const signInSchema = z.object({
  identifier: z
    .string()
    .min(1)
    .refine(
      (value) => !value.includes("@") || z.email().safeParse(value).success,
    ),
  password: z.string(),
});

export function SignInForm({ onSuccess, defaultEmail }: SignInFormProps) {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const form = useForm<SignInFormValues>({
    resolver: standardSchemaResolver(signInSchema),
    defaultValues: {
      identifier: defaultEmail || "",
      password: "",
    },
  });

  const onSubmit = async (data: SignInFormValues) => {
    setIsPending(true);
    try {
      // La arroba es lo unico que separa un correo de un nombre de usuario,
      // y por eso el patron de usuario del servidor la prohibe.
      const identifier = data.identifier.trim();
      const result = identifier.includes("@")
        ? await authClient.signIn.email({
            email: identifier,
            password: data.password,
          })
        : await authClient.signIn.username({
            username: identifier,
            password: data.password,
          });

      if (result.error) {
        toast.error(
          authErrorMessage(t, result.error, "auth:signInForm.failedSignIn"),
        );
        return;
      }

      toast.success(t("auth:signInForm.signedInSuccess"));
      setTimeout(() => {
        onSuccess?.();
      }, 500);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("auth:signInForm.failedSignIn"),
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <div className="space-y-3">
          <FormField
            control={form.control}
            name="identifier"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">
                  {t("auth:forms.identifier")}
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder={t("auth:forms.identifierPlaceholder")}
                    type="text"
                    autoComplete="username"
                    {...field}
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
                <FormLabel className="text-sm font-medium">
                  {t("auth:forms.password")}
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder={t("auth:forms.passwordPlaceholder")}
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={
                        showPassword
                          ? t("auth:forms.hidePassword")
                          : t("auth:forms.showPassword")
                      }
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button
          type="submit"
          disabled={isPending}
          size="sm"
          className="w-full mt-4"
        >
          {isPending
            ? t("auth:signInForm.signingIn")
            : t("auth:signInForm.signIn")}
        </Button>
      </form>
    </Form>
  );
}
