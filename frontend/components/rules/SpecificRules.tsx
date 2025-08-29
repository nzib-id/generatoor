"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import RuleModal from "@/components/modal/RuleModal";
import { saveRules } from "@/lib/api";
import { sanitize, beautify } from "@/lib/sanitize";
import AppImage from "../ui/AppImage";

export interface SpecificRule {
  trait: string;
  value: string;
  context?: string;
  exclude_with?: { trait: string; value: string; context?: string }[];
  require_with?: { trait: string; value: string; context?: string }[];
  always_with?: { trait: string; value: string; context?: string }[];
}
export interface Trait {
  type: string;
  value: string;
  image: string;
  context?: string;
}

function getUniqueTraits(traits: Trait[]): Trait[] {
  const seen = new Set<string>();
  return (traits || []).filter((t) => {
    const key = `${t.type}-${t.value}-${t.context || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function IconAction({
  onClick,
  label,
  colorClass, // contoh: "border-red-500"
  children, // SVG icon
}: {
  onClick: () => void;
  label: string;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`group relative grid place-items-center w-12 h-12 ${colorClass} rounded-full active:translate-y-1 border-4 hover:-translate-y-1 cursor-pointer focus:outline-none`}
    >
      {children}

      {/* Tooltip */}
      <span
        className="pointer-events-none absolute -bottom-2 translate-y-full left-1/2 -translate-x-1/2
                   whitespace-nowrap rounded-md border-2 border-white/20 bg-[#262626] px-2 py-1
                   text-sm opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition
                   drop-shadow"
      >
        {label}
      </span>
    </button>
  );
}

export default function SpecificRules({
  baseUrl,
  rules,
  traits,
  fetchAll,
}: {
  baseUrl: string;
  rules: { specific?: SpecificRule[] };
  traits: Trait[];
  fetchAll: () => void | Promise<void>;
}) {
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"exclude" | "require" | "pair">(
    "exclude"
  );

  const openModal = (mode: "exclude" | "require" | "pair") => {
    setModalMode(mode);
    setShowModal(true);
  };

  const handleAddSpecific = async (newRule: SpecificRule) => {
    try {
      await saveRules({ mode: "append", specific: [newRule], global: {} });
      toast.success("Rule saved!");
      await fetchAll();
      setShowModal(false);
    } catch (err) {
      toast.error("Error Saving Rule");
      console.error(err);
    }
  };

  const handleDeleteSpecific = async (index: number) => {
    const rule = rules.specific?.[index];
    if (!rule) return;

    const type = rule.exclude_with
      ? "exclude"
      : rule.require_with
      ? "require"
      : rule.always_with
      ? "pair"
      : null;

    if (!type) return;

    const targets = (
      rule.exclude_with ||
      rule.require_with ||
      rule.always_with ||
      []
    ).map((t: any) => ({
      trait: t.trait,
      value: t.value,
      ...(t.context ? { context: t.context } : {}),
    }));

    try {
      await fetch(`${baseUrl}/api/rules`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trait: rule.trait,
          value: rule.value,
          type,
          targets,
          ...(rule.context ? { context: rule.context } : {}),
        }),
      });

      toast.success("Rule deleted!");
      await fetchAll();
    } catch (err) {
      toast.error("Error deleting rules");
      console.error(err);
    }
  };

  const getImageUrl = (trait: string, value: string, context?: string) => {
    const found = (traits || []).find(
      (t: any) =>
        sanitize(t.type) === sanitize(trait) &&
        sanitize(t.value) === sanitize(value) &&
        sanitize(t.context || "") === sanitize(context || "")
    );
    return found
      ? `${baseUrl}${found.image}`
      : `${baseUrl}/layers/${sanitize(trait)}${
          context ? `/${sanitize(context)}` : ""
        }/${sanitize(value)}.png`;
  };

  return (
    <section className="">
      <div className="flex justify-between  mb-20">
        <h3 className="font-semibold text-6xl ">Specific Rules</h3>

        <div className="flex items-center gap-3">
          <p className="text-white/50">Select rule:</p>

          {/* Exclude / Doesn't mix */}
          <IconAction
            onClick={() => openModal("exclude")}
            label="Doesn't Mix With"
            colorClass="border-red-500"
          >
            {/* Ban / block icon */}
            <Image
              src={"/exclude_with.svg"}
              alt="always mix with"
              fill
              className="object-contain p-2"
            />
          </IconAction>
          {/* Require / Only mix */}
          <IconAction
            onClick={() => openModal("require")}
            label="Only Mix With"
            colorClass="border-green-500"
          >
            {/* Check circle */}
            <Image
              src={"/require_with.svg"}
              alt="always with"
              fill
              className="object-contain p-2"
            />
          </IconAction>
          {/* Pair / Always pair */}
          <IconAction
            onClick={() => openModal("pair")}
            label="Always Pair With"
            colorClass="border-blue-500"
          >
            {/* Link / chain icon */}
            <Image
              src={"/always_with.svg"}
              alt="always with"
              fill
              className="object-contain p-2"
            />
          </IconAction>
        </div>
      </div>

      <ul className="text-xl flex flex-col gap-10">
        {(rules.specific || []).map((rule: SpecificRule, idx: number) => (
          <li key={idx} className="border-2 p-10 flex relative">
            <div className="flex flex-1 flex-col gap-5">
              <div className="flex items-center gap-5">
                <img
                  src={getImageUrl(rule.trait, rule.value, rule.context)}
                  alt={`${rule.trait}/${rule.value}`}
                  className="w-12 h-12 border"
                />
                <strong className="text-white text-3xl md:text-4xl flex items-center gap-2">
                  {beautify(rule.trait)} / {beautify(rule.value)}
                  {rule.context && (
                    <span className="ml-2 px-2 py-1 bg-[#444] text-base md:text-xl uppercase tracking-wide">
                      {rule.context}
                    </span>
                  )}
                </strong>
              </div>

              {rule.exclude_with && (
                <div className="text-sm items-center grid flex-wrap gap-3">
                  <span className="text-2xl text-red-500">
                    Doesn’t Mix With:
                  </span>
                  <div className="flex gap-6 md:gap-5 max-h-90 overflow-auto p-5 ">
                    {rule.exclude_with.map((r, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center gap-2 p-2"
                      >
                        <div className="relative w-32 h-32 border">
                          <AppImage
                            path={getImageUrl(r.trait, r.value, r.context)}
                            alt={`${r.trait}/${r.value}`}
                            className="border bg-transparent"
                            bgWhite={false}
                            fill
                            pixelated
                          />
                        </div>

                        <div className="grid grid-col w-full gap-2 text-center">
                          {r.context && (
                            <span className=" bg-[#444] text-xs uppercase tracking-wide">
                              {r.context}
                            </span>
                          )}
                          <span className="text-sm font-semibold tracking-wide ">
                            {beautify(r.value)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rule.require_with && (
                <div className="text-xl flex flex-wrap items-center gap-3">
                  <span className="text-2xl text-green-500">
                    Only Mix With:
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 max-h-90 overflow-auto p-6 md:p-10">
                    {rule.require_with.map((r, i) => (
                      <div key={i} className="flex items-center gap-5">
                        <img
                          src={getImageUrl(r.trait, r.value, r.context)}
                          alt={`${r.trait}/${r.value}`}
                          className="w-14 h-14 hover:z-50 border hover:scale-200 hover:bg-white transition"
                        />
                        <span>
                          {beautify(r.trait)} / {beautify(r.value)}
                          {r.context && (
                            <span className="ml-2 px-2 py-1 bg-[#444] text-sm uppercase tracking-wide">
                              {r.context}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rule.always_with && (
                <div className="text-xl items-center flex flex-wrap gap-3">
                  <span className="text-2xl text-blue-500">
                    Always Pair With:
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10 max-h-90 overflow-auto p-6 md:p-10">
                    {rule.always_with.map((r, i) => (
                      <div key={i} className="flex items-center gap-5">
                        <img
                          src={getImageUrl(r.trait, r.value, r.context)}
                          alt={`${r.trait}/${r.value}`}
                          className="w-14 h-14 border hover:scale-200 hover:bg-white transition"
                        />
                        <span>
                          {beautify(r.trait)} / {beautify(r.value)}
                          {r.context && (
                            <span className="ml-2 px-2 py-1 bg-[#444] text-sm uppercase tracking-wide">
                              {r.context}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => handleDeleteSpecific(idx)}
              className="absolute top-6 right-6 cursor-pointer ml-4 w-5 h-5"
              aria-label="Delete rule"
              title="Delete rule"
            >
              <Image src={"/ui/x.svg"} alt="delete" fill></Image>
            </button>
          </li>
        ))}
      </ul>

      {/* Modal */}
      <RuleModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleAddSpecific}
        traits={getUniqueTraits(Array.isArray(traits) ? traits : [])}
        mode={modalMode}
      />
    </section>
  );
}
