"use client";

import { useSession, signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { Chat } from "@/components/chat";
import { useChat } from "ai/react";
import type { Message } from "ai";
import type { ExtendedMessage } from "@/lib/types";
import { cn, generateUUID } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import FinanceEditor from "@/components/FinanceEditor";
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
} from "recharts";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { MDXProvider } from "@mdx-js/react";
import { createDocumentAction, updateDocumentAction } from "@/app/(chat)/actions";
import { ErrorBoundary } from "react-error-boundary"; // Ensure this is installed
import { toast } from "sonner";

// Type for ErrorBoundary props
interface ErrorFallbackProps {
  error: Error; // Specify Error type from JavaScript/TypeScript
  resetErrorBoundary: () => void; // Function to reset the error boundary
}

// Fallback component for error states with explicit types
function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <h2 className="text-xl font-semibold mb-4">Something went wrong</h2>
      <pre className="text-sm bg-red-50 dark:bg-red-900/10 p-4 rounded-lg mb-4">{error.message}</pre>
      <Button onClick={resetErrorBoundary}>Try again</Button>
    </div>
  );
}

type SpreadsheetRow = [string, string, number];
type SpreadsheetData = SpreadsheetRow[] | null;
type ChartData = { name: string; solar: number; oil: number; geothermal: number }[];

export default function Home() {
  // Call all Hooks at the top level, unconditionally
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      signIn();
    },
  });

  const { theme } = useTheme();
  const [isClient, setIsClient] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [spreadsheetData, setSpreadsheetData] = useState<SpreadsheetData>(null);
  const [documentId] = useState<string>(generateUUID());
  const [chartType, setChartType] = useState<"bar" | "line" | "pie">("bar");
  const [isSaving, setIsSaving] = useState(false);

  const [stableChatId] = useState(() => generateUUID());
  const initialWelcomeMessage: Message = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: "Welcome! Upload a spreadsheet or ask me to update one with energy deal data (e.g., \"Add a new solar deal for $1M on 2025-03-01\").",
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  const { messages, input, handleInputChange, handleSubmit, setMessages, isLoading, append } = useChat({
    api: "/api/chat",
    id: stableChatId,
    initialMessages: isClient && session ? [initialWelcomeMessage] : [],
    onError: (error) => {
      console.error("useChat error:", error, error.stack, "Session:", session);
    },
    onResponse: (response) => {
      console.log("useChat response:", response, "Session:", session);
    },
  });

  console.log("Session status:", status, "Session data:", session);

  // Loading states (combine session, hydration, and session.user)
  if (status === "loading" || !session || !session.user || !isClient) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="size-8 animate-spin border-b-2 border-gray-900 dark:border-white" /> {/* Updated to use size shorthand */}
      </div>
    );
  }

  // File handling functions with improved error handling and type safety
  const handleFileDrop = async (file: File) => {
    if (!file || !session.user || !session.user.id) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("messages", JSON.stringify(messages));
      formData.append("selectedChatModel", 'google("gemini-2.0-flash")');
      formData.append("id", documentId);

      const response = await fetch("/api/chat", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: `Uploaded ${file.name}`,
        },
      ]);
    } catch (error) {
      console.error("File upload error:", error);
      toast.error("Failed to upload file");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFileDrop(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSpreadsheetDataUpdate = (data: SpreadsheetData, chatDocumentId: string) => {
    setSpreadsheetData(data);
    setSheetOpen(true);
    console.log("Spreadsheet updated from chat, document ID:", chatDocumentId);
  };

  const saveSpreadsheet = async () => {
    if (!session.user || !session.user.id) {
      console.error("User session or ID is undefined");
      return;
    }

    setIsSaving(true);
    try {
      const documentData = {
        title: `Finance Spreadsheet - ${new Date().toISOString().split("T")[0]}`,
        content: JSON.stringify(spreadsheetData || []),
        kind: "sheet" as const,
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

      console.log("Spreadsheet saved, document ID:", newDocumentId);
    } catch (error) {
      console.error("Error in saveSpreadsheet:", error);
      toast.error("Failed to save spreadsheet");
    } finally {
      setIsSaving(false);
    }
  };

  const convertToChartData = () => {
    if (!spreadsheetData || !Array.isArray(spreadsheetData) || spreadsheetData.length < 2) return [];
    const headers = spreadsheetData[0];
    const dateIdx = headers.indexOf("Date");
    const dealTypeIdx = headers.indexOf("Deal Type");
    const amountIdx = headers.indexOf("Amount");

    const groupedData: Record<string, { name: string; solar: number; oil: number; geothermal: number }> = {};
    spreadsheetData.slice(1).forEach((row: SpreadsheetRow) => {
      const date = row[0] || "Unknown";
      const dealType = row[1] || "Unknown";
      const amount = parseFloat(row[2]?.toString() || "0") || 0;

      if (!groupedData[date]) groupedData[date] = { name: date, solar: 0, oil: 0, geothermal: 0 };
      if (dealType === "Solar M&A") groupedData[date].solar += amount;
      if (dealType === "Oil Trends") groupedData[date].oil += amount;
      if (dealType === "Geothermal Deals") groupedData[date].geothermal += amount;
    });

    return Object.values(groupedData)
      .filter((item) => item.name !== "Unknown")
      .sort((a, b) => b.solar + b.oil + b.geothermal - (a.solar + a.oil + a.geothermal));
  };

  const renderChart = () => {
    const COLORS = ["#22c55e", "#3b82f6", "#ef4444"];
    const chartData = convertToChartData();

    if (!chartData || chartData.length === 0) {
      return <div className="flex items-center justify-center h-full">No chart data available</div>;
    }

    switch (chartType) {
      case "line":
        return (
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis dataKey="name" stroke="gray" className="text-xs" />
            <YAxis stroke="gray" className="text-xs" />
            <Tooltip contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.9)", border: "1px solid #e5e7eb", borderRadius: "4px" }} />
            <Legend />
            <Line type="monotone" dataKey="solar" stroke="#22c55e" strokeWidth={2} name="Solar Deals" />
            <Line type="monotone" dataKey="oil" stroke="#3b82f6" strokeWidth={2} name="Oil Trends" />
            <Line type="monotone" dataKey="geothermal" stroke="#ef4444" strokeWidth={2} name="Geothermal Deals" />
          </LineChart>
        );
      case "bar":
        return (
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-gray-300 dark:stroke-gray-700" />
            <XAxis dataKey="name" stroke="gray" className="text-xs" />
            <YAxis stroke="gray" className="text-xs" />
            <Tooltip contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.9)", border: "1px solid #e5e7eb", borderRadius: "4px" }} />
            <Legend />
            <Bar dataKey="solar" fill="#22c55e" name="Solar Deals" />
            <Bar dataKey="oil" fill="#3b82f6" name="Oil Trends" />
            <Bar dataKey="geothermal" fill="#ef4444" name="Geothermal Deals" />
          </BarChart>
        );
      case "pie":
        return (
          <PieChart>
            <Pie
              data={chartData.map((d) => ({ name: d.name, value: d.solar + d.oil + d.geothermal }))}
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
            <Tooltip contentStyle={{ backgroundColor: "rgba(255, 255, 255, 0.9)", border: "1px solid #e5e7eb", borderRadius: "4px" }} />
            <Legend />
          </PieChart>
        );
      default:
        return <div className="flex items-center justify-center h-full">Select a chart type</div>;
    }
  };

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn("min-h-screen bg-gray-100 dark:bg-gray-950 flex")}
      >
        <div className="w-1/2 p-2 bg-gray-50 dark:bg-gray-800">
          <MDXProvider components={{}}>
            <ErrorBoundary FallbackComponent={ErrorFallback}>
              <Chat
                id={documentId}
                initialMessages={messages}
                selectedChatModel={'google("gemini-2.0-flash")'}
                selectedVisibilityType="private"
                isReadonly={false}
                onSpreadsheetDataUpdate={handleSpreadsheetDataUpdate}
              />
            </ErrorBoundary>
          </MDXProvider>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2">Drag and drop PDFs or documents here to analyze energy data.</p>
        </div>
        <div className="w-1/2 p-2 flex flex-col gap-2">
          <div className="bg-gray-50 dark:bg-gray-800 p-2 border-b dark:border-gray-700">
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Energy Research</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Analyze and visualize energy transactions.</p>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as "bar" | "line" | "pie")}
              className="mt-2 p-2 border rounded dark:bg-gray-700 dark:text-white text-sm"
            >
              <option value="bar">Bar Chart (Largest to Smallest)</option>
              <option value="line">Line Chart</option>
              <option value="pie">Pie Chart</option>
            </select>
            <Button
              onClick={saveSpreadsheet}
              disabled={isSaving}
              className={cn(
                "mt-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700",
                { "opacity-50 cursor-not-allowed": isSaving }
              )}
            >
              {isSaving ? "Saving..." : "Save Spreadsheet"}
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
                initialData={spreadsheetData || [["Date", "Deal Type", "Amount"], ["2025-02-23", "Solar M&A", 1000000]]}
                documentId={documentId}
                onSave={() => console.log("Saved spreadsheet")}
                onDataChange={setSpreadsheetData}
              />
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </ErrorBoundary>
  );
}
