import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth-provider/hooks/use-auth";
import { formatDateMedium } from "@/lib/format";

/**
 * La cabecera del panel: a quien saluda y en que dia.
 *
 * Es lo unico de esta pantalla que no es un dato: existe porque un panel
 * personal necesita decir de quien es, y porque la fecha es la referencia
 * implicita de todo lo que hay debajo —"vencidas", "hoy", "esta semana" se leen
 * contra ella—. Sin ilustracion: `marca.md` §06 principio 1 pide el chrome
 * callado, y una imagen aqui competiria con las cifras que vienen justo debajo.
 */
export function GreetingHeader() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();

  const hour = new Date().getHours();
  const moment =
    hour < 6
      ? "night"
      : hour < 13
        ? "morning"
        : hour < 21
          ? "afternoon"
          : "evening";

  // El nombre de pila basta: es su propia pantalla, no una carta.
  const firstName = user?.name?.trim().split(/\s+/)[0] ?? "";

  return (
    <header className="flex flex-wrap items-baseline justify-between gap-2 pb-4">
      <div>
        <h1 className="text-page">
          {firstName
            ? t(`panels:greeting.${moment}`, { name: firstName })
            : t(`panels:greeting.${moment}NoName`)}
        </h1>
        <p className="text-muted-foreground text-meta">
          {t("panels:greeting.subtitle")}
        </p>
      </div>
      <p className="text-muted-foreground text-meta tabular-nums">
        {formatDateMedium(new Date(), i18n.language)}
      </p>
    </header>
  );
}
