'use server';
import { generateText, Message } from 'ai';
import { cookies } from 'next/headers';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import { VisibilityType } from '@/components/visibility-selector';
import { myProvider } from '@/lib/ai/models';

export async function saveChatModelAsCookie(model: string) {
  const cookieStore = await cookies();
  cookieStore.set('chat-model', model, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: Message;
}): Promise<string> {
  try {
    const { text: title } = await generateText({
      model: myProvider.languageModel('title-model'),
      system: `
        - You will generate a short title based on the first message a user begins a conversation with.
        - Ensure it is not more than 80 characters long.
        - The title should be a summary of the user's message.
        - Do not use quotes or colons`,
      prompt: JSON.stringify(message),
    });
    return title.trim();
  } catch (error) {
    console.error('Failed to generate title from user message:', error);
    throw error;
  }
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  try {
    const [message] = await getMessageById({ id });
    if (!message) {
      throw new Error('Message not found');
    }
    await deleteMessagesByChatIdAfterTimestamp({
      chatId: message.chatId,
      timestamp: message.createdAt,
    });
  } catch (error) {
    console.error('Failed to delete trailing messages:', error);
    throw error;
  }
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  try {
    await updateChatVisiblityById({ chatId, visibility });
  } catch (error) {
    console.error('Failed to update chat visibility:', error);
    throw error;
  }
}
