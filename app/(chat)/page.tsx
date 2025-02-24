'use client';

import { useSession, signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import FinanceEditor from '@/components/FinanceEditor';
import { MDXProvider } from '@mdx-js/react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Chat } from '@/components/chat';
import { useChat } from 'ai/react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { useTheme } from 'next-themes';
import { cn, generateUUID } from '@/lib/utils';
import { ExtendedMessage } from '@/lib/types';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { parse, unparse } from 'papaparse';
import { createDocumentAction, updateDocumentAction } from '@/app/(chat)/actions';
import { put } from '@vercel/blob';
import { Button } from '@/components/ui/button';

// Define local types for safety
type SpreadsheetRow = [string, string, number]; // [Date, Deal Type, Amount]
type SpreadsheetData = SpreadsheetRow[] | null;
type ChartData = { name: string; solar: number; oil: number; geothermal: number }[];

export default function Home() {
  // Enforce authentication with useSession
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      signIn(); // Redirect to sign-in if no session
    },
  });
  const { theme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData>(null);
  const [documentId] = useState<string>(generateUUID());
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar');
  const [selectedChatModel] = useState<string>(DEFAULT_CHAT_MODEL);
  const [isSaving, setIsSaving] = useState(false);

  // UseChat with safe session handling
  const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
    api: '/api/chat',
    id: session?.user?.id || generateUUID(), // Fallback UUID if session.user.id is undefined
    initialMessages: status === 'authenticated' && session?.user
      ? [
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Welcome! Upload a spreadsheet or ask me to update one with energy deal data.',
          },
        ]
      : [],
  });

  // Handle loading state
  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // Functions remain largely unchanged; key fixes are in session and loading handling
  const handleSave = (newDocumentId: string) => {
    console.log('Saved document ID:', newDocumentId);
  };

  const handleDataChange = (newData: SpreadsheetData) => {
    setSpreadsheetData(newData);
  };

  const handleFileDrop = async (file: File) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('messages', JSON.stringify(messages));
    formData.append('selectedChatModel', selectedChatModel);
    formData.append('id', documentId);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      const newMessage: ExtendedMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: `Uploaded ${file.name}`,
        metadata: null,
      };
      setMessages(prev => [...prev, newMessage]);
    } catch (error) {
      console.error('File upload error:', error);
    }
  };

  const saveSpreadsheet = async () => {
    if (!session || !session.user) return;
    setIsSaving(true);
    try {
      const documentData = {
        title: `Finance Spreadsheet - ${new Date().toISOString().split('T')[0]}`,
        content: unparse(spreadsheetData || []),
        kind: 'sheet' as const,
        userId: session.user.id,
      };

      let newDocumentId: string;
      if (documentId) {
        await updateDocumentAction({ id: documentId, ...documentData });
        newDocumentId = documentId;
      } else {
        const result = await createDocumentAction(documentData);
        newDocumentId = result.id;
      }

      const blobData = new Blob([unparse(spreadsheetData || [])], { type: 'text/csv' });
      const fileName = `${newDocumentId}.csv`;
      const { url } = await put(fileName, blobData, { access: 'public' });
      console.log('Spreadsheet saved to Vercel Blob:', url);
      handleSave(newDocumentId);
    } catch (error) {
      console.error('Error in saveSpreadsheet:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const convertToChartData = () => {
    if (!spreadsheetData || !Array.isArray(spreadsheetData) || spreadsheetData.length < 2) return [];
    const headers = spreadsheetData[0];
    const dateIdx = headers.indexOf('Date');
    const dealTypeIdx = headers.indexOf('Deal Type');
    const amountIdx = headers.indexOf('Amount');

    const groupedData: Record<string, { name: string; solar: number; oil: number; geothermal: number }> = {};
    spreadsheetData.slice(1).forEach((row: SpreadsheetRow) => {
      const date = row[0] || 'Unknown';
      const dealType = row[1] || 'Unknown';
      const amount = parseFloat(row[2].toString()) || 0;

      if (!groupedData[date]) groupedData[date] = { name: date, solar: 0, oil: 0, geothermal: 0 };
      if (dealType === 'Solar M&A') groupedData[date].solar += amount;
      if (dealType === 'Oil Trends') groupedData[date].oil += amount;
      if (dealType === 'Geothermal Deals') groupedData[date].geothermal += amount;
    });

    return Object.values(groupedData).filter(item => item.name !== 'Unknown');
  };

  const chartData = convertToChartData();

  const renderChart = () => {
    const COLORS = ['#22c55e', '#3b82f6', '#ef4444'];
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="solar" stroke="#22c55e" name="Solar Deals" />
            <Line type="monotone" dataKey="oil" stroke="#3b82f6" name="Oil Trends" />
            <Line type="monotone" dataKey="geothermal" stroke="#ef4444" name="Geothermal Deals" />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="solar" fill="#22c55e" name="Solar Deals" />
            <Bar dataKey="oil" fill="#3b82f6" name="Oil Trends" />
            <Bar dataKey="geothermal" fill="#ef4444" name="Geothermal Deals" />
          </BarChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie data={chartData.map(d => ({ name: d.name, value: d.solar + d.oil + d.geothermal }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
              {chartData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        );
    }
  };

  return (
    <div className={cn('min-h-screen bg-gray-100 dark:bg-gray-950 flex')}>
      <div className="w-1/2 p-2 bg-gray-50 dark:bg-gray-800">
        <MDXProvider components={{}}>
          <Chat
            id={documentId}
            initialMessages={messages}
            selectedChatModel={selectedChatModel}
            selectedVisibilityType="private"
            isReadonly={false}
            onSpreadsheetDataUpdate={(data, chatDocumentId) => {
              setSpreadsheetData(data);
              setSheetOpen(true);
            }}
          />
        </MDXProvider>
      </div>
      <div className="w-1/2 p-2 flex flex-col gap-2">
        <div className="bg-gray-50 dark:bg-gray-800 p-2 border-b">
          <h1 className="text-xl font-semibold">Energy Research</h1>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as 'bar' | 'line' | 'pie')}
            className="mt-2 p-2 border rounded"
          >
            <option value="bar">Bar Chart</option>
            <option value="line">Line Chart</option>
            <option value="pie">Pie Chart</option>
          </select>
          <Button onClick={saveSpreadsheet} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Spreadsheet'}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ResponsiveContainer width="100%" height={300}>
            {renderChart()}
          </ResponsiveContainer>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full max-w-2xl">
            <SheetHeader>
              <SheetTitle>Generated Spreadsheet</SheetTitle>
            </SheetHeader>
            <FinanceEditor
              initialData={spreadsheetData || [['Date', 'Deal Type', 'Amount'], ['2025-02-23', 'Solar M&A', 1000000]]}
              documentId={documentId}
              onSave={handleSave}
              onDataChange={handleDataChange}
            />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
