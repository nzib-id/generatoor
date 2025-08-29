"use client";

import { useEffect, useState } from "react";
import { useTraitStore } from "@/lib/useTraitStore";
import SpecificRules from "@/components/rules/SpecificRules";
import ShowToRules from "@/components/rules/ShowToRules";
import TagsPanel from "@/components/rules/TagsPanel";
import { RulesLayout } from "@/components/layout/RulesLayout";

type TabKey = "specific" | "showto" | "tags";

export default function RulesPage() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL!;
  const traits = useTraitStore((s) => s.traits);
  const rules = useTraitStore((s) => s.rules);
  const fetchAll = useTraitStore((s) => s.fetchAll);

  const [tab, setTab] = useState<TabKey>("specific");

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return (
    <div className="px-2 md:px-4">
      <RulesLayout active={tab} onChange={setTab}>
        {tab === "specific" && (
          <SpecificRules
            baseUrl={baseUrl}
            rules={rules}
            traits={traits || []}
            fetchAll={fetchAll}
          />
        )}

        {tab === "showto" && (
          <ShowToRules
            baseUrl={baseUrl}
            rules={rules}
            traits={traits || []}
            fetchAll={fetchAll}
          />
        )}

        {tab === "tags" && (
          <TagsPanel baseUrl={baseUrl} traits={traits || []} />
        )}
      </RulesLayout>
    </div>
  );
}
