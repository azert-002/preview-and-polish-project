import { render } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@/lib/i18n";
import { StudentForm } from "@/components/StudentForm";
import * as dataModule from "@/lib/data";

describe("StudentForm component", () => {
  it("renders safely when subjects have missing, null, or string activities", () => {
    vi.spyOn(dataModule, "useSubjects").mockReturnValue({
      data: [
        { id: "s1", name_ar: "إنجليزية", name_en: "EN", activities: undefined as any, created_at: "" },
        { id: "s2", name_ar: "فرنسية", name_en: "FR", activities: null as any, created_at: "" },
        { id: "s3", name_ar: "ألمانية", name_en: "DE", activities: '["levels"]' as any, created_at: "" },
      ],
    } as any);

    vi.spyOn(dataModule, "useLevels").mockReturnValue({
      data: [{ id: "l1", code: "A1", price: 4000, package_price: 15000, sessions: 30, sort: 1, created_at: "" }],
    } as any);

    const qc = new QueryClient();
    try {
      render(
        <QueryClientProvider client={qc}>
          <I18nProvider>
            <StudentForm onSaved={() => {}} />
          </I18nProvider>
        </QueryClientProvider>
      );
    } catch (e) {
      console.error("CAUGHT ERROR:", e);
      throw e;
    }
  });
});
