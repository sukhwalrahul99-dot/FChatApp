export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  createdAt?: any;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt?: any;
  messageType?: 'text' | 'image' | 'video' | 'document';
  mediaUrl?: string;
  fileName?: string;
  fileType?: string;
  fileSize?: number;
  cloudinaryPublicId?: string;
  resourceType?: string;
  seenBy?: string[];
  notificationSent?: boolean;
}

export interface Conversation {
  id: string;
  members: string[];
  type?: 'single' | 'group';
  groupName?: string;
  createdBy?: string;
  updatedAt?: any;
  lastMessage?: string;
  lastMessageType?: string;
  lastMessageAt?: any;
  unreadCounts?: Record<string, number>;
}