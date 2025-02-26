import { z } from 'zod';
import { Session } from 'next-auth';
import { DataStreamWriter, streamObject, tool } from 'ai';
import { getDocumentById, saveSuggestions } from '@/lib/db/queries';
import { Suggestion } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { myProvider } from '../models';

interface RequestSuggestionsProps {
  session: Session;
  dataStream: DataStreamWriter;
}

export const requestSuggestions = ({
  session,
  dataStream,
}: RequestSuggestionsProps) =>
  tool({
    description: 'Request suggestions for a document',
    parameters: z.object({
      documentId: z
        .string()
        .describe('The ID of the document to request edits'),
    }),
    execute: async ({ documentId }) => {
      console.log('[tools] Requesting suggestions for document ID:', documentId);
      const document = await getDocumentById({ id: documentId });

      if (!document || !document.content) {
        console.error('[tools] Document not found for ID:', documentId);
        return {
          error: 'Document not found',
        };
      }

      const suggestions: Array<
        Omit<Suggestion, 'userId' | 'createdAt' | 'documentCreatedAt'>
      > = [];

      try {
        const { elementStream } = streamObject({
          model: myProvider.languageModel('artifact-model'),
          system:
            'You are a help writing assistant. Given a piece of writing, please offer suggestions to improve the piece of writing and describe the change. It is very important for the edits to contain full sentences instead of just words. Max 5 suggestions.',
          prompt: document.content,
          output: 'array',
          schema: z.object({
            originalSentence: z.string().describe('The original sentence'),
            suggestedSentence: z.string().describe('The suggested sentence'),
            description: z.string().describe('The description of the suggestion'),
          }),
        });

        for await (const element of elementStream) {
          const suggestion = {
            originalText: element.originalSentence,
            suggestedText: element.suggestedSentence,
            description: element.description,
            id: generateUUID(),
            documentId: documentId,
            isResolved: false,
          };

          console.log('[tools] Streaming suggestion for document ID:', documentId, 'suggestion ID:', suggestion.id);
          dataStream.writeData({
            type: 'suggestion',
            content: suggestion,
          });

          suggestions.push(suggestion);
        }

        if (session.user?.id) {
          const userId = session.user.id;
          console.log('[tools] Saving suggestions to DB for user ID:', userId, 'document ID:', documentId);
          await saveSuggestions({
            suggestions: suggestions.map((suggestion) => ({
              ...suggestion,
              userId,
              createdAt: new Date(),
              documentCreatedAt: document.createdAt,
            })),
          });
        }

        console.log('[tools] Suggestions request completed for document ID:', documentId);
        return {
          id: documentId,
          title: document.title,
          kind: document.kind as ArtifactKind,
          message: 'Suggestions have been added to the document',
        };
      } catch (error) {
        console.error('[tools] Error requesting suggestions for document ID:', documentId, error instanceof Error ? error.message : String(error));
        return { error: 'Failed to request suggestions' };
      }
    },
  });
