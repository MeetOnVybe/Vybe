import Image from "next/image";
import { SimUser } from "@/types";

export function Avatar({
  user,
  size = "md",
  showStatus = true,
  imageSrc,
  alt,
}: {
  user?: SimUser;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  showStatus?: boolean;
  imageSrc?: string;
  alt?: string;
}) {
  const sizes = {
    sm: "h-10 w-10 rounded-xl",
    md: "h-12 w-12 rounded-2xl",
    lg: "h-16 w-16 rounded-[20px]",
    xl: "h-24 w-24 rounded-[28px]",
    "2xl": "h-32 w-32 rounded-[34px]",
  };
  const source = imageSrc ?? user?.avatar.image ?? "/avatars/avatar-wave.svg";
  const online = user?.online ?? true;

  return (
    <div className="relative shrink-0">
      <div className={`relative overflow-hidden border border-white/10 bg-[#09101b] shadow-[0_14px_40px_rgba(0,0,0,.35)] ring-1 ring-white/5 ${sizes[size]}`}>
        <Image src={source} alt={alt ?? user?.displayName ?? "Profile avatar"} fill sizes="128px" className="object-cover" unoptimized={source.startsWith("data:")} priority={size === "2xl"} />
      </div>
      {showStatus && (
        <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#070b13] ${online ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.7)]" : "bg-slate-500"}`} />
      )}
    </div>
  );
}
