import { useState } from "react";

type SearchableDropdownProps = {
  label: string;
  options: string[];
  value: string;
  onChange: (val: string) => void;
};

export default function SearchableDropdown({
  label,
  options,
  value,
  onChange,
}: SearchableDropdownProps) {
  const [show, setShow] = useState(false);
  const [search, setSearch] = useState("");

  // Filter options by search keyword
  const filteredOptions = options.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative">
      <label className="text-4xl font-bold">{label}</label>
      <div
        onClick={() => setShow((s) => !s)}
        className="p-2 mt-1 w-full border bg-black text-xl cursor-pointer select-none"
      >
        {value || "(all)"}
      </div>
      {show && (
        <div className="absolute z-50 w-full bg-[#181818] border-4 mt-1">
          <input
            className="w-full p-2 text-lg bg-black text-white"
            autoFocus
            placeholder="Type to search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="max-h-52 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`p-2 cursor-pointer hover:bg-yellow-400 hover:text-black ${
                value === "" ? "bg-yellow-400 text-black" : ""
              }`}
              onClick={() => {
                onChange("");
                setShow(false);
                setSearch("");
              }}
            >
              (all)
            </div>
            {filteredOptions.map((v) => (
              <div
                key={v}
                className={`p-2 cursor-pointer hover:bg-yellow-400 hover:text-black ${
                  value === v ? "bg-yellow-400 text-black" : ""
                }`}
                onClick={() => {
                  onChange(v);
                  setShow(false);
                  setSearch("");
                }}
              >
                {v}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
