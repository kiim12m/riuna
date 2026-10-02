import {
  buildExchangeWorkbookOf,
  type ExchangeSheet,
} from "../../task/exchange/build-file";
import { serverDayKey } from "../../utils/day-boundaries";
import type { TimeSheetGroupBy } from "../constants";
import getTimeSheet from "./get-time-sheet";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const GROUP_HEADER: Record<TimeSheetGroupBy, string> = {
  day: "Día",
  task: "Tarea",
  project: "Proyecto",
};

/**
 * Exporta exactamente los grupos que pinta la pantalla -la misma consulta
 * de `getTimeSheet`, no una reimplementacion- (ADR 042).
 */
export default async function exportTimeSheet(params: {
  workspaceId: string;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
  groupBy: TimeSheetGroupBy;
}) {
  const timeSheet = await getTimeSheet(params);

  const sheet: ExchangeSheet = {
    sheetName: "Parte de horas",
    columns: [
      { header: GROUP_HEADER[params.groupBy], kind: "text", width: 40 },
      { header: "Horas", kind: "number", width: 14 },
      { header: "Entradas", kind: "number", width: 12 },
    ],
    rows: timeSheet.groups.map((group) => ({
      cells: [
        group.label,
        Math.round((group.seconds / 3600) * 100) / 100,
        group.entryCount,
      ],
    })),
  };

  // El dia del servidor, no el de UTC: con la API en Madrid (ADR 049) el
  // inicio del rango es la vispera a las 22:00 UTC, y el nombre del fichero
  // decia un dia antes del que se habia pedido.
  const filename = `parte-de-horas-${serverDayKey(params.windowStart)}-${serverDayKey(params.windowEnd)}.xlsx`;

  return {
    buffer: await buildExchangeWorkbookOf([sheet]),
    filename,
    contentType: XLSX_CONTENT_TYPE,
  };
}
