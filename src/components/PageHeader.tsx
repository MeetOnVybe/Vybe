import { Sparkles } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.24em] text-blue-400"><Sparkles size={12} /> {eyebrow}</p>}
        <h1 className="text-3xl font-black tracking-[-.035em] sm:text-[2.65rem] sm:leading-[1.04]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-[15px]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
