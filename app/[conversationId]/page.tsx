import ChatApp from "@/components/features/chat/page";

type ConversationPageProps = {
  params: Promise<{ conversationId: string }>;
};

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { conversationId } = await params;
  return <ChatApp routeConversationId={conversationId} />;
}
