export const ExecutionIndicator: React.FC = () => {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      Running...
    </div>
  );
};
