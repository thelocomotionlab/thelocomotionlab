// src/components/SplitBlock.jsx
import React from "react";

export default function SplitBlock({ left, right, reverse = false }) {
  return (
    <div
      className={`grid md:grid-cols-2 gap-6 items-center my-8 ${
        reverse ? "md:[&>*:first-child]:order-2" : ""
      }`}
    >
      <div className="prose max-w-none">{left}</div>
      <div className="flex justify-center">{right}</div>
    </div>
  );
}
