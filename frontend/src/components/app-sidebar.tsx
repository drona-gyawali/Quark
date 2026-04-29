import {
  Settings,
  Plus,
  History,
  MessageSquareDashed as MessageSquare,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import { getSession, deleteSession } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";
import { useCreateSession } from "@/hooks/use-create-session";
import { createIds } from "@/lib/utils";
import { Loader2, Trash2, MoreVertical } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppSidebar() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    data: historyItems,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["chat-history"],
    queryFn: getSession,
  });

  const { mutate, isPending } = useCreateSession();

  const { mutate: _deleteSession } = useMutation({
    mutationFn: async (sessionId: string) => {
      const data = await deleteSession(sessionId);
      if (!data) {
        throw new Error(`Session unable to deleted`);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat-history"] });
    },
    onError: () => {
      navigate(`/something-went-wrong`);
    },
  });
  const handleDeleteSession = (sessionId: string) => {
    _deleteSession(sessionId);
  };

  const handleSession = () => {
    mutate(createIds());
  };

  return (
    <>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border pb-4">
          <div className="p-4 font-bold text-xl tracking-tight text-primary">
            <Link to={"/"}>Quark Inc.</Link>
          </div>

          <div className="px-2 space-y-2">
            <Button
              variant="default"
              onClick={handleSession}
              disabled={isPending || !historyItems || historyItems?.length == 0}
              className="w-full justify-start gap-2 shadow-sm cursor-pointer"
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              <span>{isPending ? "Creating..." : "New Chat"}</span>
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2 px-2">
              <History className="h-3 w-3" />
              <span>Recent Conversations</span>
            </SidebarGroupLabel>

            <SidebarGroupContent className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-sidebar-border">
              <SidebarMenu>
                {isLoading && (
                  <div className="p-4 text-xs text-muted-foreground animate-pulse">
                    Loading history...
                  </div>
                )}

                {error && (
                  <div className="p-4 text-xs text-destructive">
                    Failed to load history
                  </div>
                )}

                {!isLoading &&
                  historyItems?.map((chat: any) => (
                    <SidebarMenuItem key={chat.id}>
                      <SidebarMenuButton
                        asChild
                        className="hover:bg-sidebar-accent transition-colors"
                      >
                        <Link
                          to={`/c/${chat.id}`}
                          className="flex flex-col items-start py-2 h-auto"
                        >
                          <div className="flex items-center gap-2 w-full">
                            <MessageSquare className="h-4 w-4 shrink-0 opacity-70" />
                            <span className="truncate font-medium text-sm">
                              {chat.label || "Untitled Chat"}
                            </span>
                          </div>
                          <span className="text-[10px] text-muted-foreground ml-6">
                            {formatDistanceToNow(new Date(chat.created_at), {
                              addSuffix: true,
                            })}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <SidebarMenuAction className=" cursor-pointer hover:bg-sidebar-accent focus-visible:ring-0 focus-visible:ring-offset-0">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">More</span>
                          </SidebarMenuAction>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">
                          <DropdownMenuItem
                            onClick={() => handleDeleteSession(chat.id)}
                            className="text-destructive focus:text-destructive cursor-pointer"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            <span>Delete Chat</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <Link to="/settings">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
