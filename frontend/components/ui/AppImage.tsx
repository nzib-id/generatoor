import React, { forwardRef, useMemo } from "react";
import Image, { ImageProps } from "next/image";

/**
 * AppImage
 * Wrapper around next/image for backend-served images.
 *
 * Behaviour:
 * - By default: flexible (100% width, auto height). Uses dummy width/height to satisfy Next.js.
 * - If `fill` is true: follows Next.js fill rules (parent must be relative + have size/aspect).
 */

export interface AppImageProps extends Omit<ImageProps, "src" | "alt"> {
  /** alt is required */
  alt: string;
  /** relative or absolute path. If absolute (http/https/data/blob), used as-is */
  path: string;
  /** base URL of your backend (default: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000") */
  baseUrl?: string;
  /** CSS object-fit via className helper: "contain" | "cover" | "none" */
  fit?: "contain" | "cover" | "none";
  /** add default hover scale effect */
  hoverScale?: boolean;
  /** add default white background */
  bgWhite?: boolean;
  /** add default thin border */
  bordered?: boolean;
  /** rounded radius token (e.g., "md", "lg", "xl", "2xl", "full") */
  rounded?: string;
  /** pixel-art rendering for crisp upscales */
  pixelated?: boolean;
}

function isAbsolute(u: string) {
  return (
    /^(https?:)?\/\//.test(u) || u.startsWith("data:") || u.startsWith("blob:")
  );
}

function joinUrl(base: string, path: string) {
  if (!base) return path;
  const a = base.endsWith("/") ? base.slice(0, -1) : base;
  const b = path.startsWith("/") ? path : `/${path}`;
  return `${a}${b}`;
}

const AppImage = forwardRef<HTMLImageElement, AppImageProps>(
  (
    {
      alt,
      path,
      baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
      fill,
      width,
      height,
      sizes,
      quality,
      priority,
      placeholder,
      blurDataURL,
      className = "",
      style,
      fit = "contain",
      hoverScale = true,
      bgWhite = true,
      bordered = true,
      rounded,
      pixelated = false,
      unoptimized = true,
      ...rest
    },
    _ref
  ) => {
    const finalSrc = useMemo(() => {
      if (isAbsolute(path)) return path;
      return joinUrl(baseUrl, path);
    }, [path, baseUrl]);

    const fitClass =
      fit === "cover"
        ? "object-cover"
        : fit === "none"
        ? "object-none"
        : "object-contain";

    const extra = [
      bgWhite ? "bg-white" : "",
      bordered ? "border" : "",
      hoverScale
        ? "transition-all ease-in-out hover:scale-90 hover:bg-gray-200"
        : "",
      rounded ? `rounded-${rounded}` : "",
      pixelated ? "[image-rendering:pixelated]" : "",
      fitClass,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    // If fill, follow Next.js rules; else fallback responsive with dummy width/height
    const imageProps: ImageProps = fill
      ? {
          src: finalSrc,
          alt,
          fill,
          sizes,
          quality,
          priority,
          placeholder,
          blurDataURL,
          className: extra,
          style,
          unoptimized,
          ...rest,
        }
      : {
          src: finalSrc,
          alt,
          width: width ?? 1,
          height: height ?? 1,
          sizes,
          quality,
          priority,
          placeholder,
          blurDataURL,
          className: `w-full h-auto ${extra}`,
          style: { width: "100%", height: "auto", ...style },
          unoptimized,
          ...rest,
        };

    return <Image {...imageProps} />;
  }
);

AppImage.displayName = "AppImage";

export default AppImage;
