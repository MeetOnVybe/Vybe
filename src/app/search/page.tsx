"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Search, UserRoundSearch } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PersonRow } from "@/components/PersonRow";
import { useVybeStore } from "@/store/useVybeStore";

export default function UserSearchPage() {
  const [query, setQuery] = useState("");
  const results = useVybeStore((state) => state.searchResults);
  const loading = useVybeStore((state) => state.searchingMembers);
  const search = useVybeStore((state) => state.searchMembers);
  const clear = useVybeStore((state) => state.clearMemberSearch);
  const hasMore = useVybeStore((state) => state.searchHasMore);
  const loadMore = useVybeStore((state) => state.loadMoreMembers);

  useEffect(() => {
    const timer = window.setTimeout(() => { if (query.trim().length >= 2) void search(query); else clear(); }, 320);
    return () => window.clearTimeout(timer);
  }, [query, search, clear]);

  return <AppShell>
    <PageHeader eyebrow="Private, bracket-safe search" title="Search users" description="Search partial usernames, display names, or interests. Results stay inside your age bracket, respect visibility, and exclude blocked relationships." />
    <section className="vybe-card rounded-[28px] p-5"><div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="vybe-input pl-12" placeholder="Search @username, name, or interest" aria-label="Search users" /></div><p className="mt-3 text-[10px] text-slate-600">Results are debounced, paginated by the backend, rate-limited, and never include dates of birth or exact locations.</p></section>
    <div className="mt-5 grid gap-3 lg:grid-cols-2">{results.map((user) => <PersonRow key={user.id} user={user} subtitle={`${user.compatibilityScore ?? 50}% VYBE compatibility • ${user.interests.slice(0, 2).join(" · ")}`} meta={user.lastSeen} action={{ label: "View", href: `/profile/${user.id}` }} />)}</div>
    {loading && <div className="mt-6 text-center"><LoaderCircle className="mx-auto animate-spin text-blue-500" /><p className="mt-2 text-xs text-slate-500">Searching eligible profiles…</p></div>}
    {!loading && hasMore && <div className="mt-6 text-center"><button onClick={() => void loadMore()} className="vybe-button rounded-2xl border border-blue-400/25 bg-blue-500/10 px-5 py-3 text-sm font-black text-blue-300 hover:bg-blue-500/15">Load more profiles</button></div>}
    {!loading && query.trim().length >= 2 && !results.length && <div className="vybe-card mt-5 grid min-h-72 place-items-center rounded-[30px] p-8 text-center"><div><UserRoundSearch className="mx-auto text-blue-500" size={34} /><h2 className="mt-4 text-xl font-black">No eligible profiles found</h2><p className="mt-2 text-sm text-slate-500">Try another username, display name, or interest.</p></div></div>}
  </AppShell>;
}
