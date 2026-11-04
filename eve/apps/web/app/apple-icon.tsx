import { ImageResponse } from "next/og";
import { MARK_CELLS, MARK_LAST_STEP } from "@/components/brand/mark-geometry";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

// The product's path-grid mark on the site's light ground, in the colours of site/public/brand/mark.svg.
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#fafafa",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <svg height={112} viewBox="0 0 28 28" width={112}>
        {MARK_CELLS.map(({ x, y, step }) =>
          step >= 0 ? (
            <rect fill={step === MARK_LAST_STEP ? "#ed4423" : "#0f0f0f"} height={8} key={`${x},${y}`} width={8} x={x} y={y} />
          ) : (
            <rect fill="none" height={7} key={`${x},${y}`} stroke="#9e9e9e" strokeWidth={1} width={7} x={x + 0.5} y={y + 0.5} />
          ),
        )}
      </svg>
    </div>,
    size,
  );
}
