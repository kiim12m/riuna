import {
  createFileRoute,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod/v4";
import { AuthLayout } from "@/components/auth/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { toast } from "@/lib/toast";

const deviceSearchSchema = z.object({
  user_code: z.string().optional(),
});

export const Route = createFileRoute("/device/")({
  component: DevicePage,
  validateSearch: deviceSearchSchema,
});

function DevicePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: "/device/" });
  const [code, setCode] = useState(search.user_code ?? "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const formatted = code.trim().replace(/-/g, "").toUpperCase();
    if (formatted.length < 4) {
      toast.error(t("auth:device.codeRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await authClient.device({
        query: { user_code: formatted },
      });
      if (res.error) {
        toast.error(
          "error_description" in res.error
            ? String(res.error.error_description)
            : t("auth:device.invalidCode"),
        );
        return;
      }
      void navigate({
        to: "/device/approve",
        search: { user_code: formatted },
      });
    } catch {
      toast.error(t("auth:device.invalidCode"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title={t("auth:device.connectTitle")}
      subtitle={t("auth:device.connectSubtitle")}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t("auth:device.codePlaceholder")}
          autoCapitalize="characters"
          autoComplete="one-time-code"
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {t("auth:device.continue")}
        </Button>
      </form>
    </AuthLayout>
  );
}
