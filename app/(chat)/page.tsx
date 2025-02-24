// app/(chat)/page.tsx
'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect, startTransition, useMemo } from 'react'; // Added useMemo to imports
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import FinanceEditor from '@/components/FinanceEditor';
import { MDXProvider } from '@mdx-js/react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { Chat } from '@/components/chat';
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
import { parse, unparse } from 'papaparse'; // Ensure papaparse imports are present
import { createDocumentAction, updateDocumentAction } from '@/app/(chat)/actions'; // Ensure Server Actions are imported
import { put } from '@vercel/blob'; // Ensure Vercel Blob import is present
import { Button } from '@/components/ui/button'; // Ensure Button import is present

// Define types for better type safety
type SpreadsheetRow = [string, string, number]; // Example: [Date, Deal Type, Amount]
type SpreadsheetData = SpreadsheetRow[] | null;
type ChartData = { name: string; solar: number; oil: number; geothermal: number }[];

export default function Home() {
  const { data: session, status } = useSession();
  const { theme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData>(null); // Typed as SpreadsheetData
  const [documentId] = useState<string>(generateUUID());
  const [chartType, setChartType] = useState<'bar' | 'line' | 'pie'>('bar'); // Typed as union
  const [selectedChatModel] = useState<string>(DEFAULT_CHAT_MODEL);
  const [initialMessages, setInitialMessages] = useState<ExtendedMessage[]>([]);
  const [isSaving, setIsSaving] = useState(false);

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
    formData.append('messages', JSON.stringify(initialMessages));
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
      setInitialMessages(prev => [...prev, newMessage]);
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

  useEffect(() => {
    if (status === 'authenticated' && session?.user) {
      setInitialMessages([
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Welcome! Upload a spreadsheet or ask me to update one with energy deal data (e.g., "Add a new solar deal for $1M on 2025-03-01").',
          metadata: null,
        },
      ]);
    }
  }, [session, status]);

  const convertToChartData = useMemo<ChartData>(() => {
    if (!spreadsheetData || !Array.isArray(spreadsheetData) || spreadsheetData.length < 2) return [];
    const headers = spreadsheetData[0];
    const dateIdx = headers.indexOf('Date');
    const dealTypeIdx = headers.indexOf('Deal Type');
    const amountIdx = headers.indexOf('Amount');

    const groupedData: Record<string, { name: string; solar: number; oil: number; geothermal: number }> = {};
    spreadsheetData.slice(1).forEach((row: any[]) => {
      const date = row[dateIdx] || 'Unknown';
      const dealType = row[dealTypeIdx] || 'Unknown';
      const amount = parseFloat(row[amountIdx]) || 0;

      if (!groupedData[date]) groupedData[date] = { name: date, solar: 0, oil: 0, geothermal: 0 };
      if (dealType === 'Solar M&A') groupedData[date].solar += amount;
      if (dealType === 'Oil Trends') groupedData[date].oil += amount;
      if (dealType === 'Geothermal Deals') groupedData[date].geothermal += amount;
    });

    return Object.values(groupedData)
      .filter((item: any) => item.name !== 'Unknown')
      .sort((a: any, b: any) => b.solar + b.oil + b.geothermal - (a.solar + a.oil + a.geothermal));
  }, [spreadsheetData]);

  const renderChart = () => {
    const COLORS = ['#22c55e', '#3b82f6', '#ef4444'];
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={convertToChartData}>
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
          <BarChart data={convertToChartData}>
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
              data={convertToChartData.map(d => ({ name: d.name, value: d.solar + d.oil + d.geothermal }))}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={80}
              fill="#8884d8"
            >
              {convertToChartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
            <Legend />
          </PieChart>
        );
    }
  };

  if (status === 'loading') {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen p-2 flex flex-col items-center justify-center gap-4">
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Energy Research Chat</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">Unleash powerful insights for energy transactions—solar, oil, geothermal, and more.</p>
          <button
            aria-label="Sign in to start"
            onClick={() => signIn()} // Specify your provider here, e.g., signIn('github')
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded flex items-center gap-2 mx-auto hover:from-green-600 hover:to-emerald-700 text-lg shadow-lg transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Get Started
          </button>
        </div>
        <div className="flex gap-4 overflow-x-auto">
          {['Solar', 'Oil', 'Geothermal'].map(sector => (
            <div key={sector} className="min-w-[200px] p-2 bg-gray-50 dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-shadow">
              <img src={`/icon-${sector.toLowerCase()}.png`} alt={sector} className="h-12 w-12 mx-auto animate-shimmer" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mt-1">{sector} Insights</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Explore the latest deals and trends.</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const saveSpreadsheet = async () => {
    if (!session?.user?.id) return;

    setIsSaving(true);
    try {
      startTransition(() => {
        // Wrap the state update in startTransition for non-blocking behavior
        const documentData = {
          title: `Finance Spreadsheet - ${new Date().toISOString().split('T')[0]}`,
          content: unparse(spreadsheetData || []),
          kind: 'sheet' as const,
          userId: session.user.id,
        };

        let newDocumentId: string;
        if (documentId) {
          updateDocumentAction({ id: documentId, ...documentData }).then(() => {
            newDocumentId = documentId;
            // Save to Vercel Blob after updating the document
            const blobData = new Blob([unparse(spreadsheetData || [])], { type: 'text/csv' });
            const fileName = `${newDocumentId}.csv`;
            put(fileName, blobData, { access: 'public' }).then(({ url }) => {
              console.log('Spreadsheet saved to Vercel Blob:', url);
              handleSave(newDocumentId);
            }).catch(error => {
              console.error('Failed to save to Vercel Blob:', error);
              setIsSaving(false); // Ensure isSaving is reset on error
            });
          }).catch(error => {
            console.error('Failed to update document:', error);
            setIsSaving(false); // Ensure isSaving is reset on error
          });
        } else {
          createDocumentAction(documentData).then(result => {
            newDocumentId = result.id;
            // Save to Vercel Blob after creating the document
            const blobData = new Blob([unparse(spreadsheetData || [])], { type: 'text/csv' });
            const fileName = `${newDocumentId}.csv`;
            put(fileName, blobData, { access: 'public' }).then(({ url }) => {
              console.log('Spreadsheet saved to Vercel Blob:', url);
              handleSave(newDocumentId);
            }).catch(error => {
              console.error('Failed to save to Vercel Blob:', error);
              setIsSaving(false); // Ensure isSaving is reset on error
            });
          }).catch(error => {
            console.error('Failed to create document:', error);
            setIsSaving(false); // Ensure isSaving is reset on error
          });
        }
      });
    } catch (error) {
      console.error('Unexpected error in saveSpreadsheet:', error);
      setIsSaving(false); // Ensure isSaving is reset on error
    }
  };

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
            initialMessages={initialMessages}
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
            onClick={() => startTransition(saveSpreadsheet)} // Using startTransition for non-blocking save
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
