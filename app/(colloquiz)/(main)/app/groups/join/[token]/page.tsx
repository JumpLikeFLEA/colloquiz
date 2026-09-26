import { GroupJoin } from "./GroupJoin";

export default async function GroupJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <GroupJoin token={token} />;
}
