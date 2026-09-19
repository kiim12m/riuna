import { describe, expect, it } from "vitest";
import { richTextToPlainText } from "../../../apps/api/src/utils/rich-text-to-plain-text";

describe("richTextToPlainText", () => {
  it("returns an empty string for nothing", () => {
    expect(richTextToPlainText(null)).toBe("");
    expect(richTextToPlainText(undefined)).toBe("");
    expect(richTextToPlainText("")).toBe("");
  });

  it("keeps plain prose untouched", () => {
    expect(richTextToPlainText("Revisar puesta a tierra")).toBe(
      "Revisar puesta a tierra",
    );
  });

  it("strips Markdown emphasis but keeps the words", () => {
    expect(richTextToPlainText("**URGENT** y *revisado* y `cable 4x1.5`")).toBe(
      "URGENT y revisado y cable 4x1.5",
    );
    expect(richTextToPlainText("~~anulado~~")).toBe("anulado");
  });

  it("keeps list markers, because a bulleted cell reads better", () => {
    expect(
      richTextToPlainText("- Dimecres truca el tecnic\n- Encara esta pendent"),
    ).toBe("- Dimecres truca el tecnic\n- Encara esta pendent");
  });

  it("keeps link text and drops the target", () => {
    expect(
      richTextToPlainText("Ver [el expediente](https://example.test/a?b=1)"),
    ).toBe("Ver el expediente");
  });

  it("drops images entirely", () => {
    expect(
      richTextToPlainText("antes ![foto](https://a.test/x.png) despues"),
    ).toBe("antes  despues");
  });

  it("turns a mention into the name a reader expects", () => {
    expect(
      richTextToPlainText(
        'Preguntar a <riuna-mention id="abc123" label="Quim March"></riuna-mention> manana',
      ),
    ).toBe("Preguntar a @Quim March manana");
  });

  it("still understands the pre-rename tag names", () => {
    expect(
      richTextToPlainText(
        '<kaneo-mention id="abc123" label="Quim"></kaneo-mention> revisa',
      ),
    ).toBe("@Quim revisa");
  });

  it("renders an issue link as its key", () => {
    expect(
      richTextToPlainText(
        '<riuna-issue-link url="https://x.test/i/3" issue-key="RDEV-3" task-id="t1" />',
      ),
    ).toBe("RDEV-3");
  });

  it("falls back to the url when the issue link has no key", () => {
    expect(
      richTextToPlainText(
        '<riuna-issue-link url="https://x.test/i/3" issue-key="" task-id="t1" />',
      ),
    ).toBe("https://x.test/i/3");
  });

  it("breaks lines on block-level HTML", () => {
    expect(richTextToPlainText("<p>uno</p><p>dos</p>")).toBe("uno\ndos");
    expect(richTextToPlainText("uno<br>dos")).toBe("uno\ndos");
  });

  it("decodes entities", () => {
    expect(richTextToPlainText("Meta &amp; Requejo &lt;3 &#65; &#x42;")).toBe(
      "Meta & Requejo <3 A B",
    );
  });

  it("leaves an unknown entity alone rather than mangling it", () => {
    expect(richTextToPlainText("100 &euro; y &notanentity;")).toBe(
      "100 &euro; y &notanentity;",
    );
  });

  it("strips heading and quote markers", () => {
    expect(richTextToPlainText("## Resolucion\n> segun proyecto")).toBe(
      "Resolucion\nsegun proyecto",
    );
  });

  it("collapses runs of blank lines and trims the ends", () => {
    expect(richTextToPlainText("\n\n  uno\n\n\n\ndos  \n\n")).toBe(
      "uno\n\ndos",
    );
  });

  it("survives content that is only markup", () => {
    expect(richTextToPlainText("<p></p>")).toBe("");
    expect(
      richTextToPlainText('<riuna-mention id="a" label=""></riuna-mention>'),
    ).toBe("");
  });
});
