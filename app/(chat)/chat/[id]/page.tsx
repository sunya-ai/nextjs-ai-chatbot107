import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { convertToUIMessages } from '@/lib/utils';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { CustomMessage, Message } from '@/lib/types'; // Import Message from lib/types

// Helper function to convert Message to CustomMessage
function toCustomMessage(msg: Message, chatId: string): CustomMessage {
  return {
    ...msg,
    chatId, // Add chatId to match CustomMessage
    sources: (msg as Partial<CustomMessage>).sources || undefined,
    metadata: (msg as Partial<CustomMessage>).metadata || undefined,
    reasoning: msg.reasoning || undefined, // Preserve reasoning as string | undefined, no array wrapping
  };
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id });
  if (!chat) {
    notFound();
  }
  const session = await auth();
  if (chat.visibility === 'private') {
    if (!session || !session.user) {
      return notFound();
    }
    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }
  const messagesFromDb = await getMessagesByChatId({
    id,
  });
  
  // Convert from DBMessage to CustomMessage directly, bypassing convertCustomToMessages
  const customMessages = convertToUIMessages(messagesFromDb);
  const uiMessages = customMessages; // Use CustomMessage[] directly, no need for convertCustomToMessages
  
  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');
  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          id={chat.id}
          initialMessages={uiMessages} // Now CustomMessage[]
          selectedChatModel={DEFAULT_CHAT_MODEL}
          selectedVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
        />
        <DataStreamHandler id={id} />
      </>
    );
  }
  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={uiMessages} // Now CustomMessage[]
        selectedChatModel={chatModelFromCookie.value}
        selectedVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
      />
      <DataStreamHandler id={id} />
    </>
  );
}
