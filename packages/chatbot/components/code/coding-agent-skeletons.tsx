"use client";

import {
  ArrowLeft,
  ArrowUp,
  Edit,
  FolderTree,
  Paperclip,
  Puzzle,
  WandSparkles,
} from "lucide-react";
import { AgentConversation } from "./agent-conversation";
import { Header } from "@/components/layout/header/header";
import { Logo } from "@/components/layout/header/logo";
import { ThemeToggle } from "@/components/layout/header/theme-toggle";
import { ModelPickerLoading } from "@/components/chat/model-picker";
import { Textarea } from "@/components/chat/textarea";
import { ChatControl } from "@/components/chat/control";
import { Button } from "@/components/ui/button";
import { Main } from "@/components/ui/main";

const noop = () => {};

/**
 * Fallbacks for the coding agent's `loading.tsx` files.
 *
 * Built from the same components as the real views rather than from skeleton
 * boxes, so the frame the user sees here is the frame that stays: the header,
 * the conversation panel and the composer are already in their final position
 * and only their contents fill in. Reusing the real controls in their disabled
 * state rather than copying their markup is what keeps it that way — a
 * divergence would show up as the layout shifting the moment data arrives.
 *
 * Header actions are inert and unannounced: a `loading.tsx` receives no route
 * params, so there is no session to act on yet.
 */

/** Icon button placeholder that holds a header action's exact footprint. */
const InertHeaderAction: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Button variant="icon" size="icon" type="button" disabled aria-hidden>
    {children}
  </Button>
);

/**
 * Empty items render the "Coding Agent" overview — the same thing a session
 * with no messages shows, so arriving at one is seamless.
 */
const EmptyConversation: React.FC = () => (
  <AgentConversation items={[]} isRunning={false} status={{ kind: "idle" }} />
);

/** Session page: header actions, model picker, conversation and composer. */
export const AgentCodeChatSkeleton: React.FC = () => (
  <>
    <Header.Container>
      <Header.Left>
        <Logo />
        <InertHeaderAction>
          <Edit size={18} />
        </InertHeaderAction>
        <InertHeaderAction>
          <FolderTree size={18} />
        </InertHeaderAction>
        <ModelPickerLoading />
      </Header.Left>
      <Header.Right>
        <ThemeToggle />
      </Header.Right>
    </Header.Container>
    <Main>
      <div
        data-testid="agent-code-chat-skeleton"
        className="flex flex-col relative h-full pt-16"
      >
        <EmptyConversation />
        <div className="bg-(--background) w-full max-w-5xl mx-auto pb-4 px-4 relative">
          <div className="relative w-full">
            {/*
             * Disabled, not merely loading: this composer has nowhere to put
             * what you type — the real page mounts its own and anything typed
             * here would vanish with it.
             */}
            <Textarea
              input=""
              onChangeInput={noop}
              isLoading
              disabled
              placeholder="Ask the coding agent..."
            />
            <div className="absolute left-3 bottom-2 flex items-center space-x-2">
              {/*
               * No reasoning control: with no model resolved the real page has
               * no levels to offer either, and renders nothing in this slot.
               */}
              <ChatControl Icon={Paperclip} disabled aria-hidden />
              <ChatControl Icon={Puzzle} disabled aria-hidden />
            </div>
            <div className="absolute right-3 bottom-2 flex items-center space-x-2">
              <ChatControl Icon={WandSparkles} disabled aria-hidden />
              <ChatControl Icon={ArrowUp} isLoading disabled aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </Main>
  </>
);

/** Subagent view: same conversation frame, no composer — it is read-only. */
export const SubagentSessionSkeleton: React.FC = () => (
  <>
    <Header.Container>
      <Header.Left>
        <Logo />
        <InertHeaderAction>
          <ArrowLeft size={18} />
        </InertHeaderAction>
      </Header.Left>
      <Header.Right>
        <ThemeToggle />
      </Header.Right>
    </Header.Container>
    <Main>
      <div
        data-testid="subagent-session-skeleton"
        className="flex flex-col relative h-full pt-16"
      >
        <EmptyConversation />
      </div>
    </Main>
  </>
);

/**
 * File browser: only the header is known ahead of time. The tree and the file
 * pane load their own contents, so the body stays empty rather than guessing
 * at a shape that would shift.
 */
export const FileBrowserSkeleton: React.FC = () => (
  <>
    <Header.Container>
      <Header.Left>
        <Logo />
        <InertHeaderAction>
          <ArrowLeft size={18} />
        </InertHeaderAction>
      </Header.Left>
      <Header.Right>
        <ThemeToggle />
      </Header.Right>
    </Header.Container>
    <Main>
      <div data-testid="file-browser-skeleton" className="h-full pt-16" />
    </Main>
  </>
);
