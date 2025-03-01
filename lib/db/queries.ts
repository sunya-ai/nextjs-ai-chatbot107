import 'server-only';

import { genSaltSync, hashSync } from 'bcrypt-ts';
import { and, asc, desc, eq, gt, gte, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/vercel-postgres';
import { sql } from '@vercel/postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  type Message,
  message,
  vote,
} from './schema';
import { ArtifactKind } from '@/components/artifact';

// Use Vercel's Edge-compatible Postgres client
const db = drizzle(sql);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    console.log('[db] Fetching user with email:', email);
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error('[db] Failed to get user from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function createUser(email: string, password: string) {
  const salt = genSaltSync(10);
  const hash = hashSync(password, salt);

  try {
    console.log('[db] Creating user with email:', email);
    return await db.insert(user).values({ email, password: hash });
  } catch (error) {
    console.error('[db] Failed to create user in database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function saveChat({
  id,
  userId,
  title,
}: {
  id: string;
  userId: string;
  title: string;
}) {
  try {
    console.log('[db] Saving chat with ID:', id);
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
    });
  } catch (error) {
    console.error('[db] Failed to save chat in database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    console.log('[db] Deleting votes and messages for chat ID:', id);
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));

    console.log('[db] Deleting chat with ID:', id);
    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error('[db] Failed to delete chat by id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }) {
  try {
    console.log('[db] Fetching chats for user ID:', id);
    return await db
      .select()
      .from(chat)
      .where(eq(chat.userId, id))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error('[db] Failed to get chats by user from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    console.log('[db] Fetching chat with ID:', id);
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error('[db] Failed to get chat by id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function saveMessages({ messages }: { messages: Array<Message> }) {
  try {
    console.log('[db] Saving messages, count:', messages.length);
    return await db.insert(message).values(messages);
  } catch (error) {
    console.error('[db] Failed to save messages in database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    console.log('[db] Fetching messages for chat ID:', id);
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    console.error('[db] Failed to get messages by chat id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    console.log('[db] Voting on message ID:', messageId, 'type:', type);
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      console.log('[db] Updating existing vote for message ID:', messageId);
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    console.log('[db] Inserting new vote for message ID:', messageId);
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    console.error('[db] Failed to vote on message in database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    console.log('[db] Fetching votes for chat ID:', id);
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    console.error('[db] Failed to get votes by chat id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
  fileUrl,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
  fileUrl?: string;
}) {
  try {
    console.log('[db] Saving document with ID:', id, 'kind:', kind, 'fileUrl:', fileUrl);
    return await db.insert(document).values({
      id,
      title,
      kind,
      content,
      fileUrl,
      userId,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('[db] Failed to save document in database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    console.log('[db] Fetching documents for ID:', id);
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    console.error('[db] Failed to get documents by id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    console.log('[db] Fetching document with ID:', id);
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    console.error('[db] Failed to get document by id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    console.log('[db] Deleting suggestions for document ID:', id, 'after timestamp:', timestamp);
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    console.log('[db] Deleting documents for ID:', id, 'after timestamp:', timestamp);
    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)));
  } catch (error) {
    console.error('[db] Failed to delete documents by id after timestamp from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    console.log('[db] Saving suggestions, count:', suggestions.length);
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    console.error('[db] Failed to save suggestions in database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    console.log('[db] Fetching suggestions for document ID:', documentId);
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    console.error('[db] Failed to get suggestions by document id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    console.log('[db] Fetching message with ID:', id);
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    console.error('[db] Failed to get message by id from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    console.log('[db] Fetching messages to delete for chat ID:', chatId, 'after timestamp:', timestamp);
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      console.log('[db] Deleting votes for message IDs:', messageIds);
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      console.log('[db] Deleting messages for chat ID:', chatId, 'with IDs:', messageIds);
      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
    console.log('[db] No messages to delete for chat ID:', chatId);
  } catch (error) {
    console.error('[db] Failed to delete messages by chat id after timestamp from database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    console.log('[db] Updating chat visibility for ID:', chatId, 'to:', visibility);
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    console.error('[db] Failed to update chat visibility in database:', error instanceof Error ? error.message : String(error));
    throw error;
  }
}
