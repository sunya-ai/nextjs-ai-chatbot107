'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useChat } from 'ai/react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Chat } from '@/components/chat';
import { FinanceEditor } from '@/components/FinanceEditor';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { signIn, signOut } from 'next-auth/react';
import { useTheme } from 'next-themes';
import { GeistSans } from 'geist/font/sans';
import { cn } from '@/lib/utils';
import { SparklesIcon } from '@/components/icons';

const font = GeistSans;

export default function Home() {
  const { data: session, status } = useSession();
  const { theme } = useTheme();
  const [file, setFile] = useState<File | null>(null);
  const [spreadsheetData, setSpreadsheetData] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedChatModel, setSelectedChatModel] = useState<string>('openai("gpt-4o")'); // Default to GPT-4o
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    setMessages,
    reload,
  } = useChat({
    api: '/api/chat',
    body: { selectedChatModel },
    onResponse: (response) => {
      if (response.status === 429) {
        alert('Too many requests. Please try again later.');
      }
    },
  });

  useEffect(() => {
    if (file) {
      handleFileUpload(file);
    }
  }, [file]);

  const handleFileUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('messages', JSON.stringify(messages));
    formData.append('selectedChatModel', selectedChatModel);
    formData.append('id', 'new-chat'); // Placeholder ID, adjust as needed

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
    } catch (error) {
      console.error('File upload error:', error);
    }
  };

  const handleSpreadsheetChange = (data: any[]) => {
    setSpreadsheetData(data);
    // Transform spreadsheet data for chart (example: assume first column is X, second is Y)
    const chartData = data.map(row => ({
      name: row[0], // Assuming first column is labels
      value: row[1] || 0, // Assuming second column is values
    }));
    setChartData(chartData);
  };

  return (
    <div
      className={cn(
        'min-h-screen bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-900 dark:to-zinc-800 text-zinc-900 dark:text-zinc-100',
        font.className,
      )}
    >
      <header className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SparklesIcon className="size-6" />
            Energy AI Chat
          </h1>
          {status === 'authenticated' ? (
            <Button
              variant="outline"
              onClick={() => signOut()}
              className="text-sm"
            >
              Sign Out
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={() => signIn()}
              className="text-sm"
            >
              Sign In
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 flex flex-col gap-8">
        {status === 'authenticated' ? (
          <>
            <div className="flex flex-col gap-4">
              <Label htmlFor="file-upload">Upload File (PDF, CSV, etc.)</Label>
              <div className="flex gap-2">
                <Input
                  id="file-upload"
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  accept=".pdf,.csv,.txt"
                  className="w-full"
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0"
                >
                  Browse
                </Button>
              </div>
            </div>

            <FinanceEditor
              onDataChange={handleSpreadsheetChange}
              className="mb-8"
            />

            {chartData.length > 0 && (
              <div className="mb-8">
                <h2 className="text-lg font-semibold mb-4">Energy Data Chart</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      type="category"
                      allowDuplicatedCategory={false}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={theme === 'dark' ? '#ffffff' : '#000000'}
                      activeDot={{ r: 8 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <Chat
              messages={messages}
              input={input}
              handleInputChange={handleInputChange}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              setMessages={setMessages}
              reload={reload}
              selectedChatModel={selectedChatModel}
              setSelectedChatModel={setSelectedChatModel}
            />
          </>
        ) : (
          <div className="text-center">
            <p className="text-lg">Please sign in to access the chat and tools.</p>
          </div>
        )}
      </main>

      <footer className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-center text-sm text-zinc-500 dark:text-zinc-400">
        © 2025 Energy AI Chat – Powered by Vercel and xAI
      </footer>
    </div>
  );
}
