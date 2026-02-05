"use client";

import React, { useState, useEffect } from "react";
import { Copy, Trash2, Key } from "lucide-react";
import { toast } from "sonner";
import {
  listApiKeys,
  createApiKey,
  revokeApiKey,
} from "@/lib/features/api-keys/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const APIKeysManager = () => {
  const [keys, setKeys] = useState<
    { id: string; name: string | null; key: string; createdAt: Date }[]
  >([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadKeys();
  }, []);

  async function loadKeys() {
    setIsLoading(true);
    try {
      const data = await listApiKeys();
      setKeys(data);
    } catch {
      toast.error("Failed to load keys");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    try {
      await createApiKey(newKeyName);
      setNewKeyName("");
      loadKeys();
      toast.success("API Key created");
    } catch {
      toast.error("Failed to create key");
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm("Are you sure?")) return;
    try {
      await revokeApiKey(id);
      loadKeys();
      toast.success("API Key revoked");
    } catch {
      toast.error("Failed to revoke key");
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="flex-1 p-8 overflow-auto">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">API Keys</h1>
          <p className="text-gray-500 dark:text-gray-400">
            Create and manage API keys to access the MCP server.
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold mb-4">Create New Key</h2>
          <div className="flex gap-4">
            <Input
              placeholder="Key name (e.g. Claude Desktop)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              className="max-w-md"
            />
            <Button onClick={handleCreate} disabled={!newKeyName.trim()}>
              Generate Key
            </Button>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 dark:bg-zinc-800/50 text-gray-500 uppercase text-xs font-semibold">
              <tr>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">API Key</th>
                <th className="px-6 py-4">Created At</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-zinc-800">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    Loading keys...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-6 py-8 text-center text-gray-500"
                  >
                    No keys found. Create one to get started.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr
                    key={k.id}
                    className="hover:bg-gray-50 dark:hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 font-medium">
                      {k.name || "Untitled"}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-mono text-sm bg-gray-100 dark:bg-zinc-800 px-2 py-1 rounded w-fit">
                        <Key size={14} className="text-gray-400" />
                        <span className="truncate max-w-[200px]">{k.key}</span>
                        <button
                          onClick={() => copyToClipboard(k.key)}
                          className="hover:text-blue-500 transition-colors"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleRevoke(k.id)}
                        className="text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
