import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Beyond Words — Academy Management" },
      { name: "description", content: "Bilingual management system for academies, language centers and school support in Algeria." },
      { property: "og:title", content: "Beyond Words — Academy Management" },
      { property: "og:description", content: "Students, attendance by barcode, teacher payroll and finance in Arabic and English." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      throw redirect({ to: "/dashboard" });
    } else {
      throw redirect({ to: "/auth" });
    }
  },
});
