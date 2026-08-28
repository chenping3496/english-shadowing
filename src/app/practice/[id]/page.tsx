import PracticeClient from "@/components/PracticeClient";

export default async function PracticePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PracticeClient materialId={id} />;
}
