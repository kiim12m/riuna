import { useTranslation } from "react-i18next";

export function KaneoBranding() {
  const { t } = useTranslation();

  // Sin enlace: Riuna es una instancia interna, no un producto con web pública.
  return (
    <span>
      {t("publicProject:branding.poweredBy")}{" "}
      <span className="font-medium">{t("common:appName")}</span>
    </span>
  );
}
