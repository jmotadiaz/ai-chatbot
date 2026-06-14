"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export interface SessionListProps {
  project: string;
  sessions: Array<{
    id: string;
    sessionId: string;
    label: string | null;
    updatedAt: Date;
  }>;
  onCreateSession: () => Promise<string>;
}

export const SessionList: React.FC<SessionListProps> = ({
  project,
  sessions,
  onCreateSession,
}) => {
  const router = useRouter();

  const handleCreate = async () => {
    const sessionId = await onCreateSession();
    router.push(`/agent/code/${encodeURIComponent(project)}/${sessionId}`);
  };

  return (
    <div className="p-4">
      <button
        onClick={handleCreate}
        className="mb-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg"
      >
        + New session
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sessions.map((session) => (
          <Link
            key={session.id}
            href={`/agent/code/${encodeURIComponent(project)}/${session.sessionId}`}
            className="block p-6 border rounded-lg hover:bg-accent transition-colors"
          >
            <h3 className="font-semibold">
              {session.label ?? session.sessionId}
            </h3>
            <p className="text-sm text-muted-foreground">
              {session.updatedAt.toLocaleString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
};
