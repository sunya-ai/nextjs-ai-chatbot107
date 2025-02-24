'use client';

import { useSession, signIn } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import FinanceEditor from '@/components/FinanceEditor';
import { MDXProvider } from '@mdx-js/react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Chat } from '@/components/chat';
import { useChat } from 'ai/react';
import { Message } from 'ai'; // Import Message from ai directly
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
import Image from 'next/image';

// Define local types for type safety
type SpreadsheetRow = [string, string, number]; // [Date, Deal Type, Amount]
type SpreadsheetData = SpreadsheetRow[] | null;
type ChartData = { name: string; solar: number; oil: number; geothermal: number }[];

interface LocalSessionUser {
  id: string; // Ensure this is required and non-null
}

export default function Home() {
  // Use useSession with required: true to enforce authentication
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

  // We'll create a stable ID for the chat that doesn't change on initial render
  const [stableChatId] = useState(() => generateUUID());
  
  // Set up initialMessages with correct types
  const initialWelcomeMessage: Message = {
    id: crypto.randomUUID(),
    role: 'assistant', // This must be one of: "user", "system", "assistant", or "data"
    content: 'Welcome! Upload a spreadsheet or ask me to update one with energy deal data (e.g., "Add a new solar deal for $1M on 2025-03-01").',
  };

  // Use Vercel AI SDK's useChat with safe session handling
  const { messages, input, handleInputChange, handleSubmit, setMessages } = useChat({
    api: '/api/chat',
    // Use a stable ID that doesn't change on initial render
    id: stableChatId,
    // Only include initial messages when authenticated
    initialMessages: status === 'authenticated' ? [initialWelcomeMessage] : []
  });

  // Define all handlers BEFORE any conditional returns
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

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    handleFileDrop(e.dataTransfer.files[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSpreadsheetDataUpdate = (data: SpreadsheetData, chatDocumentId: string) => {
    setSpreadsheetData(data);
    setSheetOpen(true);
    console.log('Spreadsheet updated from chat, document ID:', chatDocumentId);
  };

  const saveSpreadsheet = async () => {
    // Safe guard to prevent errors if session is not yet loaded
    if (!session?.user?.id) {
      console.error('User session or ID is undefined');
      return;
    }

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

    return Object.values(groupedData)
      .filter(item => item.name !== 'Unknown')
      .sort((a, b) => b.solar + b.oil + b.geothermal - (a.solar + a.oil + a.geothermal));
  };

  const renderChart = () => {
    const COLORS = ['#22c55e', '#3b82f6', '#ef4444'];
    const chartData = convertToChartData();
    
    // Return an empty div if no data
    if (!chartData || chartData.length === 0) {
      return <div className="flex items-center justify-center h-full">No chart data available</div>;
    }
    
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis dataKey="name" stroke="gray" className="text-xs" />
            <YAxis stroke="gray" className="text-xs" />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
            <Legend />
            <Line type="monotone" dataKey="solar" stroke="#22c55e" strokeWidth={2} name="Solar Deals" />
            <Line type="monotone" dataKey="oil" stroke="#3b82f6" strokeWidth={2} name="Oil Trends" />
            <Line type="monotone" dataKey="geothermal" stroke="#ef4444" strokeWidth={2} name="Geothermal Deals" />
          </LineChart>
        );
      case 'bar':
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis dataKey="name" stroke="gray" className="text-xs" />
            <YAxis stroke="gray" className="text-xs" />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
            <Legend />
            <Bar dataKey="solar" fill="#22c55e" name="Solar Deals" />
            <Bar dataKey="oil" fill="#3b82f6" name="Oil Trends" />
            <Bar dataKey="geothermal" fill="#ef4444" name="Geothermal Deals" />
          </BarChart>
        );
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={chartData.map(d => ({ name: d.name, value: d.solar + d.oil + d.geothermal }))}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              fill="#8884d8"
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
            <Legend />
          </PieChart>
        );
      default:
        return <div className="flex items-center justify-center h-full">Select a chart type</div>;
    }
  };

  // Now use a single return with conditional rendering
  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  // For debugging - you can remove this in production
  if (!session?.user?.id) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="bg-red-50 border border-red-200 rounded p-4 max-w-md">
          <h2 className="text-lg font-semibold text-red-700">Authentication Error</h2>
          <p className="text-sm text-red-600">User ID is undefined, cannot proceed.</p>
          <button 
            onClick={() => signIn()}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Sign In Again
          </button>
        </div>
      </div>
    );
  }

  // Main component render
  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={cn('min-h-screen bg-gray-100 dark:bg-gray-950 flex')}
    >
      <div className="w-1/2 p-2 bg-gray-50 dark:bg-gray-800">
        <MDXProvider components={{}}>
          <Chat
            id={documentId}
            initialMessages={messages}
            selectedChatModel={selectedChatModel}
            selectedVisibilityType="private"
            isReadonly={false}
            onSpreadsheetDataUpdate={handleSpreadsheetDataUpdate}
          />
        </MDXProvider>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Drag and drop PDFs or documents here to analyze energy data.</p>
      </div>
      <div className="w-1/2 p-2 flex flex-col gap-2">
        <div className="bg-gray-50 dark:bg-gray-800 p-2 border-b dark:border-gray-700">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Energy Research</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Analyze and visualize energy transactions.</p>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value as 'bar' | 'line' | 'pie')}
            className="mt-2 p-2 border rounded dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="bar">Bar Chart (Largest to Smallest)</option>
            <option value="line">Line Chart</option>
            <option value="pie">Pie Chart</option>
          </select>
          <Button
            onClick={saveSpreadsheet}
            disabled={isSaving}
            className={cn('mt-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700', { 'opacity-50 cursor-not-allowed': isSaving })}
          >
            {isSaving ? 'Saving...' : 'Save Spreadsheet'}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ResponsiveContainer width="100%" height={300}>
            {renderChart()}
          </ResponsiveContainer>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-full max-w-2xl bg-gray-50 dark:bg-gray-900">
            <SheetHeader>
              <SheetTitle className="text-2xl font-semibold text-gray-900 dark:text-white">Generated Spreadsheet</SheetTitle>
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
