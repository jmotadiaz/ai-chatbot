"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  sessionId?: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

async function sendErrorTrace(sessionId: string | undefined, eventName: string, error: unknown) {
  try {
    const errObj = error as Record<string, unknown> | null | undefined;
    const payload = {
      message: typeof errObj?.message === "string" ? errObj.message : String(error ?? ""),
      stack: typeof errObj?.stack === "string" ? errObj.stack : null,
      timestamp: new Date().toISOString(),
    };

    await fetch("/api/agent/code/trace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: crypto.randomUUID(),
        sessionId,
        eventName,
        level: "error",
        payload,
      }),
    });
  } catch (e) {
    console.error("Failed to send client error trace to backend:", e);
  }
}

export class ClientErrorWrapper extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  private handleError = (event: ErrorEvent) => {
    sendErrorTrace(this.props.sessionId, "client.unhandled_error", event.error || { message: event.message });
  };

  private handleRejection = (event: PromiseRejectionEvent) => {
    sendErrorTrace(this.props.sessionId, "client.unhandled_rejection", event.reason || { message: "Unhandled promise rejection" });
  };

  public componentDidMount() {
    window.addEventListener("error", this.handleError);
    window.addEventListener("unhandledrejection", this.handleRejection);
  }

  public componentWillUnmount() {
    window.removeEventListener("error", this.handleError);
    window.removeEventListener("unhandledrejection", this.handleRejection);
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    sendErrorTrace(
      this.props.sessionId,
      "client.react_error",
      {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      }
    );
  }

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    // Optional: reload page to clear all corrupted state
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[500px] w-full p-6 text-center bg-background text-foreground">
          <div className="max-w-md w-full p-8 rounded-3xl border border-destructive/20 bg-destructive/5 backdrop-blur-md shadow-2xl flex flex-col items-center">
            <div className="p-4 bg-destructive/10 text-destructive rounded-full mb-6">
              <AlertTriangle className="size-10 animate-pulse" />
            </div>
            
            <h2 className="text-2xl font-bold mb-3 tracking-tight">Unhandled Runtime Error</h2>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              An unexpected error occurred in the coding agent workspace. The trace has been automatically reported to the backend.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 w-full mb-6 justify-center">
              <Button
                variant="destructive"
                onClick={this.handleReset}
                className="rounded-xl flex items-center justify-center gap-2 font-medium px-5"
              >
                <RefreshCw className="size-4" />
                Reload Agent
              </Button>
            </div>

            {this.state.error && (
              <div className="w-full border-t border-border/40 pt-4 text-left">
                <button
                  onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                  className="flex items-center justify-between w-full text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  <span>ERROR DETAILS</span>
                  {this.state.showDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>

                {this.state.showDetails && (
                  <div className="mt-2 text-xs font-mono bg-secondary/80 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-48 text-destructive-foreground dark:text-red-300">
                    <p className="font-bold mb-1">{this.state.error.name}: {this.state.error.message}</p>
                    {this.state.error.stack && (
                      <p className="opacity-80 text-[10px] leading-4 mt-2">
                        {this.state.error.stack}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
