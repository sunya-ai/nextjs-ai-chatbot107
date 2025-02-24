'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { useChat } from 'ai/react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FinanceEditor } from '@/components/FinanceEditor';
import { MDXProvider } from '@mdx-js/react';
import { PlusIcon } from '@heroicons/react/24/outline'; // Confirmed Heroicons v2 import
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
import { GeistSans } from 'geist/font/sans';
import { cn } from '@/lib/utils';

const font = GeistSans;

export default function Home() {
  const { data: session, status } = useSession();
  const { theme } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [spreadsheetData, setSpreadsheetData] = useState<any>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [chartType, setChartType] = useState<string>('bar'); // Default to bar chart for energy visualizations
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedChatModel, setSelectedChatModel] = useState<string>('openai("gpt-4o")'); // Default to Vercel AI Chatbot model

  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    data,
    setMessages,
    reload,
  } = useChat({
    api: '/api/chat',
    body: { userId: session?.user?.id, documentId, currentData: spreadsheetData, selectedChatModel },
    onResponse: (response) => {
      if (response.status === 429) {
        alert('Too many requests. Please try again later.');
      }
      const reader = response.body?.getReader();
      if (reader) {
        reader.read().then(({ done, value }) => {
          if (!done) {
            const text = new TextDecoder().decode(value);
            const jsonData = JSON.parse(text);
            if (jsonData.spreadsheetData) {
              setSpreadsheetData(jsonData.spreadsheetData);
              setDocumentId(jsonData.documentId);
              setSheetOpen(true);
              setChartData(convertToChartData(jsonData.spreadsheetData));
            } else if (jsonData.updatedData) {
              setSpreadsheetData(jsonData.updatedData);
              setDocumentId(jsonData.documentId);
              setSheetOpen(true);
              setChartData(convertToChartData(jsonData.updatedData));
            }
          }
        });
      }
    },
  });

  const handleSave = (newDocumentId: string) => {
    setDocumentId(newDocumentId);
  };

  const handleDataChange = (newData: any) => {
    setSpreadsheetData(newData);
    setChartData(convertToChartData(newData));
  };

  const handleFileDrop = async (file: File) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('messages', JSON.stringify(messages));
    formData.append('selectedChatModel', selectedChatModel);
    formData.append('id', documentId || 'new-chat'); // Use documentId or default

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) throw new Error('Upload failed');
      setMessages(prev => [...prev, { role: 'user', content: `Uploaded ${file.name}`, metadata: null }]); // Match route.ts Message type
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

  useEffect(() => {
    if (messages.length === 0 && session) {
      setMessages([{ role: 'assistant', content: 'Welcome! Ask about energy deals (e.g., solar M&A) or upload PDFs.', metadata: null }]); // Match route.ts Message type
    }
  }, [session, messages, setMessages]);

  const convertToChartData = (data: any) => {
    if (!data || !Array.isArray(data) || data.length < 2) return [];
    const headers = data[0];
    const dateIdx = headers.indexOf('Date');
    const dealTypeIdx = headers.indexOf('Deal Type');
    const amountIdx = headers.indexOf('Amount');

    const groupedData: Record<string, { name: string; solar: number; oil: number; geothermal: number }> = {};
    data.slice(1).forEach((row: any[]) => {
      const date = row[dateIdx] || 'Unknown';
      const dealType = row[dealTypeIdx] || 'Unknown';
      const amount = parseFloat(row[amountIdx]) || 0;

      if (!groupedData[date]) groupedData[date] = { name: date, solar: 0, oil: 0, geothermal: 0 };
      if (dealType === 'Solar M&A') groupedData[date].solar += amount;
      if (dealType === 'Oil Trends') groupedData[date].oil += amount;
      if (dealType === 'Geothermal Deals') groupedData[date].geothermal += amount;
    });

    const chartData = Object.values(groupedData).filter((item: any) => item.name !== 'Unknown');
    // Sort for bar charts (largest to smallest total value)
    const sortedData = chartData.sort((a: any, b: any) => {
      const totalA = a.solar + a.oil + a.geothermal;
      const totalB = b.solar + b.oil + b.geothermal;
      return totalB - totalA; // Descending order (largest to smallest)
    });
    return sortedData;
  };

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen p-2 flex flex-col items-center justify-center gap-4">
        <div className="text-center max-w-2xl">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">Energy Research Chat</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">Unleash powerful insights for energy transactions—solar, oil, geothermal, and more.</p>
          <Button
            aria-label="Sign in to start"
            onClick={() => signIn()}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded flex items-center gap-2 mx-auto hover:from-green-600 hover:to-emerald-700 text-lg shadow-lg transition-colors"
          >
            <PlusIcon className="h-5 w-5" />
            Get Started
          </Button>
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

  const renderChart = () => {
    const COLORS = ['#22c55e', '#3b82f6', '#ef4444'];
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
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
            <Legend />
          </PieChart>
        );
      default:
        return null;
    }
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className={cn(
        'min-h-screen bg-gray-100 dark:bg-gray-950 flex',
        font.className,
      )}
    >
      <div className="w-1/2 p-2 bg-gray-50 dark:bg-gray-800">
        <MDXProvider components={{}}>
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
        </MDXProvider>
        {isLoading && (
          <div className="mt-2 text-gray-500 dark:text-gray-400 text-sm">
            <div className="flex justify-center gap-1">
              <span className="w-2 h-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></span>
              <span className="w-2 h-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-2 h-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
            </div>
            <p>Analyzing energy deals…</p>
          </div>
        )}
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Drag and drop PDFs or documents here to analyze energy data.</p>
      </div>
      <div className="w-1/2 p-2 flex flex-col gap-2">
        <div className="bg-gray-50 dark:bg-gray-800 p-2 border-b dark:border-gray-700">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Energy Research</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Analyze and visualize energy transactions.</p>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            className="mt-2 p-2 border rounded dark:bg-gray-700 dark:text-white text-sm"
          >
            <option value="bar">Bar Chart (Largest to Smallest)</option>
            <option value="line">Line Chart</option>
            <option value="pie">Pie Chart</option>
          </select>
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
              initialData={spreadsheetData}
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
