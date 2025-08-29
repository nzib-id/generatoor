"use client";

import * as Slider from "@radix-ui/react-slider";
import { useState } from "react";

type Props = {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (val: number) => void;
};

export default function SliderInput({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: Props) {
  const [internal, setInternal] = useState<number>(value);

  const handleChange = (val: number[]) => {
    setInternal(val[0]);
    onChange(val[0]);
  };

  return (
    <Slider.Root
      className="relative flex items-center select-none touch-none w-full h-5"
      value={[internal]}
      min={min}
      max={max}
      step={step}
      onValueChange={handleChange}
    >
      <Slider.Track className="bg-gray-700 relative grow rounded-full h-[4px]">
        <Slider.Range className="absolute bg-[#FFDF0F] h-full" />
      </Slider.Track>
      <Slider.Thumb className="block w-4 h-4 bg-[#FFDF0F] active:bg-white rounded-full shadow cursor-pointer focus:outline-none" />
    </Slider.Root>
  );
}
