import { ChatService } from "@/services/contracts";
import { Message } from "@/types";

const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const replies = [
  "That’s actually fire 😂",
  "Facts. What are you on today?",
  "Bet, I’m down.",
  "No wayyy 😭",
  "That match was funny fr.",
  "Okay wait, tell me more 👀",
];

export const mockChatService: ChatService = {
  createOutgoing(text: string): Message {
    return {
      id: id("msg"),
      senderId: "me",
      text: text.trim(),
      createdAt: new Date().toISOString(),
      read: true,
      deliveryStatus: "sending",
      reactions: {},
    };
  },
  createSimulatedReply(userId: string): Message {
    return {
      id: id("msg"),
      senderId: userId,
      text: replies[Math.floor(Math.random() * replies.length)],
      createdAt: new Date().toISOString(),
      read: false,
      deliveryStatus: "delivered",
      reactions: {},
    };
  },
};
