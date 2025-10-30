"use client";
import { useState, useEffect } from "react";

type SliderInputProps = {
  value: number;
  onChange: (value: number) => void;
};

export default function SliderInput({ value, onChange }: SliderInputProps) {
  const clamp = (n: number) => Math.min(200, Math.max(1, Math.round(n || 1)));
  const [current, setCurrent] = useState(clamp(value));

  useEffect(() => {
    setCurrent(clamp(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrent(clamp(parseInt(e.target.value) || 1));
  };

  const handleCommit = () => {
    onChange(current);
  };

  return (
    <div className="flex flex-col items-center w-full gap-2">
      <input
        type="range"
        min={1}
        max={200}
        step={5}
        value={current}
        onChange={handleChange}
        onPointerUp={handleCommit}
        className="w-full h-3 rounded-lg appearance-none cursor-pointer accent-purple-500"
      />
      <div className="text-lg font-semibold text-purple-400">
        {current.toFixed(0)} <span className="text-sm opacity-70">weight</span>
      </div>
    </div>
  );
}
