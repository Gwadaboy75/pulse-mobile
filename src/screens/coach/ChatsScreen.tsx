// The coach's chats `/coach/chats` (spec §7.21 Chats), ported from pulse src/app/(app)/coach/ChatList.tsx via halo:
// New chat, then chats grouped Today / Yesterday / Previous 7 days / Earlier in the person's zone, 30 at a time with
// "Show older chats"; each row's menu holds Delete chat, with a confirmation.
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { router, type Href } from "expo-router";
import { generateId } from "ai";
import { SquarePen, Trash2 } from "lucide-react-native";
import { groupChats, mergeGroups, type ChatCursor, type ChatGroup, type ChatRow } from "@/coach/chats";
import { deleteChat, listChats, subscribe } from "@/coach/storage";
import { queryCtx } from "@/state/app";
import { Card } from "@/ui/Card";
import { Icon } from "@/ui/Icon";
import { Press } from "@/ui/Press";
import { Text } from "@/ui/Text";
import { toast } from "@/ui/Toast";
import { DetailShell } from "@/ui/shells/DetailShell";
import { GROUP_LABEL } from "@/ui/shells/LinkList";
import { BODY, ConfirmDialog, SmallButton } from "@/screens/settings/controls";

const open = (href: string) => router.dismissTo(href as Href);

function group(chats: ChatRow[]): ChatGroup[] {
  const ctx = queryCtx();
  return groupChats(chats, ctx.now, ctx.timeZone);
}

export function ChatsScreen() {
  const [groups, setGroups] = useState<ChatGroup[] | null>(null);
  const [next, setNext] = useState<ChatCursor | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [doomed, setDoomed] = useState<ChatRow | null>(null);

  const load = useCallback(() => {
    listChats().then(
      (r) => {
        setGroups(group(r.chats));
        setNext(r.next);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);
  useEffect(() => {
    load();
    return subscribe(load);
  }, [load]);

  const older = () => {
    if (!next) return;
    setPending(true);
    listChats(next)
      .then((r) => {
        setGroups((g) => mergeGroups(g ?? [], group(r.chats)));
        setNext(r.next);
      })
      .catch(() => toast.error("Couldn’t load older chats."))
      .finally(() => setPending(false));
  };
  const remove = async () => {
    if (!doomed) return;
    setPending(true);
    await deleteChat(doomed.id).catch(() => toast.error("Couldn’t delete that chat. Try again."));
    setPending(false);
    setDoomed(null);
  };

  return (
    <DetailShell
      title="Chats"
      backHref="/coach"
      loading={!groups && !failed}
      primary={
        <View className="gap-6">
          <Press accessibilityRole="button" onPress={() => open(`/coach?n=${generateId()}`)} className="h-12 flex-row items-center gap-2 self-start rounded-xl bg-secondary px-4">
            <Icon icon={SquarePen} size={18} />
            <Text className="text-[15px] font-semibold">New chat</Text>
          </Press>
          {failed ? (
            <Text className={BODY}>Couldn’t read your chats. Try again.</Text>
          ) : groups?.length === 0 ? (
            <Text className={BODY}>Your chats appear here. They’re saved on this phone, visible only to you.</Text>
          ) : (
            groups?.map((g) => (
              <View key={g.label} className="gap-2">
                <Text className={GROUP_LABEL}>{g.label}</Text>
                <Card>
                  {g.chats.map((chat, i) => (
                    <View key={chat.id} className={i > 0 ? "flex-row items-center border-t border-border" : "flex-row items-center"}>
                      <Press accessibilityRole="link" onPress={() => open(`/coach?c=${encodeURIComponent(chat.id)}`)} className="min-h-13 flex-1 justify-center py-3 pl-4">
                        <Text numberOfLines={1} className="text-[15px] font-medium leading-5">
                          {chat.title}
                        </Text>
                      </Press>
                      <Press accessibilityRole="button" accessibilityLabel={`Delete ${chat.title}`} onPress={() => setDoomed(chat)} className="size-11 items-center justify-center">
                        <Icon icon={Trash2} size={16} tone="muted-foreground" />
                      </Press>
                    </View>
                  ))}
                </Card>
              </View>
            ))
          )}
          {next && <SmallButton label={pending ? "Loading…" : "Show older chats"} onPress={older} />}
          <ConfirmDialog
            open={!!doomed}
            title="Delete this chat?"
            description="It’s removed from this phone. This can’t be undone."
            confirmLabel="Delete chat"
            pendingLabel="Deleting…"
            pending={pending}
            onCancel={() => setDoomed(null)}
            onConfirm={() => void remove()}
          />
        </View>
      }
    />
  );
}
