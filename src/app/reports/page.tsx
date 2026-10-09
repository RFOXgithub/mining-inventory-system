import { CoreWorkspace } from "@/components/core-workspace";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams, initial = Object.fromEntries(["category", "plantId", "from", "to"].flatMap(key => typeof params[key] === "string" ? [[key, params[key]]] : []));
  return <CoreWorkspace mode="reports" initial={initial} />;
}
